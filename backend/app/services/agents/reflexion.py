import uuid
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.knowledge import Artifact, Chunk, Claim, Document
from app.schemas.verify import RepairIteration, VerifyItem, VerifyResponse
from app.services.agents.anchors import context_at, extract_anchors, extract_numbers
from app.services.agents.model_adapter import ModelAdapter, model_adapter
from app.services.agents.nli import judge_support, passes_threshold
from app.services.agents.verifier import _document_text, _short_matches, verify
from app.services.lineage.compare import artifact_value
from app.services.rag.embedder import encode
from app.services.rag.storage import save_bytes


def build_reflection(fails: list[VerifyItem]) -> str:
    return "；".join(
        f"{item.check}:{item.target_anchor or '无锚点'} → {item.reason}" for item in fails
    )


def _repair_numbers(
    db: Session, project_id: uuid.UUID, text: str, fails: list[VerifyItem]
) -> tuple[str, list[str]]:
    eligible = {
        item.target_anchor.lower()
        for item in fails
        if item.check == "number" and item.target_anchor and "不符" in item.reason
    }
    if not eligible:
        return text, []
    artifacts = list(db.scalars(select(Artifact).where(Artifact.project_id == project_id)))
    replacements: list[tuple[int, int, str, str]] = []
    for number in extract_numbers(text):
        if number.anchor is None or number.anchor.raw.lower() not in eligible:
            continue
        matches = _short_matches(artifacts, number.anchor.code)
        if len(matches) != 1:
            continue
        value = artifact_value(matches[0])
        if not isinstance(value, (int, float)):
            continue
        formatted = format(float(value), ".15g")
        replacements.append((number.start, number.end, formatted, number.raw))
    actions: list[str] = []
    for start, end, value, old in sorted(replacements, reverse=True):
        text = text[:start] + value + text[end:]
        actions.append(f"用账本产物真实值 {value} 替换 {old}")
    return text, list(reversed(actions))


def _candidate_documents(
    db: Session, project_id: uuid.UUID, claim_text: str, limit: int = 12
) -> list[Document]:
    vector = encode([claim_text])[0]
    distance = Chunk.embedding.cosine_distance(vector)
    rows = db.execute(
        select(Document)
        .join(Chunk, Chunk.document_id == Document.id)
        .where(
            Document.project_id == project_id,
            Document.type == "paper",
            Chunk.embedding.is_not(None),
        )
        .order_by(distance)
        .limit(limit)
    )
    unique: dict[uuid.UUID, Document] = {}
    for document in rows.scalars():
        unique.setdefault(document.id, document)
    return list(unique.values())


def _unique_source_anchor(document: Document, documents: list[Document]) -> str | None:
    code = str(document.id)[:4]
    if sum(str(item.id).startswith(code) for item in documents) != 1:
        return None
    return f"⟦src_{code}⟧"


def _repair_citations(
    db: Session,
    project_id: uuid.UUID,
    text: str,
    fails: list[VerifyItem],
    adapter: ModelAdapter,
) -> tuple[str, list[str]]:
    documents = list(db.scalars(select(Document).where(Document.project_id == project_id)))
    actions: list[str] = []
    for failure in [item for item in fails if item.check == "citation" and item.target_anchor]:
        anchor = next(
            (item for item in extract_anchors(text) if item.raw.lower() == failure.target_anchor.lower()),
            None,
        )
        if anchor is None:
            continue
        claim_text = context_at(text, anchor.start, anchor.end, radius=160)
        current_ids = {item.id for item in _short_matches(documents, anchor.code)}
        replacement: str | None = None
        for document in _candidate_documents(db, project_id, claim_text):
            if document.id in current_ids:
                continue
            candidate_anchor = _unique_source_anchor(document, documents)
            if candidate_anchor is None:
                continue
            try:
                result = judge_support(db, claim_text, document.id, adapter)
            except (RuntimeError, ValueError):
                continue
            if passes_threshold(result):
                replacement = candidate_anchor
                break
        if replacement:
            text = text[:anchor.start] + replacement + text[anchor.end:]
            actions.append(f"将不支持的引用 {anchor.raw} 替换为库内 NLI 支持引用 {replacement}")
        elif "不可用" not in failure.reason:
            text = text[:anchor.start] + text[anchor.end:]
            actions.append(f"移除未获库内证据支持的引用 {anchor.raw}")
    return text, actions


def _persist_document(db: Session, document_id: uuid.UUID, text: str) -> None:
    document = db.get(Document, document_id)
    if document is None:
        return
    document.storage_hash = save_bytes(text.encode("utf-8"))
    db.execute(delete(Chunk).where(Chunk.document_id == document_id))
    db.add(Chunk(
        document_id=document_id,
        content=text,
        embedding=encode([text])[0],
        section="Repaired conclusion",
        position=0,
    ))


def repair_loop(
    db: Session,
    project_id: uuid.UUID,
    text: str | None,
    doc_id: uuid.UUID | None,
    checks: list[str],
    max_iters: int | None = None,
    adapter: ModelAdapter = model_adapter,
) -> VerifyResponse:
    original_text = text if text is not None else _document_text(db, project_id, doc_id)
    current = original_text
    identity = Claim.doc_id == doc_id if doc_id is not None else Claim.text == original_text
    claim = db.scalar(select(Claim).where(Claim.project_id == project_id, identity))
    if claim is None:
        claim = Claim(
            project_id=project_id,
            doc_id=doc_id,
            text=original_text,
            status="unverified",
            repair_count=0,
            repair_meta={},
        )
        db.add(claim)
        db.flush()

    iterations: list[RepairIteration] = []
    audit: list[dict[str, Any]] = []
    for round_number in range(1, (max_iters or settings.repair_max_iterations) + 1):
        report = verify(db, project_id, current, None, checks, adapter)
        fails = [item for item in report.items if item.verdict == "fail"]
        if not fails:
            break
        reflection = build_reflection(fails)
        repaired, actions = _repair_numbers(db, project_id, current, fails)
        repaired, citation_actions = _repair_citations(
            db, project_id, repaired, fails, adapter
        )
        actions.extend(citation_actions)
        action = "；".join(actions) if actions else "没有满足可信约束的自动修复动作，保留标红"
        iterations.append(RepairIteration(round=round_number, fails=len(fails), repair_action=action))
        audit.append({
            "round": round_number,
            "reflection": reflection,
            "fails": [item.model_dump(mode="json") for item in fails],
            "repair_action": action,
        })
        if repaired == current:
            break
        current = repaired

    final = verify(db, project_id, current, None, checks, adapter)
    status = "verified" if final.verdict == "pass" else "flagged"
    claim.text = current
    claim.status = status
    claim.repair_count = (claim.repair_count or 0) + len(iterations)
    claim.repair_meta = {"original_text": original_text, "iterations": audit}
    if doc_id is not None and current != original_text:
        _persist_document(db, doc_id, current)
    db.commit()
    return final.model_copy(update={
        "iterations": iterations,
        "claim_status": status,
        "repaired_text": current,
    })
