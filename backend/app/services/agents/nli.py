import json
import re
import uuid
from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.knowledge import Chunk
from app.services.agents.model_adapter import ModelAdapter, model_adapter
from app.services.rag.embedder import encode


class _JudgePayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    label: Literal["entailment", "neutral", "contradiction"]
    support_score: float = Field(ge=0, le=1)
    reason: str = Field(min_length=1, max_length=1_000)
    evidence_index: int = Field(default=1, ge=1, le=3)


@dataclass(frozen=True, slots=True)
class NLIResult:
    label: Literal["entailment", "neutral", "contradiction"]
    support_score: float
    evidence_span: str
    reason: str


def calibrate_support_threshold(
    samples: list[tuple[bool, NLIResult]],
) -> dict[str, float | int]:
    """Select a conservative entailment threshold from labelled judge outputs."""
    if not samples:
        raise ValueError("NLI calibration requires labelled samples")
    candidates = sorted({
        0.0,
        1.0,
        *(result.support_score for _, result in samples),
        *(min(1.0, result.support_score + 1e-9) for _, result in samples),
    })
    ranked = []
    for threshold in candidates:
        predicted = [
            result.label == "entailment" and result.support_score >= threshold
            for _, result in samples
        ]
        expected = [item[0] for item in samples]
        true_positive = sum(left and right for left, right in zip(expected, predicted, strict=True))
        false_positive = sum(not left and right for left, right in zip(expected, predicted, strict=True))
        false_negative = sum(left and not right for left, right in zip(expected, predicted, strict=True))
        true_negative = len(samples) - true_positive - false_positive - false_negative
        precision = true_positive / (true_positive + false_positive) if true_positive + false_positive else 0.0
        recall = true_positive / (true_positive + false_negative) if true_positive + false_negative else 0.0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        accuracy = (true_positive + true_negative) / len(samples)
        ranked.append((
            f1,
            precision,
            accuracy,
            threshold,
            {
                "threshold": threshold,
                "samples": len(samples),
                "true_positive": true_positive,
                "false_positive": false_positive,
                "false_negative": false_negative,
                "true_negative": true_negative,
                "precision": precision,
                "recall": recall,
                "f1": f1,
                "accuracy": accuracy,
            },
        ))
    # In a trust gate, prefer higher precision and then the stricter threshold
    # when multiple cutoffs have the same F1.
    return max(ranked, key=lambda item: item[:4])[-1]


def _json_object(text: str) -> dict:
    stripped = text.strip()
    fenced = re.fullmatch(r"```(?:json)?\s*(.*?)\s*```", stripped, re.DOTALL | re.IGNORECASE)
    if fenced:
        stripped = fenced.group(1)
    start, end = stripped.find("{"), stripped.rfind("}")
    if start < 0 or end < start:
        raise ValueError("NLI judge did not return a JSON object")
    return json.loads(stripped[start : end + 1])


def _evidence_chunks(db: Session, claim_text: str, document_id: uuid.UUID, limit: int = 3) -> list[Chunk]:
    vector = encode([claim_text])[0]
    distance = Chunk.embedding.cosine_distance(vector)
    return list(db.scalars(
        select(Chunk)
        .where(Chunk.document_id == document_id, Chunk.embedding.is_not(None))
        .order_by(distance)
        .limit(limit)
    ))


def _span(chunk: Chunk) -> str:
    section = chunk.section or "未命名章节"
    position = chunk.position if chunk.position is not None else "—"
    excerpt = " ".join(chunk.content.split())[:800]
    return f"chunk:{chunk.id} · {section} · position {position}\n{excerpt}"


def judge_support(
    db: Session,
    claim_text: str,
    document_id: uuid.UUID,
    adapter: ModelAdapter = model_adapter,
) -> NLIResult:
    chunks = _evidence_chunks(db, claim_text, document_id)
    if not chunks:
        return NLIResult("neutral", 0.0, "文档没有可检索文本切块", "被引文档没有可用于判断的证据段落")
    premise = "\n\n".join(f"[{index + 1}] {item.content}" for index, item in enumerate(chunks))
    response = adapter.chat({
        "model": settings.agent_model_route["critic"],
        "messages": [
            {
                "role": "system",
                "content": (
                    "Use entailment only when the premise directly supports the hypothesis. "
                    "Use contradiction only when the premise explicitly states an incompatible fact. "
                    "Use neutral when the premise is unrelated, silent, or merely lacks support; "
                    "absence of evidence is not contradiction. "
                    "If a premise says that A measures or affects X while the hypothesis says "
                    "that A measures or affects Y, classify it as neutral unless the premise "
                    "explicitly excludes Y or X and Y are logically mutually exclusive. "
                    "By contrast, opposite directions for the same relationship and variables "
                    "(for example increase versus reduce) are contradiction. "
                    "你是自然语言推理分类器。仅依据前提判断假设，禁止引入外部知识。"
                    "只返回JSON：label为entailment/neutral/contradiction；"
                    "support_score表示前提对假设的支持强度(0到1)；"
                    "evidence_index指出最关键的前提编号；reason简述依据。"
                ),
            },
            {"role": "user", "content": f"前提：\n{premise}\n\n假设：\n{claim_text}"},
        ],
        "temperature": 0,
    })
    payload = _JudgePayload.model_validate(_json_object(response.content))
    evidence = chunks[min(payload.evidence_index, len(chunks)) - 1]
    return NLIResult(payload.label, payload.support_score, _span(evidence), payload.reason)


def passes_threshold(result: NLIResult, threshold: float | None = None) -> bool:
    cutoff = settings.nli_support_threshold if threshold is None else threshold
    return result.label == "entailment" and result.support_score >= cutoff
