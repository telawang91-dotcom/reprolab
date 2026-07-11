from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.documents import router as documents_router
from app.api.collections import router as collections_router
from app.api.search import router as search_router
from app.api.runs import router as runs_router
from app.api.lineage import router as lineage_router
from app.api.chat import router as chat_router
from app.api.verify import router as verify_router
from app.api.conclusions import router as conclusions_router
from app.api.memory import router as memory_router
from app.api.suggest import router as suggest_router
from app.api.skills import router as skills_router
from app.api.agent import router as agent_router
from app.api.settings import router as settings_router
from app.api.projects import router as projects_router
from app.api.workbench import router as workbench_router
from app.core.db import ProjectArchivedError, SessionLocal
from app.core.config import settings
from app.services.rag.embedder import preheat
from app.services.sandbox.kernel import kernel_registry
from app.services.skills.store import ensure_builtins
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings.storage_dir.mkdir(parents=True, exist_ok=True)
    if settings.embedding_preload:
        preheat()
    try:
        with SessionLocal() as db:
            ensure_builtins(db)
    except SQLAlchemyError:
        # The health endpoint remains usable while the explicitly configured database is offline.
        pass
    try:
        yield
    finally:
        kernel_registry.close_all()


app = FastAPI(title=settings.app_name, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(documents_router, prefix=settings.api_prefix)
app.include_router(collections_router, prefix=settings.api_prefix)
app.include_router(search_router, prefix=settings.api_prefix)
app.include_router(runs_router, prefix=settings.api_prefix)
app.include_router(lineage_router, prefix=settings.api_prefix)
app.include_router(chat_router, prefix=settings.api_prefix)
app.include_router(verify_router, prefix=settings.api_prefix)
app.include_router(conclusions_router, prefix=settings.api_prefix)
app.include_router(memory_router, prefix=settings.api_prefix)
app.include_router(suggest_router, prefix=settings.api_prefix)
app.include_router(skills_router, prefix=settings.api_prefix)
app.include_router(agent_router, prefix=settings.api_prefix)
app.include_router(settings_router, prefix=settings.api_prefix)
app.include_router(projects_router, prefix=settings.api_prefix)
app.include_router(workbench_router, prefix=settings.api_prefix)


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


@app.exception_handler(SQLAlchemyError)
async def database_exception(_: Request, __: SQLAlchemyError) -> JSONResponse:
    return JSONResponse(
        status_code=503,
        content={"error": {"code": "database_unavailable", "message": "数据库暂不可用，请启动 PostgreSQL 后重试。"}},
    )


@app.exception_handler(ProjectArchivedError)
def archived_project_exception(_: Request, exc: ProjectArchivedError) -> JSONResponse:
    return JSONResponse(
        status_code=409,
        content={"error": {"code": "project_archived", "message": "该研究项目已归档，仅可查看历史记录。"}},
    )


@app.exception_handler(Exception)
async def unhandled_exception(_: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content={"error": {"code": "internal_error", "message": str(exc)}},
    )


@app.get("/health")
def health() -> dict[str, str]:
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
        return {"status": "ok", "database": "online"}
    except SQLAlchemyError:
        return {"status": "degraded", "database": "offline"}
