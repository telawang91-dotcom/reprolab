import json

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.schemas.chat import ChatRequest
from app.services.agents.orchestrator import run_chat

router = APIRouter(tags=["chat"])


@router.post("/chat")
def chat(request: ChatRequest, db: Session = Depends(get_db)) -> StreamingResponse:
    async def stream():
        async for item in run_chat(db, request):
            payload = json.dumps(item.data, ensure_ascii=False, default=str)
            yield f"event: {item.event}\ndata: {payload}\n\n"

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

