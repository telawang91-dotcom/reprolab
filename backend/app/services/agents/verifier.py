import re
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.knowledge import Artifact, Claim, Document, Edge, Run
from app.schemas.verify import VerifyItem, VerifyResponse
from app.services.agents.anchors import AnchorRef, context_at, extract_anchors, extract_numbers, locate
from app.services.agents.model_adapter import ModelAdapter, model_adapter
from app.services.agents.nli import judge_support, passes_threshold
from app.services.lineage.compare import artifact_value
from app.services.lineage.reproduce import reproduce
from app.services.rag.storage import read_bytes


def _short_matches(items: list[Any], code: str) -> list[Any]:
    return [item for item in items if str(item.id).lower().startswith(code.lower())]


def _item(check: str, anchor: str | None, passed: bool, reason: str, location: str, severity: str = "error", **extra) -> VerifyItem:
    return VerifyItem(
        check=check,
        target_anchor=anchor,
        verdict="pass" if passed else "fail",
        severity=severity,
        reason=reason,
        locate=location,
        **extra,
    )


def check_citations(db: Session, project_id: uuid.UUID, text: str, adapter: ModelAdapter = model_adapter) -> list[VerifyItem]:
    documents = list(db.scalars(select(Document).where(Document.project_id == project_id)))
    items: list[VerifyItem] = []
    for anchor in [item for item in extract_anchors(text) if item.kind == "src"]:
        matches = _short_matches(documents, anchor.code)
        location = locate(text, anchor.start, anchor.end)
        if not matches:
            items.append(_item("citation", anchor.raw, False, "引用不在知识库中，疑似幻觉引用", location))
            continue
        if len(matches) > 1:
            items.append(_item("citation", anchor.raw, False, "引用短码不唯一，无法可靠定位文献", location))
            continue
        document = matches[0]
        claim_context = context_at(text, anchor.start, anchor.end, radius=120)
        try:
            result = judge_support(db, claim_context, document.id, adapter)
        except (RuntimeError, ValueError) as exc:
            items.append(_item(
                "citation", anchor.raw, False, f"NLI 语义支持度校验不可用：{exc}", location,
                severity="warn", label="neutral", support_score=0.0,
            ))
            continue
        supported = passes_threshold(result)
        if not supported:
            label_reason = "内容不支持，疑似张冠李戴" if result.label == "neutral" else "文献证据与论断矛盾"
            items.append(_item(
                "citation", anchor.raw, False,
                f"{label_reason}（{result.label}, {result.support_score:.2f}）：{result.reason}",
                location, label=result.label, support_score=result.support_score,
                evidence_span=result.evidence_span,
            ))
            continue
        doi_warning = bool(document.doi and not re.fullmatch(r"10\.\d{4,9}/\S+", document.doi))
        items.append(_item(
            "citation",
            anchor.raw,
            True,
            "引用存在且文献证据支持该论断" + ("；DOI 格式异常，已降级为警告" if doi_warning else ""),
            location,
            severity="warn" if doi_warning else "error",
            label=result.label,
            support_score=result.support_score,
            evidence_span=result.evidence_span,
        ))
    return items


def _has_complete_lineage(db: Session, artifact: Artifact, run: Run) -> bool:
    produced = db.scalar(select(Edge.id).where(
        Edge.from_type == "run", Edge.from_id == run.id,
        Edge.to_type == "artifact", Edge.to_id == artifact.id, Edge.relation == "produces",
    ))
    read = db.scalar(select(Edge.id).where(
        Edge.from_type == "dataset", Edge.to_type == "run", Edge.to_id == run.id, Edge.relation == "reads",
    ))
    return produced is not None and read is not None


def _numeric_values(value: Any) -> list[float]:
    if isinstance(value, bool):
        return []
    if isinstance(value, (int, float)):
        return [float(value)]
    if isinstance(value, list):
        return [number for item in value for number in _numeric_values(item)]
    if isinstance(value, dict):
        return [number for item in value.values() for number in _numeric_values(item)]
    return []


def check_numbers(db: Session, project_id: uuid.UUID, text: str) -> list[VerifyItem]:
    artifacts = list(db.scalars(select(Artifact).where(Artifact.project_id == project_id)))
    items: list[VerifyItem] = []
    for number in extract_numbers(text):
        location = locate(text, number.start, number.anchor.end if number.anchor else number.end)
        if number.anchor is None:
            items.append(_item("number", None, False, f"裸数字 {number.raw} 无 ⟦art_*⟧ 锚点，来路不明", location))
            continue
        matches = _short_matches(artifacts, number.anchor.code)
        if len(matches) != 1:
            reason = "产物锚点不存在" if not matches else "产物短码不唯一"
            items.append(_item("number", number.anchor.raw, False, reason, location))
            continue
        artifact = matches[0]
        if artifact.kind not in {"number", "coefficient", "table"}:
            items.append(_item("number", number.anchor.raw, False, f"数字不能绑定 {artifact.kind} 类型产物", location))
            continue
        run = db.get(Run, artifact.run_id) if artifact.run_id else None
        if run is None or run.status != "success":
            items.append(_item("number", number.anchor.raw, False, "产物未绑定成功的代码执行", location))
            continue
        if not _has_complete_lineage(db, artifact, run):
            items.append(_item("number", number.anchor.raw, False, "产物缺少 Dataset→Run→Artifact 完整血缘", location))
            continue
        stored = artifact_value(artifact)
        candidates = _numeric_values(stored)
        if not candidates:
            items.append(_item("number", number.anchor.raw, False, "产物未存储可核查的标量值", location))
            continue
        tolerance = artifact.tol if artifact.tol is not None else 1e-6
        matched = next((value for value in candidates if abs(number.value - value) <= tolerance * max(1.0, abs(value))), None)
        within = matched is not None
        reference = matched if matched is not None else min(candidates, key=lambda value: abs(number.value - value))
        items.append(_item(
            "number", number.anchor.raw, within,
            f"正文数字 {number.value:g} 与产物值 {reference:g}" + (" 在容差内一致" if within else f" 不符（tol={tolerance:g}）"),
            location,
        ))
    return items


def check_figures(db: Session, project_id: uuid.UUID, text: str) -> list[VerifyItem]:
    artifacts = list(db.scalars(select(Artifact).where(Artifact.project_id == project_id, Artifact.kind == "figure")))
    items: list[VerifyItem] = []
    seen_runs: dict[uuid.UUID, Any] = {}
    for anchor in [item for item in extract_anchors(text) if item.kind == "art"]:
        matches = _short_matches(artifacts, anchor.code)
        if not matches:
            continue
        location = locate(text, anchor.start, anchor.end)
        if len(matches) > 1:
            items.append(_item("figure", anchor.raw, False, "图表产物短码不唯一", location))
            continue
        artifact = matches[0]
        if artifact.run_id not in seen_runs:
            try:
                seen_runs[artifact.run_id] = reproduce(db, artifact.run_id, {})
            except Exception as exc:
                items.append(_item("figure", anchor.raw, False, f"图表重放失败：{exc}", location))
                continue
        result = seen_runs[artifact.run_id]
        comparison = next((item for item in result.comparisons if item.artifact_id == artifact.id), None)
        passed = bool(comparison and comparison.within_tol)
        items.append(_item(
            "figure", anchor.raw, passed,
            "图表结构化数据重放一致" if passed else "图表结构化数据与代码重放结果不一致",
            location,
        ))
    return items


def _document_text(db: Session, project_id: uuid.UUID, document_id: uuid.UUID) -> str:
    document = db.get(Document, document_id)
    if document is None or document.project_id != project_id:
        raise LookupError("document not found")
    try:
        return read_bytes(document.storage_hash).decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ValueError("doc_id must reference a UTF-8 writing document") from exc


def verify(
    db: Session,
    project_id: uuid.UUID,
    text: str | None,
    doc_id: uuid.UUID | None,
    checks: list[str],
    adapter: ModelAdapter = model_adapter,
) -> VerifyResponse:
    content = text if text is not None else _document_text(db, project_id, doc_id)
    items: list[VerifyItem] = []
    if "citation" in checks:
        items.extend(check_citations(db, project_id, content, adapter))
    if "number" in checks:
        items.extend(check_numbers(db, project_id, content))
    if "figure" in checks:
        items.extend(check_figures(db, project_id, content))
    verdict = "fail" if any(item.verdict == "fail" for item in items) else "pass"
    claim_status = None
    if doc_id is not None:
        claim_status = "verified" if verdict == "pass" else "flagged"
        claims = list(db.scalars(select(Claim).where(Claim.project_id == project_id, Claim.doc_id == doc_id)))
        for claim in claims:
            claim.status = claim_status
        db.commit()
    return VerifyResponse(verdict=verdict, items=items, claim_status=claim_status)
