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


@dataclass(frozen=True, slots=True)
class NLIResult:
    label: Literal["entailment", "neutral", "contradiction"]
    support_score: float
    evidence_span: str
    reason: str


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
        "messages": [
            {
                "role": "system",
                "content": (
                    "你是自然语言推理分类器。仅依据前提判断假设，禁止引入外部知识。"
                    "只返回JSON：label为entailment/neutral/contradiction；"
                    "support_score表示前提对假设的支持强度(0到1)；reason简述依据。"
                ),
            },
            {"role": "user", "content": f"前提：\n{premise}\n\n假设：\n{claim_text}"},
        ]
    })
    payload = _JudgePayload.model_validate(_json_object(response.content))
    return NLIResult(payload.label, payload.support_score, _span(chunks[0]), payload.reason)


def passes_threshold(result: NLIResult, threshold: float | None = None) -> bool:
    cutoff = settings.nli_support_threshold if threshold is None else threshold
    return result.label == "entailment" and result.support_score >= cutoff
