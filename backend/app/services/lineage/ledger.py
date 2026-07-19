import uuid
from collections import deque
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.knowledge import Artifact, Claim, Dataset, Document, Edge, EnvSnapshot, Run
from app.schemas.lineage import LineageEdge, LineageNode, LineageResponse
from app.schemas.runs import ArtifactCapture


def _value_json(capture: ArtifactCapture) -> Any:
    if capture.kind in {"number", "coefficient"}:
        return {"value": capture.value, "mime_type": capture.mime_type}
    if capture.kind == "table":
        return {"data": capture.value, "mime_type": capture.mime_type}
    if capture.kind == "figure":
        # PNG is retained for display; reproduction deliberately ignores its bytes.
        return {"mime_type": capture.mime_type, "figure_data": capture.value}
    return {"text": capture.value, "mime_type": capture.mime_type}


def register_run_outputs(db: Session, run: Run, captures: list[ArtifactCapture]) -> list[ArtifactCapture]:
    datasets = list(
        db.scalars(
            select(Dataset).where(
                Dataset.project_id == run.project_id,
                Dataset.storage_hash.in_(run.input_hashes),
            )
        )
    ) if run.input_hashes else []
    by_hash = {item.storage_hash: item for item in datasets}
    missing = [item for item in run.input_hashes if item not in by_hash]
    if missing:
        raise ValueError("dataset hashes are not registered in project: " + ", ".join(missing))
    for storage_hash in run.input_hashes:
        db.add(
            Edge(
                from_type="dataset",
                from_id=by_hash[storage_hash].id,
                to_type="run",
                to_id=run.id,
                relation="reads",
            )
        )

    registered: list[ArtifactCapture] = []
    for index, capture in enumerate(captures, start=1):
        kind = capture.kind
        artifact = Artifact(
            project_id=run.project_id,
            run_id=run.id,
            kind=kind,
            title=capture.title or f"{kind} {index}",
            value_json=_value_json(capture),
            content_hash=capture.storage_hash,
            tol=capture.tol if capture.tol is not None else (1e-6 if kind in {"number", "coefficient", "table", "figure"} else None),
        )
        db.add(artifact)
        db.flush()
        db.add(
            Edge(
                from_type="run",
                from_id=run.id,
                to_type="artifact",
                to_id=artifact.id,
                relation="produces",
            )
        )
        registered.append(capture.model_copy(update={"artifact_id": artifact.id, "kind": kind}))
    return registered


def artifacts_of(db: Session, run_id: uuid.UUID) -> list[Artifact]:
    return list(db.scalars(select(Artifact).where(Artifact.run_id == run_id).order_by(Artifact.created_at, Artifact.id)))


def _node(db: Session, node_type: str, node_id: uuid.UUID) -> LineageNode | None:
    if node_type == "dataset":
        item = db.get(Dataset, node_id)
        return None if item is None else LineageNode(
            id=item.id,
            type="dataset",
            label=item.name,
            meta={"storage_hash": item.storage_hash, "schema_json": item.schema_json},
        )
    if node_type == "run":
        item = db.get(Run, node_id)
        environment = db.get(EnvSnapshot, item.env_snapshot_id) if item is not None and item.env_snapshot_id else None
        return None if item is None else LineageNode(
            id=item.id,
            type="run",
            label=f"Run {str(item.id)[:8]}",
            meta={
                "code": item.code,
                "code_hash": item.code_hash,
                "status": item.status,
                "seed": item.seed,
                "python_version": environment.python_version if environment else None,
                "env_hash": environment.env_hash if environment else None,
                "packages": environment.packages if environment else [],
                "created_at": item.created_at,
            },
        )
    if node_type == "artifact":
        item = db.get(Artifact, node_id)
        return None if item is None else LineageNode(
            id=item.id,
            type="artifact",
            label=item.title or item.kind,
            meta={"kind": item.kind, "content_hash": item.content_hash, "tol": item.tol, "value_json": item.value_json},
        )
    if node_type == "claim":
        item = db.get(Claim, node_id)
        return None if item is None else LineageNode(
            id=item.id,
            type="claim",
            label=item.text.splitlines()[0][:120] or "可信结论",
            meta={"status": item.status, "text": item.text, "created_at": item.created_at},
        )
    if node_type == "document":
        item = db.get(Document, node_id)
        return None if item is None else LineageNode(
            id=item.id,
            type="document",
            label=item.title or item.filename,
            meta={"doi": item.doi, "storage_hash": item.storage_hash},
        )
    return None


def get_lineage(db: Session, artifact_id: uuid.UUID) -> LineageResponse | None:
    if db.get(Artifact, artifact_id) is None:
        return None
    root = ("artifact", artifact_id)
    visited: set[tuple[str, uuid.UUID]] = {root}
    edge_map: dict[uuid.UUID, Edge] = {}

    def walk(direction: str) -> None:
        queue_: deque[tuple[str, uuid.UUID]] = deque([root])
        expanded: set[tuple[str, uuid.UUID]] = set()
        while queue_:
            node_type, node_id = queue_.popleft()
            if (node_type, node_id) in expanded:
                continue
            expanded.add((node_type, node_id))
            if direction == "upstream":
                adjacent = db.scalars(select(Edge).where(
                    Edge.to_type == node_type,
                    Edge.to_id == node_id,
                ))
                next_node = lambda edge: (edge.from_type, edge.from_id)
            else:
                adjacent = db.scalars(select(Edge).where(
                    Edge.from_type == node_type,
                    Edge.from_id == node_id,
                ))
                next_node = lambda edge: (edge.to_type, edge.to_id)
            for edge in adjacent:
                edge_map[edge.id] = edge
                target = next_node(edge)
                visited.add(target)
                queue_.append(target)

    # Show only the selected result's own evidence chain and the conclusions it
    # supports. Traversing both directions at every node would cross the shared
    # dataset and pull every unrelated run in the project into this view.
    walk("upstream")
    walk("downstream")
    nodes = [node for item in sorted(visited, key=lambda value: (value[0], str(value[1]))) if (node := _node(db, *item))]
    edges = [
        LineageEdge(from_=edge.from_id, to=edge.to_id, relation=edge.relation)
        for edge in sorted(edge_map.values(), key=lambda item: str(item.id))
    ]
    return LineageResponse(nodes=nodes, edges=edges)


def resolve_inputs(db: Session, run: Run, overrides: dict[str, str]) -> list[str]:
    unknown = sorted(set(overrides) - set(run.input_hashes))
    if unknown:
        raise ValueError("override keys are not run inputs: " + ", ".join(unknown))
    resolved = [overrides.get(item, item) for item in run.input_hashes]
    datasets = list(
        db.scalars(
            select(Dataset).where(
                Dataset.project_id == run.project_id,
                Dataset.storage_hash.in_(resolved),
            )
        )
    ) if resolved else []
    available = {item.storage_hash for item in datasets}
    missing = [item for item in resolved if item not in available]
    if missing:
        raise ValueError("override datasets are not registered in project: " + ", ".join(missing))
    return resolved
