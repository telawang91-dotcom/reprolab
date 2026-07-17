import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.knowledge import Artifact, Chunk, Claim, Document, Edge
from app.services.agents.anchors import extract_anchors
from app.services.rag.embedder import encode
from app.services.rag.storage import save_bytes


def _resolve_unique(items: list, code: str, kind: str):
    matches = [item for item in items if str(item.id).lower().startswith(code)]
    if len(matches) != 1:
        reason = "不存在" if not matches else "短码不唯一"
        raise ValueError(f"{kind} anchor {code} {reason}")
    return matches[0]


def _edge_once(db: Session, from_type: str, from_id: uuid.UUID, to_type: str, to_id: uuid.UUID, relation: str) -> None:
    existing = db.scalar(select(Edge.id).where(
        Edge.from_type == from_type, Edge.from_id == from_id,
        Edge.to_type == to_type, Edge.to_id == to_id, Edge.relation == relation,
    ))
    if existing is None:
        db.add(Edge(from_type=from_type, from_id=from_id, to_type=to_type, to_id=to_id, relation=relation))


def write_back_conclusion(
    db: Session,
    project_id: uuid.UUID,
    claim_text: str,
    anchors: list[str],
    status: str,
) -> uuid.UUID:
    if status != "verified":
        raise ValueError("only verified conclusions can be written back")
    parsed = [f"{item.kind}_{item.code}" for item in extract_anchors(claim_text)]
    if set(parsed) != set(anchors) or len(parsed) != len(anchors):
        raise ValueError("anchors must exactly match the inline anchors in claim_text")
    if not any(item.startswith("art_") for item in anchors):
        raise ValueError("a verified conclusion must reference at least one artifact")

    project_artifacts = list(db.scalars(select(Artifact).where(Artifact.project_id == project_id)))
    project_documents = list(db.scalars(select(Document).where(Document.project_id == project_id)))
    resolved_artifacts = [_resolve_unique(project_artifacts, item.split("_", 1)[1], "artifact") for item in anchors if item.startswith("art_")]
    resolved_documents = [_resolve_unique(project_documents, item.split("_", 1)[1], "document") for item in anchors if item.startswith("src_")]

    raw = claim_text.encode("utf-8")
    storage_hash = save_bytes(raw)
    document = Document(
        project_id=project_id,
        type="note",
        filename=f"conclusion-{uuid.uuid4().hex[:8]}.md",
        storage_hash=storage_hash,
        title=claim_text.splitlines()[0][:200],
        extra_metadata={"kind": "verified_conclusion", "anchors": anchors},
    )
    db.add(document)
    db.flush()
    vector = encode([claim_text])[0]
    db.add(Chunk(document_id=document.id, content=claim_text, embedding=vector, section="Verified conclusion", position=0))

    claim = db.scalar(select(Claim).where(Claim.project_id == project_id, Claim.text == claim_text))
    if claim is None:
        claim = Claim(project_id=project_id, text=claim_text, doc_id=document.id, status="verified")
        db.add(claim)
        db.flush()
    else:
        claim.doc_id = document.id
        claim.status = "verified"
    for artifact in resolved_artifacts:
        artifact.saved_at = artifact.saved_at or datetime.now(timezone.utc)
        _edge_once(db, "artifact", artifact.id, "claim", claim.id, "supports")
    for source in resolved_documents:
        _edge_once(db, "claim", claim.id, "document", source.id, "cites")
    db.commit()
    return document.id
