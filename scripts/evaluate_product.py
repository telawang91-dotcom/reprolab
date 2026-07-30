#!/usr/bin/env python3
"""Run a live, labelled ReproLab evaluation without inventing scores."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import pathlib
import statistics
import time
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

import httpx


def percentile(values: list[float], fraction: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = max(0, min(len(ordered) - 1, math.ceil(fraction * len(ordered)) - 1))
    return round(ordered[index], 2)


def ranked_metrics(ranked: list[str], expected: str, k: int = 5) -> dict[str, float]:
    top = ranked[:k]
    if expected not in top:
        return {"recall_at_5": 0.0, "mrr": 0.0, "ndcg_at_5": 0.0}
    rank = top.index(expected) + 1
    return {
        "recall_at_5": 1.0,
        "mrr": 1.0 / rank,
        "ndcg_at_5": 1.0 / math.log2(rank + 1),
    }


def calibrate_nli_threshold(items: list[dict[str, Any]]) -> dict[str, Any]:
    labelled = [
        (
            item["expected_label"] == "entailment",
            item["predicted_label"] == "entailment",
            float(item["support_score"]),
        )
        for item in items
    ]
    candidates = sorted({
        0.0,
        1.0,
        *(score for _, _, score in labelled),
        *(min(1.0, score + 1e-9) for _, _, score in labelled),
    })
    scored = []
    for threshold in candidates:
        expected = [item[0] for item in labelled]
        predicted = [label and score >= threshold for _, label, score in labelled]
        tp = sum(left and right for left, right in zip(expected, predicted, strict=True))
        fp = sum(not left and right for left, right in zip(expected, predicted, strict=True))
        fn = sum(left and not right for left, right in zip(expected, predicted, strict=True))
        tn = len(items) - tp - fp - fn
        precision = tp / (tp + fp) if tp + fp else 0.0
        recall = tp / (tp + fn) if tp + fn else 0.0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        accuracy = (tp + tn) / len(items)
        scored.append((f1, precision, accuracy, threshold, {
            "suggested_threshold": threshold,
            "precision": precision,
            "recall": recall,
            "f1": f1,
            "binary_accuracy": accuracy,
        }))
    return max(scored, key=lambda item: item[:4])[-1]


class LiveApi:
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")
        # This evaluator targets a locally started ReproLab instance. Inheriting
        # corporate/system proxy variables can incorrectly route 127.0.0.1 and
        # turn an otherwise healthy API into a proxy-generated 502.
        self.client = httpx.Client(timeout=180, trust_env=False)
        self.latencies: dict[str, list[float]] = defaultdict(list)

    def close(self) -> None:
        self.client.close()

    def request(self, category: str, method: str, path: str, **kwargs) -> dict[str, Any]:
        started = time.perf_counter()
        response = self.client.request(method, self.base_url + path, **kwargs)
        self.latencies[category].append((time.perf_counter() - started) * 1000)
        response.raise_for_status()
        return response.json()

    def upload(
        self,
        project_id: str,
        filename: str,
        content: bytes,
        document_type: str = "other",
    ) -> dict[str, Any]:
        return self.request(
            "ingest",
            "POST",
            "/documents",
            data={"project_id": project_id, "type": document_type},
            files={"file": (filename, content)},
        )


def latency_report(latencies: dict[str, list[float]]) -> dict[str, Any]:
    report = {}
    all_values: list[float] = []
    for category, values in sorted(latencies.items()):
        all_values.extend(values)
        report[category] = {
            "requests": len(values),
            "p50_ms": percentile(values, 0.50),
            "p95_ms": percentile(values, 0.95),
            "max_ms": round(max(values, default=0.0), 2),
        }
    report["end_to_end"] = {
        "requests": len(all_values),
        "p50_ms": percentile(all_values, 0.50),
        "p95_ms": percentile(all_values, 0.95),
        "max_ms": round(max(all_values, default=0.0), 2),
    }
    return report


def evaluate(args: argparse.Namespace) -> dict[str, Any]:
    manifest_bytes = args.manifest.read_bytes()
    manifest = json.loads(manifest_bytes)
    if len(manifest["queries"]) < 30:
        raise ValueError("the labelled retrieval set must contain at least 30 queries")

    api = LiveApi(args.base_url.rstrip("/") + "/api/v1")
    project: dict[str, Any] | None = None
    try:
        project = api.request(
            "setup",
            "POST",
            "/projects",
            json={
                "name": f"ReproLab 量化评测 {datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}",
                "description": "自动生成的隔离评测项目；完成后默认归档。",
            },
        )
        project_id = project["id"]
        document_ids = {}
        for document in manifest["documents"]:
            uploaded = api.upload(
                project_id,
                document["filename"],
                document["content"].encode("utf-8"),
                document.get("type", "paper"),
            )
            document_ids[document["filename"]] = uploaded["id"]

        retrieval_details = []
        mode_values: dict[str, list[dict[str, float]]] = defaultdict(list)
        for case in manifest["queries"]:
            expected_id = document_ids[case["expected_filename"]]
            for mode in ("keyword", "semantic", "hybrid"):
                response = api.request(
                    f"search_{mode}",
                    "POST",
                    "/search",
                    json={
                        "project_id": project_id,
                        "query": case["query"],
                        "mode": mode,
                        "filters": {"type": "paper"},
                        "k": 5,
                    },
                )
                ranked = [item["document_id"] for item in response["hits"]]
                metrics = ranked_metrics(ranked, expected_id)
                mode_values[mode].append(metrics)
                retrieval_details.append({
                    "name": case["name"],
                    "mode": mode,
                    "expected_document_id": expected_id,
                    "returned_document_ids": ranked,
                    **metrics,
                })

        retrieval_modes = {
            mode: {
                key: round(statistics.fmean(item[key] for item in values), 6)
                for key in ("recall_at_5", "mrr", "ndcg_at_5")
            }
            for mode, values in mode_values.items()
        }
        hybrid_pass = all(
            retrieval_modes["hybrid"][metric] >= max(
                retrieval_modes["keyword"][metric],
                retrieval_modes["semantic"][metric],
            )
            for metric in ("recall_at_5", "ndcg_at_5")
        )

        original = api.upload(
            project_id,
            "trust-evaluation.csv",
            b"group,value\nA,1\nA,2\nB,3\nB,4\n",
        )
        modified = api.upload(
            project_id,
            "trust-evaluation-modified.csv",
            b"group,value\nA,1\nA,2\nB,30\nB,40\n",
        )
        run = api.request(
            "run",
            "POST",
            "/runs",
            json={
                "project_id": project_id,
                "dataset_ids": [original["dataset_id"]],
                "seed": 42,
                "code": (
                    "df = load_dataset(0)\n"
                    "emit_artifact('number', float(df['value'].mean()), "
                    "title='评测均值', tol=1e-9)"
                ),
            },
        )
        artifact = run["artifacts"][0]
        artifact_id = artifact["artifact_id"]
        value = artifact["value"]
        anchor = f"⟦art_{artifact_id[:4]}⟧"

        reproduction_results = [
            api.request(
                "reproduce",
                "POST",
                f"/runs/{run['run_id']}/reproduce",
                json={"dataset_overrides": {}},
            )
            for _ in range(args.repetitions)
        ]
        drift_result = api.request(
            "reproduce_drift",
            "POST",
            f"/runs/{run['run_id']}/reproduce",
            json={
                "dataset_overrides": {
                    original["storage_hash"]: modified["storage_hash"],
                },
            },
        )

        verify_cases = [
            (f"均值为 {value}{anchor}。", "pass"),
            (f"均值为 {float(value) + 10}{anchor}。", "fail"),
            ("均值为 999。", "fail"),
            (f"复核结果 {value}{anchor}。", "pass"),
            (f"复核结果 {float(value) - 1}{anchor}。", "fail"),
            ("未绑定产物的测量值为 123.45。", "fail"),
        ]
        verification_details = []
        for text, expected in verify_cases:
            response = api.request(
                "verify",
                "POST",
                "/verify",
                json={
                    "project_id": project_id,
                    "text": text,
                    "checks": ["number"],
                    "repair": False,
                },
            )
            verification_details.append({
                "text": text,
                "expected": expected,
                "actual": response["verdict"],
            })
        true_positive = sum(
            item["expected"] == "fail" and item["actual"] == "fail"
            for item in verification_details
        )
        false_positive = sum(
            item["expected"] == "pass" and item["actual"] == "fail"
            for item in verification_details
        )
        false_negative = sum(
            item["expected"] == "fail" and item["actual"] == "pass"
            for item in verification_details
        )
        correct = sum(item["expected"] == item["actual"] for item in verification_details)
        precision = true_positive / (true_positive + false_positive) if true_positive + false_positive else 0.0
        recall = true_positive / (true_positive + false_negative) if true_positive + false_negative else 0.0

        repair = api.request(
            "repair",
            "POST",
            "/verify",
            json={
                "project_id": project_id,
                "text": f"均值为 {float(value) + 100}{anchor}。",
                "checks": ["number"],
                "repair": True,
            },
        )

        nli_report = None
        if args.include_nli:
            nli_details = []
            for case in manifest.get("nli_cases", []):
                document_id = document_ids[case["source_filename"]]
                response = api.request(
                    "verify_nli",
                    "POST",
                    "/verify",
                    json={
                        "project_id": project_id,
                        "text": f"{case['claim']}⟦src_{document_id[:4]}⟧",
                        "checks": ["citation"],
                        "repair": False,
                    },
                )
                item = response["items"][0]
                nli_details.append({
                    "name": case["name"],
                    "expected_label": case["expected_label"],
                    "predicted_label": item["label"],
                    "support_score": item["support_score"],
                    "verdict": item["verdict"],
                    "evidence_span": item["evidence_span"],
                })
            nli_report = {
                "cases": len(nli_details),
                "three_class_accuracy": (
                    sum(item["expected_label"] == item["predicted_label"] for item in nli_details)
                    / len(nli_details)
                ) if nli_details else 0.0,
                "calibration": calibrate_nli_threshold(nli_details) if nli_details else None,
                "details": nli_details,
            }

        report = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "project_id": project_id,
            "manifest_sha256": hashlib.sha256(manifest_bytes).hexdigest(),
            "retrieval": {
                "labelled_queries": len(manifest["queries"]),
                "modes": retrieval_modes,
                "hybrid_not_below_single_route": hybrid_pass,
                "details": retrieval_details,
            },
            "reproduction": {
                "repetitions": args.repetitions,
                "match_count": sum(item["status"] == "match" for item in reproduction_results),
                "consistency_rate": (
                    sum(item["status"] == "match" for item in reproduction_results)
                    / len(reproduction_results)
                ),
                "drift_expected": True,
                "drift_detected": drift_result["status"] == "drift",
            },
            "verification": {
                "cases": len(verification_details),
                "accuracy": correct / len(verification_details),
                "failure_detection_precision": precision,
                "failure_detection_recall": recall,
                "details": verification_details,
            },
            "repair": {
                "success": repair["verdict"] == "pass",
                "iterations": len(repair.get("iterations") or []),
                "claim_status": repair.get("claim_status"),
            },
            "nli": nli_report,
            "latency": latency_report(api.latencies),
        }
        return report
    finally:
        if project is not None and not args.keep_project:
            try:
                api.request("cleanup", "POST", f"/projects/{project['id']}/archive")
            except Exception:
                pass
        api.close()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument(
        "--manifest",
        type=pathlib.Path,
        default=pathlib.Path("benchmarks/product-evaluation.json"),
    )
    parser.add_argument(
        "--output",
        type=pathlib.Path,
        default=pathlib.Path(".runtime/product-evaluation.json"),
    )
    parser.add_argument("--repetitions", type=int, default=3)
    parser.add_argument(
        "--include-nli",
        action="store_true",
        help="also call the configured critic model on labelled citation cases",
    )
    parser.add_argument("--keep-project", action="store_true")
    args = parser.parse_args()
    if args.repetitions < 1:
        parser.error("--repetitions must be at least 1")
    report = evaluate(args)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    # Keep the on-disk report human-readable UTF-8 while remaining safe on
    # legacy Windows consoles that still default to GBK.
    print(json.dumps(report, ensure_ascii=True, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
