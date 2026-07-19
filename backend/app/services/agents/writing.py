import json
import re
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.knowledge import Artifact
from app.services.agents.anchors import extract_numbers
from app.services.agents.model_adapter import ModelAdapter, model_adapter
from app.services.lineage.compare import artifact_value

ANCHOR = re.compile(r"⟦(art_[0-9a-fA-F]{4})⟧")


def _normalize_anchor_punctuation(text: str) -> str:
    return re.sub(r"([。！？!?])\s*(⟦art_[0-9a-fA-F]{4}⟧)", r" \2\1", text)


def _numbers(value) -> list[float]:
    if isinstance(value, bool):
        return []
    if isinstance(value, (int, float)):
        return [float(value)]
    if isinstance(value, list):
        return [number for item in value for number in _numbers(item)]
    if isinstance(value, dict):
        return [number for item in value.values() for number in _numbers(item)]
    return []


def _unsupported_number_refs(text: str, items: list[Artifact]):
    by_code = {str(item.id)[:4].lower(): item for item in items}
    unsupported = []
    for number in extract_numbers(text):
        artifact = by_code.get(number.anchor.code) if number.anchor else None
        values = _numbers(artifact_value(artifact)) if artifact is not None else []
        if not any(abs(number.value - value) <= 1e-9 * max(1.0, abs(value)) for value in values):
            unsupported.append(number)
    return unsupported


def _unsupported_numbers(text: str, items: list[Artifact]) -> list[str]:
    return list(dict.fromkeys(number.raw for number in _unsupported_number_refs(text, items)))


def _drop_unsupported_lines(text: str, items: list[Artifact]) -> str:
    refs = _unsupported_number_refs(text, items)
    if not refs:
        return text
    bad_lines = {text.count("\n", 0, number.start) for number in refs}
    return "\n".join(line for index, line in enumerate(text.splitlines()) if index not in bad_lines).strip()


def _fallback(items: list[Artifact]) -> str:
    evidence = "\n".join(
        f"- {item.title or '分析成果'} ⟦art_{str(item.id)[:4]}⟧" for item in items
    )
    return (
        "# 项目研究报告\n\n"
        "## 研究问题\n请在这里说明本次研究希望回答的问题。\n\n"
        "## 数据与方法\n本报告仅使用已保存且具有完整血缘的分析成果。\n\n"
        f"## 关键发现\n{evidence}\n\n"
        "## 研究限制\n当前结果用于描述数据中的模式与关联，不应在缺少额外证据时解释为因果关系。\n\n"
        "## 结论\n请结合研究问题审阅上述证据后完善结论。"
    )


def generate_writing_draft(
    db: Session,
    project_id: uuid.UUID,
    adapter: ModelAdapter = model_adapter,
) -> tuple[str, list[str]]:
    items = list(db.scalars(
        select(Artifact)
        .where(Artifact.project_id == project_id, Artifact.saved_at.is_not(None))
        .order_by(Artifact.saved_at.desc(), Artifact.created_at.desc())
        .limit(12)
    ))
    if not items:
        raise ValueError("请先从分析对话中保存至少一项有价值的成果")
    allowed = {f"art_{str(item.id)[:4].lower()}" for item in items}
    evidence = [
        {
            "anchor": f"⟦art_{str(item.id)[:4]}⟧",
            "kind": item.kind,
            "title": item.title,
            "value": item.value_json,
        }
        for item in items
    ]
    response = adapter.chat({
        "model": settings.critic_model,
        "temperature": 0.2,
        "max_tokens": 1800,
        "messages": [
            {
                "role": "system",
                "content": (
                    "你是科研报告编辑。根据用户主动保存的可信成果生成简洁、正式的中文 Markdown 草稿。"
                    "结构必须包含：研究问题、数据与方法、关键发现、研究限制、结论。"
                    "只使用提供的事实；每个数字或图表判断必须在同一句中带对应的 ⟦art_xxxx⟧。"
                    "数字必须逐字采用证据中的精确值，不得改写成约数、阈值或自行补充单位；Markdown 有序列表请改用项目符号。"
                    "不得创造新锚点，不得输出代码，不得把相关性写成因果关系。"
                ),
            },
            {
                "role": "user",
                "content": "已保存成果：\n" + json.dumps(evidence, ensure_ascii=False, default=str)[:24000],
            },
        ],
    })
    text = _normalize_anchor_punctuation(response.content.strip() or _fallback(items))
    for _ in range(2):
        unsupported = _unsupported_numbers(text, items)
        if not unsupported:
            break
        repaired = adapter.chat({
            "model": settings.critic_model,
            "temperature": 0,
            "max_tokens": 1800,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "你是科研报告校对员。完整重写给定 Markdown 草稿，只删除或改正未被证据精确支持的数字。"
                        "每个保留数字必须逐字来自证据，并在同一句句号之前保留对应 ⟦art_xxxx⟧；不得新增事实或锚点。"
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"不受支持的数字：{json.dumps(unsupported, ensure_ascii=False)}\n"
                        f"证据：{json.dumps(evidence, ensure_ascii=False, default=str)[:24000]}\n"
                        f"待修订草稿：\n{text}"
                    ),
                },
            ],
        })
        candidate = _normalize_anchor_punctuation(repaired.content.strip())
        if candidate:
            text = candidate
    if _unsupported_numbers(text, items):
        text = _drop_unsupported_lines(text, items)
    if _unsupported_numbers(text, items) or not ANCHOR.search(text):
        text = _fallback(items)
    used = [code.lower() for code in ANCHOR.findall(text) if code.lower() in allowed]
    used = list(dict.fromkeys(used))
    if not used:
        text = _fallback(items)
        used = [f"art_{str(item.id)[:4].lower()}" for item in items]
    return text, used
