from __future__ import annotations

import hashlib
import io
import json
import uuid
import zipfile
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.knowledge import Artifact, Dataset, Edge, Run
from app.services import workbench
from app.services.lineage.ledger import get_lineage
from app.services.rag.storage import path_of


def _json_bytes(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True, default=str).encode("utf-8")


def build_reproducibility_bundle(db: Session, project_id: uuid.UUID, run_id: uuid.UUID) -> tuple[str, bytes]:
    run = workbench.project_run(db, project_id, run_id)
    report = workbench.run_report(db, project_id, run_id)
    datasets = list(db.scalars(
        select(Dataset).where(Dataset.project_id == project_id, Dataset.storage_hash.in_(run.input_hashes))
    )) if run.input_hashes else []
    artifacts = list(db.scalars(
        select(Artifact).where(Artifact.project_id == project_id, Artifact.run_id == run.id).order_by(Artifact.created_at)
    ))
    entries: dict[str, bytes] = {
        "README.md": (
            "# ReproLab 可复现研究包\n\n"
            f"运行 ID：`{run.id}`\n\n"
            "本包由现有溯源账本导出，不创建第二套事实来源。"
            "使用 `analysis.py`、`data/`、`environment.json` 和 `manifest.json` 核对并重放。\n"
        ).encode("utf-8"),
        "analysis.py": run.code.encode("utf-8"),
        "run-report.json": _json_bytes(report.model_dump(mode="json")),
        "environment.json": _json_bytes(report.environment),
        "datasets.json": _json_bytes(report.datasets),
        "artifacts.json": _json_bytes([item.model_dump(mode="json") for item in report.artifacts]),
    }
    audit_items = []
    for dataset in datasets:
        raw = path_of(dataset.storage_hash).read_bytes()
        entries[f"data/{dataset.storage_hash}"] = raw
    for artifact in artifacts:
        lineage = get_lineage(db, artifact.id)
        entries[f"lineage/{artifact.id}.json"] = _json_bytes(lineage.model_dump(mode="json", by_alias=True) if lineage else None)
        if artifact.content_hash:
            entries[f"artifacts/{artifact.content_hash}"] = path_of(artifact.content_hash).read_bytes()
        produced = bool(db.scalar(select(Edge.id).where(
            Edge.from_type == "run", Edge.from_id == run.id,
            Edge.to_type == "artifact", Edge.to_id == artifact.id,
            Edge.relation == "produces",
        ).limit(1)))
        audit_items.append({"artifact_id": str(artifact.id), "lineage_present": lineage is not None, "produces_edge": produced})
    entries["bundle-audit.json"] = _json_bytes({
        "run_status": run.status,
        "code_hash": run.code_hash,
        "input_hash": run.input_hash,
        "artifacts": audit_items,
        "passed": run.status == "success" and bool(audit_items) and all(
            item["lineage_present"] and item["produces_edge"] for item in audit_items
        ),
    })
    manifest = {
        "format": "reprolab-reproducibility-bundle-v1",
        "run_id": str(run.id),
        "files": {name: hashlib.sha256(content).hexdigest() for name, content in sorted(entries.items())},
    }
    entries["manifest.json"] = _json_bytes(manifest)
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, content in sorted(entries.items()):
            archive.writestr(name, content)
    return f"reprolab-run-{str(run.id)[:8]}.zip", buffer.getvalue()
