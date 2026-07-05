from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.documents import router as documents_router
from app.api.search import router as search_router
from app.api.runs import router as runs_router
from app.api.lineage import router as lineage_router
from app.api.chat import router as chat_router
from app.api.verify import router as verify_router
from app.api.conclusions import router as conclusions_router
from app.api.memory import router as memory_router
from app.api.suggest import router as suggest_router
from app.core.config import settings
from app.services.rag.embedder import preheat


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings.storage_dir.mkdir(parents=True, exist_ok=True)
    if settings.embedding_preload:
        preheat()
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(documents_router, prefix=settings.api_prefix)
app.include_router(search_router, prefix=settings.api_prefix)
app.include_router(runs_router, prefix=settings.api_prefix)
app.include_router(lineage_router, prefix=settings.api_prefix)
app.include_router(chat_router, prefix=settings.api_prefix)
app.include_router(verify_router, prefix=settings.api_prefix)
app.include_router(conclusions_router, prefix=settings.api_prefix)
app.include_router(memory_router, prefix=settings.api_prefix)
app.include_router(suggest_router, prefix=settings.api_prefix)


@app.exception_handler(HTTPException)
async def http_exception(_: Request, exc: HTTPException) -> JSONResponse:
    message = exc.detail if isinstance(exc.detail, str) else "request failed"
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": f"http_{exc.status_code}", "message": message}},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception(_: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={"error": {"code": "validation_error", "message": str(exc)}},
    )


@app.exception_handler(Exception)
async def unhandled_exception(_: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content={"error": {"code": "internal_error", "message": str(exc)}},
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
