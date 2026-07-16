#!/usr/bin/env python3
"""Evaluate live ReproLab retrieval against explicit gold document IDs.

No scores are invented: every metric is calculated from API responses and the
user-supplied labelled cases.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import statistics
import urllib.error
import urllib.request


def post_json(url: str, payload: dict) -> dict:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(request, timeout=120) as response:
        return json.load(response)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("cases", type=pathlib.Path)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--output", type=pathlib.Path, default=pathlib.Path(".runtime/rag-evaluation.json"))
    args = parser.parse_args()
    source = json.loads(args.cases.read_text(encoding="utf-8"))
    project_id = source["project_id"]
    details = []
    for case in source["cases"]:
        expected = set(case["expected_document_ids"])
        payload = {
            "project_id": project_id,
            "query": case["query"],
            "mode": case.get("mode", "hybrid"),
            "k": case.get("k", 5),
            "filters": case.get("filters"),
        }
        response = post_json(args.base_url.rstrip("/") + "/api/v1/search", payload)
        ranked = [item["document_id"] for item in response.get("hits", [])]
        found = expected.intersection(ranked)
        first_rank = min((ranked.index(item) + 1 for item in found), default=None)
        details.append({
            "name": case.get("name", case["query"]),
            "query": case["query"],
            "expected": sorted(expected),
            "returned": ranked,
            "recall_at_k": len(found) / len(expected) if expected else 0.0,
            "reciprocal_rank": 1 / first_rank if first_rank else 0.0,
        })
    report = {
        "project_id": project_id,
        "cases": len(details),
        "recall_at_k": statistics.fmean(item["recall_at_k"] for item in details) if details else 0.0,
        "mrr": statistics.fmean(item["reciprocal_rank"] for item in details) if details else 0.0,
        "details": details,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
