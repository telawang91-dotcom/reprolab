import io
import threading
import uuid
import zipfile
from dataclasses import dataclass
from pathlib import PurePosixPath

from app.core.db import SessionLocal
from app.schemas.documents import BatchStatus
from app.services.rag.ingest import ingest

MAX_FILES = 100
MAX_EXPANDED_BYTES = 100 * 1024 * 1024


@dataclass(frozen=True, slots=True)
class PreparedFile:
    filename: str
    raw: bytes


_jobs: dict[uuid.UUID, dict] = {}
_lock = threading.Lock()


def safe_upload_name(name: str) -> str:
    normalized = name.replace("\\", "/")
    path = PurePosixPath(normalized)
    if path.is_absolute() or ".." in path.parts or not path.name:
        raise ValueError(f"unsafe zip entry or upload path: {name}")
    return normalized


def prepare_files(files: list[tuple[str, bytes]]) -> list[PreparedFile]:
    prepared: list[PreparedFile] = []
    expanded_bytes = 0
    for filename, raw in files:
        if filename.lower().endswith(".zip"):
            try:
                archive = zipfile.ZipFile(io.BytesIO(raw))
            except zipfile.BadZipFile:
                archive = None
            if archive is None:
                safe_name = safe_upload_name(filename)
                expanded_bytes += len(raw)
                prepared.append(PreparedFile(safe_name, raw))
            else:
                before = len(prepared)
                with archive:
                    for info in archive.infolist():
                        if info.is_dir():
                            continue
                        safe_name = safe_upload_name(info.filename)
                        if info.flag_bits & 0x1:
                            raise ValueError(f"encrypted zip entry is not supported: {safe_name}")
                        expanded_bytes += info.file_size
                        if expanded_bytes > MAX_EXPANDED_BYTES:
                            raise ValueError("batch expanded size exceeds 100 MB")
                        prepared.append(PreparedFile(safe_name, archive.read(info)))
                        if len(prepared) > MAX_FILES:
                            raise ValueError("batch contains more than 100 files")
                if len(prepared) == before:
                    safe_name = safe_upload_name(filename)
                    expanded_bytes += len(raw)
                    prepared.append(PreparedFile(safe_name, raw))
        else:
            filename = safe_upload_name(filename)
            expanded_bytes += len(raw)
            prepared.append(PreparedFile(filename, raw))
        if expanded_bytes > MAX_EXPANDED_BYTES:
            raise ValueError("batch size exceeds 100 MB")
        if len(prepared) > MAX_FILES:
            raise ValueError("batch contains more than 100 files")
    if not prepared:
        raise ValueError("batch contains no files")
    return prepared


def create_job(
    project_id: uuid.UUID,
    collection_id: uuid.UUID | None,
    files: list[PreparedFile],
) -> BatchStatus:
    batch_id = uuid.uuid4()
    job = {
        "batch_id": batch_id,
        "project_id": project_id,
        "collection_id": collection_id,
        "status": "queued",
        "total": len(files),
        "completed": 0,
        "failed": 0,
        "items": [
            {"filename": item.filename, "status": "queued", "document_id": None,
             "dataset_id": None, "duplicate": False, "parse_status": None,
             "parser": None, "message": None, "error": None}
            for item in files
        ],
    }
    with _lock:
        _jobs[batch_id] = job
    return BatchStatus.model_validate(job)


def process_job(
    batch_id: uuid.UUID,
    project_id: uuid.UUID,
    collection_id: uuid.UUID | None,
    document_type: str | None,
    files: list[PreparedFile],
) -> None:
    with _lock:
        _jobs[batch_id]["status"] = "processing"
    for index, item in enumerate(files):
        with _lock:
            _jobs[batch_id]["items"][index]["status"] = "processing"
        try:
            with SessionLocal() as db:
                result = ingest(
                    db, item.filename, item.raw, project_id, document_type, collection_id
                )
            with _lock:
                row = _jobs[batch_id]["items"][index]
                row.update({
                    "status": "success",
                    "document_id": result.document_id,
                    "dataset_id": result.dataset_id,
                    "duplicate": bool(getattr(result, "duplicate", False)),
                    "parse_status": result.parse_status,
                    "parser": result.parser,
                    "message": result.message,
                })
                _jobs[batch_id]["completed"] += 1
        except Exception as exc:
            with _lock:
                row = _jobs[batch_id]["items"][index]
                row.update({"status": "error", "error": str(exc)[:500]})
                _jobs[batch_id]["failed"] += 1
    with _lock:
        job = _jobs[batch_id]
        if job["failed"] == 0:
            job["status"] = "success"
        elif job["completed"] == 0:
            job["status"] = "error"
        else:
            job["status"] = "partial"


def get_job(batch_id: uuid.UUID) -> BatchStatus | None:
    with _lock:
        job = _jobs.get(batch_id)
        return BatchStatus.model_validate(job) if job is not None else None
