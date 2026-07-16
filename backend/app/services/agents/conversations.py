import uuid
from collections import defaultdict
from datetime import datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.knowledge import Artifact, Conversation, Message, Run
from app.schemas.conversations import ConversationEvent, ConversationReplay, ConversationSummary


def list_conversations(db: Session, project_id: uuid.UUID) -> list[ConversationSummary]:
    rows = db.execute(
        select(
            Conversation,
            func.count(Message.id),
            func.coalesce(func.max(Message.created_at), Conversation.created_at),
        )
        .outerjoin(Message, Message.conversation_id == Conversation.id)
        .where(Conversation.project_id == project_id)
        .group_by(Conversation.id)
        .order_by(func.coalesce(func.max(Message.created_at), Conversation.created_at).desc())
    )
    return [ConversationSummary(
        id=conversation.id,
        title=conversation.title,
        created_at=conversation.created_at,
        updated_at=updated_at,
        message_count=int(message_count),
    ) for conversation, message_count, updated_at in rows]


def _artifact_data(artifact: Artifact) -> dict[str, Any]:
    return {
        "artifact_id": artifact.id,
        "kind": artifact.kind,
        "title": artifact.title,
        "value_json": artifact.value_json,
        "figure_url": f"/api/v1/artifacts/{artifact.id}/content" if artifact.content_hash else None,
        "anchor": f"⟦art_{str(artifact.id)[:4]}⟧",
    }


def replay_conversation(
    db: Session, project_id: uuid.UUID, conversation_id: uuid.UUID
) -> ConversationReplay:
    conversation = db.get(Conversation, conversation_id)
    if conversation is None or conversation.project_id != project_id:
        raise LookupError("conversation not found")
    messages = list(db.scalars(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at, Message.id)
    ))
    tools_by_turn: list[list[Message]] = []
    current_tools: list[Message] = []
    for message in messages:
        if message.role == "user":
            current_tools = []
            tools_by_turn.append(current_tools)
        elif message.role == "tool" and tools_by_turn:
            current_tools.append(message)

    events: list[ConversationEvent] = []
    turn_index = -1
    for message in messages:
        if message.role == "user":
            turn_index += 1
            events.append(ConversationEvent(event="message", data={
                "text": message.content or "", "citations": [], "user": True,
            }))
            context_tools = (message.extra_metadata or {}).get("context_tools") or []
            if context_tools:
                events.append(ConversationEvent(event="context", data={"tools": context_tools}))
            continue
        if message.role != "assistant":
            continue
        meta = message.extra_metadata or {}
        plan = meta.get("plan") or []
        if plan:
            events.append(ConversationEvent(event="plan", data={"steps": plan}))
        tools = tools_by_turn[turn_index] if 0 <= turn_index < len(tools_by_turn) else []
        for index, tool in enumerate(tools):
            tool_meta = tool.extra_metadata or {}
            run_id = tool_meta.get("run_id")
            run = db.get(Run, uuid.UUID(str(run_id))) if run_id else None
            if run is None or run.project_id != project_id:
                continue
            if index < len(plan) and plan[index].get("rationale"):
                events.append(ConversationEvent(event="thinking", data={"text": plan[index]["rationale"]}))
            events.append(ConversationEvent(event="code", data={"code": run.code, "lang": run.lang or "python"}))
            events.append(ConversationEvent(event="run", data={
                "run_id": run.id, "status": run.status, "stdout": run.stdout or "",
            }))
            artifacts = list(db.scalars(
                select(Artifact).where(Artifact.run_id == run.id).order_by(Artifact.created_at, Artifact.id)
            ))
            events.extend(ConversationEvent(event="artifact", data=_artifact_data(item)) for item in artifacts)
        text = message.content or ""
        status = "partial" if meta.get("analysis_status") == "partial" or meta.get("error_code") else "complete"
        if status == "partial" and not text.lstrip().startswith("#"):
            text = (
                "## 本次分析未完成\n\n"
                f"{text or '当前没有形成足以支持结论的可信计算结果。'}\n\n"
                "已保留数据范围与运行记录；可以直接重新发送同一问题。"
            )
        sources = meta.get("sources") or []
        citations = [f"⟦art_{str(item)[:4]}⟧" for item in meta.get("artifact_ids") or [] if f"⟦art_{str(item)[:4]}⟧" in text]
        citations.extend(
            str(item.get("anchor"))
            for item in sources
            if isinstance(item, dict) and item.get("anchor") in text
        )
        events.append(ConversationEvent(event="message", data={
            "text": text,
            "citations": citations,
            "sources": sources,
            "status": status,
        }))
    events.append(ConversationEvent(event="done", data={"conversation_id": conversation.id}))
    return ConversationReplay(id=conversation.id, title=conversation.title, events=events)
