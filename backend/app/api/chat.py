import asyncio
import json
import logging

from fastapi import APIRouter, BackgroundTasks, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.schemas.chat import ChatRequest
from app.services.agents.orchestrator import run_chat
from app.services.memory.reflect import reflect_conversation_task

router = APIRouter(tags=["chat"])
logger = logging.getLogger(__name__)


@router.post("/chat")
def chat(
    request: ChatRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> StreamingResponse:
    # Establish the database connection before SSE headers are sent. Otherwise a
    # connection failure tears down an already-200 stream and the browser can only
    # report an opaque "network error".
    db.execute(text("SELECT 1"))

    async def stream():
        try:
            async for item in run_chat(db, request):
                payload = json.dumps(item.data, ensure_ascii=False, default=str)
                yield f"event: {item.event}\ndata: {payload}\n\n"
                if item.event == "done":
                    background_tasks.add_task(
                        reflect_conversation_task, item.data["conversation_id"]
                    )
        except asyncio.CancelledError:
            raise
        except Exception:
            db.rollback()
            logger.exception("chat stream failed")
            payload = json.dumps(
                {
                    "stage": "orchestration",
                    "code": "chat_stream_failed",
                    "message": "分析流程发生内部错误，已停止本次运行，请稍后重试。",
                    "retryable": True,
                },
                ensure_ascii=False,
            )
            yield f"event: error\ndata: {payload}\n\n"

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        background=background_tasks,
    )
