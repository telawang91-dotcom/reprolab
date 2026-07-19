import ast
import json
import re
import uuid
from collections.abc import AsyncIterator
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.knowledge import Artifact, Collection, Conversation, Dataset, Document, Message
from app.models.skills import Skill
from app.schemas.chat import ChatRequest, PlanStep, SSEEvent
from app.services.agents.runtime import run_agent
from app.services.agents.model_adapter import ModelAdapter, model_adapter
from app.services.agents.verifier import check_numbers
from app.services.sandbox.runner import run_with_retry
from app.services.memory.recall import memory_context, recall_memories
from app.services.skills.store import ensure_builtins
from app.services.rag.retrieval import complex_retrieve


FINAL_ANSWER_SYSTEM_PROMPT = (
    "你是面向用户的科研分析回答者。必须直接回答用户当前提出的问题，只依据真实执行结果，"
    "不得编造数字；所有数字必须紧跟给定产物锚点。输出自然、简洁的 Markdown。"
    "以分析报告形式优先给出直接结论，再给关键发现、处理建议与必要限制。"
    "只呈现与问题相关的答案和证据；不得提及智能体、规划、执行步骤、"
    "Python 代码、工具、stdout、重试或其他内部运行过程。"
)

WORKSPACE_ANALYSIS_PATTERN = re.compile(
    r"分析|统计|计算|绘图|画图|可视化|比较|相关|回归|聚类|建模|检验|异常|缺失|清洗|"
    r"数据质量|怎么处理|如何处理|处理建议|趋势|分布|效应量|置信区间|"
    r"analy[sz]e|statistics?|calculate|plot|visuali[sz]e|compare|correlation|regression|"
    r"cluster|model|missing|outlier|clean|distribution|confidence interval",
    re.IGNORECASE,
)

WORKSPACE_INVENTORY_PATTERN = re.compile(
    r"(?:有哪些|有什么|列出|清单|目录|概览|介绍|包含|包括|查看|看看|告诉我).{0,32}"
    r"(?:文件夹|文件|资料|数据集|数据|内容)|"
    r"(?:文件夹|文件|资料|数据集|数据|内容).{0,24}"
    r"(?:有哪些|有什么|列出|清单|目录|概览|介绍|包含|包括)",
    re.IGNORECASE,
)

WORKSPACE_EXPLICIT_ANALYSIS_PATTERN = re.compile(
    r"检查|统计|计算|绘图|画图|可视化|比较|相关|回归|聚类|建模|检验|异常|缺失|清洗|"
    r"数据质量|怎么处理|如何处理|处理建议|趋势|分布|效应量|置信区间|"
    r"(?:帮我|请|开始|进行|执行|深入|全面|重新)\s*分析|"
    r"分析(?:一下|这些|这个|该|所选|数据|文件|其中|结果|并|后|：|:)|"
    r"analy[sz]e|statistics?|calculate|plot|visuali[sz]e|compare|correlation|regression|"
    r"cluster|model|missing|outlier|clean|distribution|confidence interval",
    re.IGNORECASE,
)


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
    reserved = {"DATASET_PATHS", "SEED", "emit_artifact", "load_dataset"}
    uses_dataset_paths = False
    uses_dataset_loader = False
    emits_artifact = False
    allowed_artifact_kinds = {"number", "coefficient", "table", "figure", "text", "conclusion"}
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
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "load_dataset":
            uses_dataset_loader = True
            if len(node.args) > 1 or node.keywords:
                raise ValueError(
                    "load_dataset accepts only one optional positional dataset index; "
                    "parser options are managed by ingestion"
                )
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "emit_artifact":
            emits_artifact = True
            if not node.args or not isinstance(node.args[0], ast.Constant) or node.args[0].value not in allowed_artifact_kinds:
                raise ValueError("emit_artifact kind must be one of number/coefficient/table/figure/text/conclusion")
    if datasets_selected and uses_dataset_paths:
        raise ValueError("selected data paths are private; use load_dataset(index)")
    if datasets_selected and not uses_dataset_loader:
        raise ValueError("selected data must be read with load_dataset(index)")
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
    statement = select(Dataset).where(
        Dataset.project_id == request.project_id,
        Dataset.id.in_(request.dataset_ids),
    )
    if request.collection_id is not None:
        statement = statement.where(Dataset.collection_id == request.collection_id)
    datasets = list(db.scalars(statement))
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


def _workspace_scope(
    db: Session, request: ChatRequest
) -> tuple[list[Document], list[Dataset]]:
    if request.collection_id is None:
        raise ValueError("workspace mode requires collection_id")
    collection = db.get(Collection, request.collection_id)
    if collection is None or collection.project_id != request.project_id:
        raise LookupError("collection not found")
    documents = list(db.scalars(
        select(Document)
        .where(
            Document.project_id == request.project_id,
            Document.collection_id == request.collection_id,
        )
        .order_by(Document.created_at, Document.id)
    ))
    datasets = list(db.scalars(
        select(Dataset)
        .where(
            Dataset.project_id == request.project_id,
            Dataset.collection_id == request.collection_id,
        )
        .order_by(Dataset.created_at, Dataset.id)
    ))
    return documents, datasets


def _workspace_needs_analysis(message: str, datasets: list[Dataset]) -> bool:
    if not datasets:
        return False
    # “有哪些资料、哪些数据可分析”是在询问工作区清单与能力，不是在下达
    # 分析任务。只有同时出现明确的计算/检查动作时才升级到沙箱执行。
    if (
        WORKSPACE_INVENTORY_PATTERN.search(message)
        and not WORKSPACE_EXPLICIT_ANALYSIS_PATTERN.search(message)
    ):
        return False
    return bool(WORKSPACE_ANALYSIS_PATTERN.search(message))


def _workspace_manifest(
    documents: list[Document], datasets: list[Dataset]
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    def compact_schema(value: dict[str, Any] | None) -> dict[str, Any] | None:
        if not value:
            return None
        columns = value.get("columns") if isinstance(value.get("columns"), list) else []
        sheets = value.get("sheets") if isinstance(value.get("sheets"), list) else []
        return {
            "row_count": value.get("row_count"),
            "column_count": value.get("column_count"),
            "columns": columns[:80],
            "default_sheet": value.get("default_sheet"),
            "sheets": [
                {
                    "name": item.get("name"),
                    "row_count": item.get("row_count"),
                    "column_count": item.get("column_count"),
                }
                for item in sheets[:20]
                if isinstance(item, dict)
            ],
            "source_format": value.get("source_format"),
            "truncated": len(columns) > 80 or len(sheets) > 20,
        }

    datasets_by_hash = {item.storage_hash: item for item in datasets}
    sources: list[dict[str, Any]] = []
    manifest: list[dict[str, Any]] = []
    for document in documents[:100]:
        anchor = f"⟦src_{str(document.id)[:4]}⟧"
        dataset = datasets_by_hash.get(document.storage_hash)
        metadata = document.extra_metadata or {}
        manifest.append({
            "anchor": anchor,
            "filename": document.filename,
            "type": document.type,
            "parse_status": metadata.get("parse_status"),
            "parser": metadata.get("parser"),
            "dataset_schema": compact_schema(dataset.schema_json) if dataset else None,
        })
        sources.append({
            "anchor": anchor,
            "document_id": str(document.id),
            "chunk_id": None,
            "filename": document.filename,
        })
    return manifest, sources


async def _run_workspace_answer(
    db: Session,
    request: ChatRequest,
    conversation: Conversation,
    history: list[dict[str, str]],
    documents: list[Document],
    datasets: list[Dataset],
    adapter: ModelAdapter,
    record_user: bool = True,
    limitation: str | None = None,
) -> AsyncIterator[SSEEvent]:
    recalled = recall_memories(db, request.project_id, request.message)
    memories = memory_context(recalled)
    hits = complex_retrieve(
        db,
        request.project_id,
        request.message,
        mode="hybrid",
        k=8,
        collection_id=request.collection_id,
    )
    manifest, manifest_sources = _workspace_manifest(documents, datasets)
    sources_by_anchor = {item["anchor"]: item for item in manifest_sources}
    evidence: list[dict[str, Any]] = []
    for hit in hits:
        anchor = f"⟦src_{str(hit.document_id)[:4]}⟧"
        evidence.append({
            "anchor": anchor,
            "section": hit.section,
            "content": hit.content[:3_000],
        })
        sources_by_anchor[anchor] = {
            "anchor": anchor,
            "document_id": str(hit.document_id),
            "chunk_id": str(hit.chunk_id),
            "filename": next(
                (item.filename for item in documents if item.id == hit.document_id),
                "",
            ),
        }
    context_tools = [
        {
            "name": "file.scope",
            "label": "读取当前文件夹",
            "status": "used" if documents else "empty",
            "detail": f"已读取 {len(documents)} 个文件的类型、状态与可用结构" if documents else "当前文件夹为空",
            "count": len(documents),
        },
        {
            "name": "knowledge.search",
            "label": "检索文件内容",
            "status": "used" if hits else "empty",
            "detail": f"找到 {len(hits)} 段相关内容" if hits else "没有文本命中，继续使用文件清单与数据结构回答",
            "count": len(hits),
        },
        {
            "name": "dataset.inspect",
            "label": "检查数据结构",
            "status": "used" if datasets else "empty",
            "detail": "、".join(item.name for item in datasets) if datasets else "没有可查询数据表",
            "count": len(datasets),
        },
        {
            "name": "memory.search",
            "label": "检索项目记忆",
            "status": "used" if recalled else "empty",
            "detail": f"召回 {len(recalled)} 条有效记忆" if recalled else "没有匹配到可用长期记忆",
            "count": len(recalled),
        },
    ]
    if record_user:
        db.add(Message(
            conversation_id=conversation.id,
            role="user",
            content=request.message,
            extra_metadata={
                "collection_id": str(request.collection_id),
                "mode": "workspace",
                "memory_ids": [str(item.id) for item in recalled],
                "context_tools": context_tools,
            },
        ))
        db.commit()
    yield _event("context", {"tools": context_tools})
    yield _event("thinking", {"text": "正在结合当前文件夹、数据结构与相关内容组织回答。"})
    response = adapter.chat({
        "model": settings.agent_model_route["critic"],
        "messages": [
            {
                "role": "system",
                "content": (
                    "你是 Codex 风格的科研工作区 Agent。直接解决用户问题，可以使用当前文件夹清单、"
                    "数据结构、检索证据和已核验记忆。不得声称读取了 parse_status 为 stored 或 needs_attention "
                    "文件的内部内容；应明确能力边界并给出下一步。引用具体文件事实时紧跟对应 ⟦src_xxxx⟧。"
                    "没有文本命中不等于失败：可依据数据 schema 回答字段与分析建议，也可说明尚需执行分析。"
                    "输出自然、简洁的 Markdown，不要暴露隐藏推理。"
                ),
            },
            {
                "role": "user",
                "content": (
                    f"会话历史：{json.dumps(history[-12:], ensure_ascii=False)}\n"
                    f"当前问题：{request.message}\n"
                    f"文件清单与数据结构：{json.dumps(manifest, ensure_ascii=False, default=str)}\n"
                    f"相关内容：{json.dumps(evidence, ensure_ascii=False)}\n"
                    f"项目记忆：{memories}\n"
                    f"执行限制：{limitation or '无'}"
                ),
            },
        ],
        "tools": [],
    })
    final_text = response.content.strip()
    if not final_text:
        raise RuntimeError("workspace agent returned an empty answer")
    used_sources = [item for anchor, item in sources_by_anchor.items() if anchor in final_text]
    used_anchors = [item["anchor"] for item in used_sources]
    db.add(Message(
        conversation_id=conversation.id,
        role="assistant",
        content=final_text,
        extra_metadata={
            "collection_id": str(request.collection_id),
            "mode": "workspace",
            "sources": used_sources,
        },
    ))
    db.commit()
    yield _event("message", {
        "text": final_text,
        "citations": used_anchors,
        "sources": used_sources,
    })
    yield _event("done", {"conversation_id": conversation.id})


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
            "若数据 source_format 为 paired_series_csv，各 axis/intensity 谱系列长度可以不同；"
            "尾部空值是结构性补齐，不是缺失观测。规划完整性检查时应统计每个谱系列的有效点与内部断点。"
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
            (
                "你是通用科研分析执行器。根据用户请求动态生成Python，禁止固定学科菜单。"
                "运行环境已提供 load_dataset 和 emit_artifact；不得重新定义系统能力。只返回代码。"
            ),
            (
                f"历史：{json.dumps(history, ensure_ascii=False)}\n当前请求：{request.message}\n"
                f"已核验长期记忆：{memories}\n"
                f"可选技能上下文：{skill}\n"
                f"当前步骤：{step.model_dump_json()}\n数据集：{datasets}\n"
                "只执行当前步骤定义的任务，不得顺带重复其他规划步骤的计算。"
                "必须使用 df = load_dataset(index) 读取所选数据集；这是完整签名，只能传一个可选整数索引。"
                "数据在入库时已标准化，必须直接使用数据集结构里展示的列名；不得传 header、sep、sheet_name "
                "或其他解析参数，不得再次推断表头或重读原文件。不得读取或猜测文件路径。"
                "若 df.attrs.get('reprolab_schema', {}).get('source_format') 为 paired_series_csv，必须按 axis/intensity 成对分析；"
                "不同谱系列尾部因长度不同产生的 NaN 是结构性补齐，不得计为缺失记录或建议插补。"
                "完整性应报告每个系列的 valid_point_count 和有效区间内 internal_gap_count。"
                "不得定义、赋值或删除 load_dataset、emit_artifact、DATASET_PATHS、SEED。"
                "使用 pandas/numpy/scipy/statsmodels/sklearn/matplotlib。"
                "重要结果必须调用 emit_artifact(kind, value, title, tol)；"
                "每个步骤只登记 2-4 个对用户决策最有帮助的产物；相关指标合并成一个 table，最多一张 figure，禁止逐行或逐列滥发产物。"
                "每个步骤须将 1-2 个最关键的数值结果单独登记为 number 或 coefficient，"
                "不能只把关键数字埋在 table、text 或 conclusion 中。"
                "kind 仅可为 number、coefficient、table、figure、text、conclusion；"
                "table 可直接传 DataFrame、Series 或二维列表。"
                "绘图需 plt.show()，图像会被运行时自动登记；同一张图不得再用 emit_artifact('figure', ...) 重复登记。"
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


def _artifact_evidence(data: dict[str, Any], limit: int = 2_000) -> dict[str, Any]:
    serialized = json.dumps(data.get("value_json"), ensure_ascii=False, default=str)
    if len(serialized) > limit:
        serialized = serialized[:limit] + "…"
    return {
        "anchor": data["anchor"],
        "kind": data["kind"],
        "title": data.get("title"),
        "value_json": serialized,
    }


def _trusted_artifact_summary(items: list[dict[str, Any]]) -> str:
    lines = ["## 分析报告", "", "### 已核验结果"]
    seen: set[tuple[str, str, str]] = set()
    for item in items:
        kind = str(item.get("kind") or "")
        title = str(item.get("title") or kind or "分析产物")
        # Titles are labels, not measured values. Avoid letting incidental digits
        # such as matplotlib's "figure 2" enter the numeric-verification path.
        if re.search(r"\d", title):
            title = {
                "figure": "分析图形",
                "table": "分析数据表",
                "text": "分析说明",
                "conclusion": "分析结论",
            }.get(kind, "分析产物")
        anchor = str(item["anchor"])
        value = item.get("value_json")
        scalar = _artifact_scalar(value)
        key = (kind, title, json.dumps(scalar if scalar is not None else value, ensure_ascii=False, sort_keys=True, default=str))
        if key in seen:
            continue
        seen.add(key)
        if item.get("kind") in {"number", "coefficient"} and scalar is not None:
            lines.append(f"- {title}：{scalar:g} {anchor}")
        elif item.get("kind") != "conclusion":
            lines.append(f"- 已生成“{title}” {anchor}")
    if len(lines) == 3:
        raise RuntimeError("analysis produced no safe artifact summary")
    return "\n".join(lines)


def _safe_report_fallback(
    db: Session,
    project_id: uuid.UUID,
    generated_text: str,
    artifact_events: list[dict[str, Any]],
) -> str:
    """Keep useful qualitative report text while removing untrusted numeric lines."""
    safe_lines: list[str] = []
    for line in generated_text.splitlines():
        checks = check_numbers(db, project_id, line)
        if not any(item.verdict == "fail" for item in checks):
            safe_lines.append(line)
    pruned_lines: list[str] = []
    for index, line in enumerate(safe_lines):
        stripped = line.strip()
        following = next((item.strip() for item in safe_lines[index + 1:] if item.strip()), "")
        if stripped.startswith("#") and (not following or following.startswith("#")):
            continue
        category = re.match(r"^(\s*)[-*]\s+.+[:：]\s*$", line)
        if category and (
            not following
            or following.startswith("#")
            or re.match(r"^\s*[-*]\s+", following)
        ):
            continue
        pruned_lines.append(line)
    table_pruned: list[str] = []
    index = 0
    while index < len(pruned_lines):
        if pruned_lines[index].strip().startswith("|"):
            end = index
            while end < len(pruned_lines) and pruned_lines[end].strip().startswith("|"):
                end += 1
            block = pruned_lines[index:end]
            if len(block) >= 3:
                table_pruned.extend(block)
            index = end
            continue
        table_pruned.append(pruned_lines[index])
        index += 1
    qualitative = re.sub(r"\n{3,}", "\n\n", "\n".join(table_pruned)).strip()
    trusted = _trusted_artifact_summary(artifact_events)
    if not qualitative or qualitative == generated_text.strip() and "⟦art_" in qualitative:
        return trusted if not qualitative else qualitative
    return f"{qualitative}\n\n{trusted}"


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


def _partial_analysis_report(
    request: ChatRequest,
    failed_step: str,
    artifact_events: list[dict[str, Any]],
) -> tuple[str, list[str]]:
    """Return an honest user-facing report even when computation cannot finish."""
    if artifact_events:
        trusted = _trusted_artifact_summary(artifact_events)
        anchors = [str(item["anchor"]) for item in artifact_events if item.get("anchor")]
        return (
            "## 部分完成\n\n"
            f"{trusted}\n\n"
            "后续计算未能形成可核验结果，因此没有补充未经验证的数字或判断。"
            "你可以直接重新发送同一问题，系统会从标准化数据表继续分析。",
            anchors,
        )
    return (
        "## 本次分析未完成\n\n"
        f"针对“{request.message}”，当前没有形成足以支持结论的可信计算结果，因此我不会用执行代码或未经核验的数字代替回答。\n\n"
        f"分析停在“{failed_step}”。已保留本次选择的数据与运行记录；请直接重新发送同一问题，"
        "系统会从标准化数据表重新执行，并在完成后给出结论、关键发现、建议与限制。",
        [],
    )


async def run_chat(
    db: Session, request: ChatRequest, adapter: ModelAdapter = model_adapter
) -> AsyncIterator[SSEEvent]:
    conversation = _conversation(db, request)
    history = _history(db, conversation.id)
    if request.mode == "workspace":
        documents, scoped_datasets = _workspace_scope(db, request)
        if not _workspace_needs_analysis(request.message, scoped_datasets):
            async for item in _run_workspace_answer(
                db, request, conversation, history, documents, scoped_datasets, adapter
            ):
                yield item
            return
        if not request.dataset_ids:
            request = request.model_copy(update={
                "dataset_ids": [item.id for item in scoped_datasets],
            })
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
            "collection_id": str(request.collection_id) if request.collection_id else None,
            "mode": request.mode,
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
    artifact_budget_per_step = 4
    for step in steps:
        yield _event("thinking", {"text": step.rationale})
        previous_error: str | None = None
        step_evidence: list[dict[str, Any]] = []
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
                for capture in run.artifacts:
                    if capture.artifact_id is None:
                        raise RuntimeError("artifact has no ledger id")
                    artifact_ids.append(str(capture.artifact_id))
                    data = _artifact_event(db, capture.artifact_id)
                    anchors.append(data["anchor"])
                    if len(step_evidence) < 12:
                        step_evidence.append(_artifact_evidence(data))
                    artifact_events.append(data)
                    yield _event("artifact", data)
                tool_summaries.append(
                    {
                        "step": step.title,
                        "stdout": run.stdout[-2_000:],
                        "artifacts": step_evidence,
                    }
                )
                break
            previous_error = run.stdout
            if attempt == 0:
                yield _event("thinking", {"text": "执行失败，依据完整报错修正代码后重试。"})
        else:
            if request.mode == "workspace":
                documents, scoped_datasets = _workspace_scope(db, request)
                yield _event("thinking", {"text": "代码执行未完成，正在基于文件结构给出可操作回答。"})
                async for item in _run_workspace_answer(
                    db,
                    request,
                    conversation,
                    history,
                    documents,
                    scoped_datasets,
                    adapter,
                    record_user=False,
                    limitation="本轮数据代码执行未完成，不得声称已得到计算结果；请基于 schema 说明可确认的信息、处理步骤与重试建议。",
                ):
                    yield item
                return
            failure_message, partial_anchors = _partial_analysis_report(
                request, step.title, artifact_events
            )
            db.add(
                Message(
                    conversation_id=conversation.id,
                    role="assistant",
                    content=failure_message,
                    extra_metadata={
                        "analysis_status": "partial",
                        "error_code": "analysis_execution_failed",
                        "failed_step": step.title,
                        "run_ids": run_ids,
                        "artifact_ids": artifact_ids,
                        "plan": [item.model_dump() for item in steps],
                    },
                )
            )
            db.commit()
            yield _event("message", {
                "text": failure_message,
                "citations": partial_anchors,
                "status": "partial",
            })
            yield _event("done", {"conversation_id": conversation.id})
            return

    if not anchors:
        raise RuntimeError("analysis produced no trusted artifact")
    final_text = run_agent(
        FINAL_ANSWER_SYSTEM_PROMPT,
        (
            f"用户请求：{request.message}\n数据集结构：{datasets}\n"
            f"真实成果：{json.dumps(tool_summaries, ensure_ascii=False)}\n"
            f"可用锚点：{anchors}\n请针对用户请求直接作答，不复述分析过程；"
            "对于 paired_series_csv，明确区分不同谱区长度造成的结构性补齐与有效区间内真实断点，禁止建议伪造或插补未采集谱段；"
            "存在可用锚点时至少引用一个，但不要向用户解释锚点或内部机制。"
        ), adapter=adapter, route="critic",
    )
    used_anchors = [anchor for anchor in anchors if anchor in final_text]
    number_checks = check_numbers(db, request.project_id, final_text)
    if anchors and (not used_anchors or any(item.verdict == "fail" for item in number_checks)):
        final_text = _safe_report_fallback(
            db, request.project_id, final_text, artifact_events
        )
        used_anchors = [anchor for anchor in anchors if anchor in final_text]
        fallback_checks = check_numbers(db, request.project_id, final_text)
        if any(item.verdict == "fail" for item in fallback_checks):
            final_text = _trusted_artifact_summary(artifact_events)
            used_anchors = [anchor for anchor in anchors if anchor in final_text]
    db.add(
        Message(
            conversation_id=conversation.id,
            role="assistant",
            content=final_text,
            extra_metadata={
                "analysis_status": "complete",
                "plan": [item.model_dump() for item in steps],
                "run_ids": run_ids,
                "artifact_ids": artifact_ids,
            },
        )
    )
    db.commit()
    yield _event("message", {
        "text": final_text,
        "citations": used_anchors,
        "status": "complete",
    })
    yield _event("done", {"conversation_id": conversation.id})
