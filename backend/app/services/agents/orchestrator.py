import ast
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
from app.services.agents.model_adapter import ModelAdapter, model_adapter
from app.services.agents.verifier import check_numbers
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


def _validate_generated_code(code: str, datasets_selected: bool) -> None:
    try:
        tree = ast.parse(code)
    except SyntaxError as exc:
        raise ValueError(f"generated Python is invalid: {exc.msg}") from exc
    reserved = {"DATASET_PATHS", "SEED", "emit_artifact"}
    uses_dataset_paths = False
    emits_artifact = False
    allowed_artifact_kinds = {"number", "coefficient", "table", "figure", "conclusion"}
    for node in ast.walk(tree):
        targets = []
        if isinstance(node, (ast.Assign, ast.AnnAssign, ast.AugAssign)):
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
        for target in targets:
            names = [item.id for item in ast.walk(target) if isinstance(item, ast.Name)]
            forbidden = reserved.intersection(names)
            if forbidden:
                raise ValueError(f"reserved runtime symbol cannot be reassigned: {sorted(forbidden)[0]}")
        if isinstance(node, ast.Subscript) and isinstance(node.value, ast.Name) and node.value.id == "DATASET_PATHS":
            uses_dataset_paths = True
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "emit_artifact":
            emits_artifact = True
            if not node.args or not isinstance(node.args[0], ast.Constant) or node.args[0].value not in allowed_artifact_kinds:
                raise ValueError("emit_artifact kind must be one of number/coefficient/table/figure/conclusion")
    if datasets_selected and not uses_dataset_paths:
        raise ValueError("selected data must be read from the injected DATASET_PATHS[index]")
    if not emits_artifact:
        raise ValueError("each analysis step must register at least one trusted artifact with emit_artifact")


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
    history: list[dict[str, str]], request: ChatRequest, datasets: str, memories: str, skill: str,
    adapter: ModelAdapter,
) -> list[PlanStep]:
    response = run_agent(
        "你是科研数据分析规划者。将请求拆成1到3个互不重复的可执行步骤。只返回JSON。",
        (
            f"历史：{json.dumps(history, ensure_ascii=False)}\n"
            f"已核验长期记忆：{memories}\n"
            f"可选技能上下文：{skill}\n"
            f"当前请求：{request.message}\n数据集：{datasets}\n"
            '返回格式：{"steps":[{"title":"...","rationale":"..."}]}。'
            "只规划需要 Python 执行的步骤；总结与生成结论不是执行步骤。"
            "同一个指标只能出现在一个步骤中，不得让多个步骤重复计算。"
        ), adapter=adapter, route="planner",
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
    adapter: ModelAdapter,
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
                "DATASET_PATHS 已由系统注入且是只读保留变量，严禁重新赋值或创建替代路径列表。"
                "读取第一个 CSV 必须直接使用 pd.read_csv(DATASET_PATHS[0])，其它格式同理。"
                "使用 pandas/numpy/scipy/statsmodels/sklearn/matplotlib。"
                "重要标量、系数、表格必须调用 emit_artifact(kind, value, title, tol)；"
                "每个步骤只登记 2-4 个对用户决策最有帮助的产物；相关指标合并成一个 table，最多一张 figure，禁止逐行或逐列滥发产物。"
                "kind 只允许 number/coefficient/table/figure/conclusion，禁止 scalar/text 等别名。"
                "绘图需 plt.show()，并可额外 emit_artifact('figure', 结构化绘图数据, title)。"
                "不要安装依赖、不要联网、不要伪造结果。" + error_context
            ), adapter=adapter, route="executor",
        )
    )


def _generate_policy_compliant_code(
    history: list[dict[str, str]], request: ChatRequest, datasets: str, step: PlanStep,
    memories: str, skill: str, adapter: ModelAdapter, previous_error: str | None,
) -> str:
    feedback = previous_error
    for _ in range(2):
        code = _generate_code(history, request, datasets, step, memories, skill, adapter, feedback)
        try:
            _validate_generated_code(code, bool(request.dataset_ids))
            return code
        except ValueError as exc:
            feedback = f"生成代码违反运行时契约：{exc}。必须修复后返回完整代码。"
    raise ValueError(feedback or "generated code violates runtime policy")


def _artifact_event(db: Session, artifact_id: uuid.UUID) -> dict[str, Any]:
    artifact = db.get(Artifact, artifact_id)
    if artifact is None:
        raise RuntimeError("run returned an unregistered artifact")
    anchor = f"⟦art_{str(artifact.id)[:4]}⟧"
    return {
        "artifact_id": artifact.id,
        "kind": artifact.kind,
        "title": artifact.title,
        "value_json": artifact.value_json,
        "figure_url": f"/api/v1/artifacts/{artifact.id}/content" if artifact.content_hash else None,
        "anchor": anchor,
    }


def _trusted_artifact_summary(items: list[dict[str, Any]]) -> str:
    lines = ["分析已完成。以下结论由本次真实运行产物直接收口："]
    seen: set[tuple[str, str, str]] = set()
    for item in items:
        title = str(item.get("title") or item.get("kind") or "分析产物")
        anchor = str(item["anchor"])
        value = item.get("value_json")
        scalar = _artifact_scalar(value)
        key = (str(item.get("kind")), title, json.dumps(scalar if scalar is not None else value, ensure_ascii=False, sort_keys=True, default=str))
        if key in seen:
            continue
        seen.add(key)
        if item.get("kind") in {"number", "coefficient"} and scalar is not None:
            lines.append(f"- {title}：{scalar:g} {anchor}")
        elif item.get("kind") != "conclusion":
            lines.append(f"- 已生成“{title}” {anchor}")
    if len(lines) == 1:
        raise RuntimeError("analysis produced no safe artifact summary")
    return "\n".join(lines)


def _artifact_scalar(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, dict):
        nested = value.get("value")
        if isinstance(nested, (int, float)) and not isinstance(nested, bool):
            return float(nested)
    return None


async def run_chat(
    db: Session, request: ChatRequest, adapter: ModelAdapter = model_adapter
) -> AsyncIterator[SSEEvent]:
    conversation = _conversation(db, request)
    history = _history(db, conversation.id)
    recalled = recall_memories(db, request.project_id, request.message)
    memories = memory_context(recalled)
    skill = _skill_context(db, request)
    datasets = _dataset_context(db, request)
    dataset_payload = json.loads(datasets) if request.dataset_ids else []
    skill_payload = json.loads(skill) if request.skill_id is not None else None
    context_tools = [
        {
            "name": "dataset.scope",
            "label": "读取数据范围",
            "status": "used" if dataset_payload else "empty",
            "detail": (
                "、".join(str(item.get("name") or "未命名数据") for item in dataset_payload)
                if dataset_payload else "未选择数据"
            ),
            "count": len(dataset_payload),
        },
        {
            "name": "memory.search",
            "label": "检索项目记忆",
            "status": "used" if recalled else "empty",
            "detail": f"召回 {len(recalled)} 条与当前问题相关且仍有效的记忆" if recalled else "没有匹配到可用长期记忆",
            "count": len(recalled),
            "items": [
                {"id": str(item.id), "content": item.content[:160], "layer": item.layer}
                for item in recalled
            ],
        },
        {
            "name": "skill.load",
            "label": "加载分析技能",
            "status": "used" if skill_payload else "empty",
            "detail": str(skill_payload.get("name")) if skill_payload else "动态分析，不限制为固定模板",
            "count": 1 if skill_payload else 0,
        },
    ]
    db.add(Message(
        conversation_id=conversation.id,
        role="user",
        content=request.message,
        extra_metadata={
            "skill_id": str(request.skill_id) if request.skill_id else None,
            "memory_ids": [str(item.id) for item in recalled],
            "context_tools": context_tools,
        },
    ))
    db.commit()
    yield _event("context", {"tools": context_tools})
    steps = _plan(history, request, datasets, memories, skill, adapter)
    yield _event("plan", {"steps": [item.model_dump() for item in steps]})

    run_ids: list[str] = []
    artifact_ids: list[str] = []
    anchors: list[str] = []
    artifact_events: list[dict[str, Any]] = []
    tool_summaries: list[dict[str, Any]] = []
    artifact_budget_per_step = max(2, min(4, 8 // len(steps)))
    for step in steps:
        yield _event("thinking", {"text": step.rationale})
        previous_error: str | None = None
        for attempt in range(2):
            code = _generate_policy_compliant_code(
                history, request, datasets, step, memories, skill, adapter, previous_error
            )
            yield _event("code", {"code": code, "lang": "python"})
            run = run_with_retry(
                db,
                max_retries=0,
                project_id=request.project_id,
                conversation_id=conversation.id,
                code=code,
                dataset_ids=request.dataset_ids,
                seed=42,
                max_artifacts=artifact_budget_per_step,
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
                step_artifacts: list[dict[str, Any]] = []
                for capture in run.artifacts:
                    if capture.artifact_id is None:
                        raise RuntimeError("artifact has no ledger id")
                    artifact_ids.append(str(capture.artifact_id))
                    data = _artifact_event(db, capture.artifact_id)
                    anchors.append(data["anchor"])
                    artifact_events.append(data)
                    step_artifacts.append({
                        "kind": data["kind"],
                        "title": data.get("title"),
                        "value_json": data.get("value_json"),
                        "anchor": data["anchor"],
                    })
                    yield _event("artifact", data)
                tool_summaries.append({"step": step.title, "stdout": run.stdout, "artifacts": step_artifacts})
                break
            previous_error = run.stdout
            if attempt == 0:
                yield _event("thinking", {"text": "执行失败，依据完整报错修正代码后重试。"})
        else:
            raise RuntimeError(f"analysis step failed after repair: {step.title}")

    if not anchors:
        raise RuntimeError("analysis produced no trusted artifact")
    final_text = run_agent(
        "你是科研分析审阅者。仅依据真实工具结果总结，不得编造数字；所有数字必须紧跟给定产物锚点。",
        (
            f"用户请求：{request.message}\n工具结果：{json.dumps(tool_summaries, ensure_ascii=False)}\n"
            f"可用锚点：{anchors}\n请生成简洁Markdown结论，并至少引用一个可用锚点。"
        ), adapter=adapter, route="critic",
    )
    used_anchors = [anchor for anchor in anchors if anchor in final_text]
    number_checks = check_numbers(db, request.project_id, final_text)
    if anchors and (not used_anchors or any(item.verdict == "fail" for item in number_checks)):
        final_text = _trusted_artifact_summary(artifact_events)
        used_anchors = [anchor for anchor in anchors if anchor in final_text]
        fallback_checks = check_numbers(db, request.project_id, final_text)
        if any(item.verdict == "fail" for item in fallback_checks):
            raise RuntimeError("deterministic artifact summary failed numeric verification")
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
