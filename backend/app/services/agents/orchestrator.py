import json
import re
import uuid
from collections.abc import AsyncIterator
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models.knowledge import Artifact, Conversation, Dataset, Message
from app.models.skills import Skill
from app.schemas.chat import ChatRequest, PlanStep, SSEEvent
from app.services.agents.runtime import run_agent
from app.services.sandbox.runner import run_with_retry
from app.services.memory.recall import memory_context, recall_memories
from app.services.skills.store import ensure_builtins


def _json_object(text: str) -> dict[str, Any]:
    stripped = text.strip()
    fenced = re.fullmatch(r"```(?:json)?\s*(.*?)\s*```", stripped, re.DOTALL | re.IGNORECASE)
    if fenced:
        stripped = fenced.group(1)
    start, end = stripped.find("{"), stripped.rfind("}")
    if start < 0 or end < start:
        raise ValueError("model did not return a JSON object")
    return json.loads(stripped[start : end + 1])


def _code(text: str) -> str:
    stripped = text.strip()
    fenced = re.fullmatch(r"```(?:python)?\s*(.*?)\s*```", stripped, re.DOTALL | re.IGNORECASE)
    return fenced.group(1).strip() if fenced else stripped


def _event(name: str, data: dict[str, Any]) -> SSEEvent:
    return SSEEvent(event=name, data=data)


def _conversation(db: Session, request: ChatRequest) -> Conversation:
    if request.conversation_id is not None:
        conversation = db.get(Conversation, request.conversation_id)
        if conversation is None:
            raise LookupError("conversation not found")
        if conversation.project_id != request.project_id:
            raise PermissionError("conversation belongs to another project")
        return conversation
    conversation = Conversation(project_id=request.project_id, title=request.message[:80])
    db.add(conversation)
    db.flush()
    return conversation


def _history(db: Session, conversation_id: uuid.UUID) -> list[dict[str, str]]:
    rows = db.scalars(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at, Message.id)
    )
    return [{"role": item.role, "content": item.content or ""} for item in rows]


def _dataset_context(db: Session, request: ChatRequest) -> str:
    if not request.dataset_ids:
        return "未选择数据集。若任务需要计算，应在计划中说明。"
    datasets = list(db.scalars(select(Dataset).where(Dataset.id.in_(request.dataset_ids))))
    by_id = {item.id: item for item in datasets}
    missing = [str(item) for item in request.dataset_ids if item not in by_id]
    if missing:
        raise ValueError("dataset not found: " + ", ".join(missing))
    return json.dumps(
        [
            {"index": index, "name": item.name, "schema": item.schema_json}
            for index, item in enumerate(by_id[dataset_id] for dataset_id in request.dataset_ids)
        ],
        ensure_ascii=False,
    )


def _skill_context(db: Session, request: ChatRequest) -> str:
    if request.skill_id is None:
        return "未选择技能包；继续按用户请求动态规划，不限制分析类型。"
    ensure_builtins(db)
    skill = db.scalar(select(Skill).where(
        Skill.id == request.skill_id,
        or_(Skill.project_id.is_(None), Skill.project_id == request.project_id),
    ))
    if skill is None:
        raise ValueError("skill not found or unavailable to project")
    return json.dumps({
        "id": str(skill.id),
        "name": skill.name,
        "discipline": skill.discipline,
        "template": skill.template,
        "meta": skill.meta or {},
        "constraint": "可选加速模板；允许按用户请求调整，不得把它当作固定分析菜单。",
    }, ensure_ascii=False)


def _plan(
    history: list[dict[str, str]], request: ChatRequest, datasets: str, memories: str, skill: str
) -> list[PlanStep]:
    response = run_agent(
        "你是科研数据分析规划者。将请求拆成1到3个可执行步骤。只返回JSON。",
        (
            f"历史：{json.dumps(history, ensure_ascii=False)}\n"
            f"已核验长期记忆：{memories}\n"
            f"可选技能上下文：{skill}\n"
            f"当前请求：{request.message}\n数据集：{datasets}\n"
            '返回格式：{"steps":[{"title":"...","rationale":"..."}]}。'
        ),
    )
    payload = _json_object(response)
    steps = [PlanStep.model_validate(item) for item in payload.get("steps", [])]
    if not steps:
        raise ValueError("planner returned no steps")
    return steps[:3]


def _generate_code(
    history: list[dict[str, str]],
    request: ChatRequest,
    datasets: str,
    step: PlanStep,
    memories: str,
    skill: str,
    previous_error: str | None = None,
) -> str:
    error_context = f"\n上次执行错误，请修复：\n{previous_error}" if previous_error else ""
    return _code(
        run_agent(
            "你是通用科研分析执行器。根据用户请求动态生成Python，禁止固定学科菜单。只返回代码。",
            (
                f"历史：{json.dumps(history, ensure_ascii=False)}\n当前请求：{request.message}\n"
                f"已核验长期记忆：{memories}\n"
                f"可选技能上下文：{skill}\n"
                f"当前步骤：{step.model_dump_json()}\n数据集：{datasets}\n"
                "数据文件路径按数据集 index 对应 DATASET_PATHS[index]，不得硬编码路径。"
                "使用 pandas/numpy/scipy/statsmodels/sklearn/matplotlib。"
                "重要标量、系数、表格必须调用 emit_artifact(kind, value, title, tol)；"
                "绘图需 plt.show()，并可额外 emit_artifact('figure', 结构化绘图数据, title)。"
                "不要安装依赖、不要联网、不要伪造结果。" + error_context
            ),
        )
    )


def _artifact_event(db: Session, artifact_id: uuid.UUID) -> dict[str, Any]:
    artifact = db.get(Artifact, artifact_id)
    if artifact is None:
        raise RuntimeError("run returned an unregistered artifact")
    anchor = f"⟦art_{str(artifact.id)[:4]}⟧"
    return {
        "artifact_id": artifact.id,
        "kind": artifact.kind,
        "value_json": artifact.value_json,
        "figure_url": f"/api/v1/artifacts/{artifact.id}/content" if artifact.content_hash else None,
        "anchor": anchor,
    }


async def run_chat(db: Session, request: ChatRequest) -> AsyncIterator[SSEEvent]:
    conversation = _conversation(db, request)
    history = _history(db, conversation.id)
    recalled = recall_memories(db, request.project_id, request.message) if request.conversation_id is None else []
    memories = memory_context(recalled)
    skill = _skill_context(db, request)
    db.add(Message(
        conversation_id=conversation.id,
        role="user",
        content=request.message,
        extra_metadata={"skill_id": str(request.skill_id) if request.skill_id else None},
    ))
    db.commit()
    datasets = _dataset_context(db, request)
    steps = _plan(history, request, datasets, memories, skill)
    yield _event("plan", {"steps": [item.model_dump() for item in steps]})

    run_ids: list[str] = []
    artifact_ids: list[str] = []
    anchors: list[str] = []
    tool_summaries: list[dict[str, Any]] = []
    for step in steps:
        yield _event("thinking", {"text": step.rationale})
        previous_error: str | None = None
        for attempt in range(2):
            code = _generate_code(history, request, datasets, step, memories, skill, previous_error)
            yield _event("code", {"code": code, "lang": "python"})
            run = run_with_retry(
                db,
                max_retries=0,
                project_id=request.project_id,
                conversation_id=conversation.id,
                code=code,
                dataset_ids=request.dataset_ids,
                seed=42,
            )
            run_ids.append(str(run.run_id))
            yield _event(
                "run",
                {"run_id": run.run_id, "status": run.status, "stdout": run.stdout},
            )
            db.add(
                Message(
                    conversation_id=conversation.id,
                    role="tool",
                    content=run.stdout,
                    extra_metadata={"run_id": str(run.run_id), "status": run.status},
                )
            )
            db.commit()
            if run.status == "success":
                for capture in run.artifacts:
                    if capture.artifact_id is None:
                        raise RuntimeError("artifact has no ledger id")
                    artifact_ids.append(str(capture.artifact_id))
                    data = _artifact_event(db, capture.artifact_id)
                    anchors.append(data["anchor"])
                    yield _event("artifact", data)
                tool_summaries.append({"step": step.title, "stdout": run.stdout, "artifacts": anchors[:]})
                break
            previous_error = run.stdout
            if attempt == 0:
                yield _event("thinking", {"text": "执行失败，依据完整报错修正代码后重试。"})
        else:
            raise RuntimeError(f"analysis step failed after repair: {step.title}")

    final_text = run_agent(
        "你是科研分析审阅者。仅依据真实工具结果总结，不得编造数字；所有数字必须紧跟给定产物锚点。",
        (
            f"用户请求：{request.message}\n工具结果：{json.dumps(tool_summaries, ensure_ascii=False)}\n"
            f"可用锚点：{anchors}\n请生成简洁Markdown结论，并至少引用一个可用锚点。"
        ),
    )
    used_anchors = [anchor for anchor in anchors if anchor in final_text]
    if anchors and not used_anchors:
        raise RuntimeError("critic response contains no valid artifact anchor")
    db.add(
        Message(
            conversation_id=conversation.id,
            role="assistant",
            content=final_text,
            extra_metadata={
                "plan": [item.model_dump() for item in steps],
                "run_ids": run_ids,
                "artifact_ids": artifact_ids,
            },
        )
    )
    db.commit()
    yield _event("message", {"text": final_text, "citations": used_anchors})
    yield _event("done", {"conversation_id": conversation.id})
