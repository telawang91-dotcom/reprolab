import hashlib
import logging
import re
import uuid
from dataclasses import dataclass
from pathlib import PurePosixPath

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.knowledge import Chunk, Collection, Dataset, Document, Project
from app.schemas.documents import DocumentOrganizeRequest, DocumentUpdate
from app.services.rag import chunker, embedder, parser, storage

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class IngestResult:
    document_id: uuid.UUID
    document_type: str
    filename: str
    storage_hash: str
    chunks_count: int | None = None
    dataset_id: uuid.UUID | None = None
    duplicate: bool = False
    parse_status: str = "indexed"
    parser: str | None = None
    message: str | None = None


@dataclass(slots=True)
class ReindexResult:
    document_id: uuid.UUID
    chunks_count: int
    message: str


class SemanticIndexUnavailable(RuntimeError):
    """Raised when existing text cannot currently be embedded."""


def infer_type(filename: str) -> str:
    lowered = filename.lower()
    if lowered.endswith(".pdf"):
        return "paper"
    if lowered.endswith((".py", ".ipynb", ".r", ".jl", ".m", ".js", ".ts", ".tsx", ".jsx", ".java", ".cpp", ".c", ".h", ".go", ".rs", ".sql", ".sh", ".ps1")):
        return "code"
    if lowered.endswith((".md", ".txt", ".docx", ".pptx", ".rtf", ".html", ".htm", ".json", ".jsonl", ".yaml", ".yml", ".toml", ".xml")):
        return "note"
    return "other"


def _metadata(text: str, filename: str) -> tuple[str | None, int | None, str | None]:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    fallback = filename.replace("\\", "/").rsplit("/", 1)[-1].rsplit(".", 1)[0]
    candidate = lines[0][:500] if lines else ""
    looks_like_content = (
        not candidate
        or len(candidate) < 4
        or candidate.isdigit()
        or candidate.startswith(("from ", "import ", "#", "//", "{"))
        or candidate.count("=") > 2
    )
    title = fallback if looks_like_content else candidate
    year_match = re.search(r"\b(19|20)\d{2}\b", text[:5000])
    doi_match = re.search(r"\b10\.\d{4,9}/[-._;()/:A-Z0-9]+", text[:10000], re.IGNORECASE)
    return title, int(year_match.group()) if year_match else None, doi_match.group().rstrip(".,") if doi_match else None


def ingest(
    db: Session,
    filename: str,
    raw: bytes,
    project_id: uuid.UUID,
    document_type: str | None,
    collection_id: uuid.UUID | None = None,
) -> IngestResult:
    if db.get(Project, project_id) is None:
        raise ValueError("project not found")
    normalized = filename.replace("\\", "/")
    path = PurePosixPath(normalized)
    if path.is_absolute() or ".." in path.parts or not path.name:
        raise ValueError(f"unsafe upload path: {filename}")
    filename = normalized
    if collection_id is not None:
        collection = db.get(Collection, collection_id)
        if collection is None:
            raise ValueError("collection not found")
        if collection.project_id != project_id:
            raise ValueError("collection belongs to another project")
    storage_hash = hashlib.sha256(raw).hexdigest()
    existing = db.scalar(select(Document).where(
        Document.project_id == project_id,
        Document.collection_id == collection_id,
        Document.storage_hash == storage_hash,
    ))
    if existing is not None:
        dataset = db.scalar(select(Dataset).where(
            Dataset.project_id == project_id,
            Dataset.collection_id == collection_id,
            Dataset.storage_hash == storage_hash,
        ))
        chunks_count = db.scalar(
            select(func.count(Chunk.id)).where(Chunk.document_id == existing.id)
        ) or 0
        metadata = existing.extra_metadata or {}
        return IngestResult(
            existing.id,
            existing.type,
            existing.filename,
            storage_hash,
            chunks_count=chunks_count,
            dataset_id=dataset.id if dataset else None,
            duplicate=True,
            parse_status=str(metadata.get("parse_status") or ("structured" if dataset else "indexed")),
            parser=metadata.get("parser"),
            message=metadata.get("message"),
        )
    saved_hash = storage.save_bytes(raw)
    if saved_hash != storage_hash:
        raise RuntimeError("content-addressed storage hash mismatch")
    try:
        parsed = parser.parse(filename, raw)
    except ValueError as exc:
        parsed = parser.ParsedDoc(
            kind="binary",
            metadata={
                "parse_status": "needs_attention",
                "parser": "fallback",
                "message": f"原始文件已保存，但自动解析需要处理：{str(exc)[:400]}",
                "parse_error": str(exc)[:500],
            },
        )
    resolved_type = document_type or infer_type(filename)
    if resolved_type not in {"paper", "note", "code", "other"}:
        raise ValueError("type must be paper, note, code, or other")

    if parsed.kind == "dataset":
        metadata = {"kind": "dataset", **parsed.metadata}
        dataset = Dataset(
            project_id=project_id,
            collection_id=collection_id,
            name=filename,
            storage_hash=storage_hash,
            schema_json=parsed.dataset_schema,
        )
        document = Document(
            project_id=project_id,
            collection_id=collection_id,
            type="other",
            filename=filename,
            storage_hash=storage_hash,
            title=filename,
            extra_metadata=metadata,
        )
        db.add_all([dataset, document])
        db.commit()
        db.refresh(dataset)
        db.refresh(document)
        return IngestResult(
            document.id,
            document.type,
            filename,
            storage_hash,
            dataset_id=dataset.id,
            parse_status=str(metadata.get("parse_status", "structured")),
            parser=metadata.get("parser"),
            message=metadata.get("message"),
        )

    if parsed.kind == "binary":
        metadata = {"kind": "file", **parsed.metadata}
        document = Document(
            project_id=project_id,
            collection_id=collection_id,
            type=resolved_type,
            filename=filename,
            storage_hash=storage_hash,
            title=PurePosixPath(filename).name,
            extra_metadata=metadata,
        )
        db.add(document)
        db.commit()
        db.refresh(document)
        return IngestResult(
            document.id,
            document.type,
            filename,
            storage_hash,
            chunks_count=0,
            parse_status=str(metadata.get("parse_status", "stored")),
            parser=metadata.get("parser"),
            message=metadata.get("message"),
        )

    title, year, doi = _metadata(parsed.text, filename)
    document = Document(
        project_id=project_id,
        collection_id=collection_id,
        type=resolved_type,
        filename=filename,
        storage_hash=storage_hash,
        title=title,
        year=year,
        doi=doi,
        extra_metadata={"kind": "text", **parsed.metadata},
    )
    db.add(document)
    db.flush()
    text_chunks = chunker.split(parsed)
    try:
        vectors: list[list[float] | None] = embedder.encode([item.content for item in text_chunks])
    except Exception as exc:
        logger.exception("embedding generation failed; preserving keyword-searchable chunks")
        vectors = [None] * len(text_chunks)
        parsed.metadata = {
            **parsed.metadata,
            "parse_status": "needs_attention",
            "message": (
                "全文与关键词索引已建立；语义向量暂未生成，可在模型环境恢复后重新增强。"
                f"技术提示：{str(exc)[:180]}"
            ),
        }
        document.extra_metadata = {"kind": "text", **parsed.metadata}
    db.add_all(
        [
            Chunk(
                document_id=document.id,
                content=item.content,
                embedding=vector,
                section=item.section,
                position=item.position,
            )
            for item, vector in zip(text_chunks, vectors, strict=True)
        ]
    )
    db.commit()
    db.refresh(document)
    return IngestResult(
        document.id,
        document.type,
        filename,
        storage_hash,
        chunks_count=len(text_chunks),
        parse_status=str(parsed.metadata.get("parse_status", "indexed")),
        parser=parsed.metadata.get("parser"),
        message=parsed.metadata.get("message"),
    )


def list_documents(
    db: Session,
    project_id: uuid.UUID,
    document_type: str | None = None,
    tag: str | None = None,
    query: str | None = None,
    collection_id: uuid.UUID | None = None,
) -> list[Document]:
    statement = select(Document).where(Document.project_id == project_id)
    if document_type:
        statement = statement.where(Document.type == document_type)
    if query:
        statement = statement.where(Document.filename.ilike(f"%{query}%"))
    if tag:
        statement = statement.where(Document.extra_metadata["tags"].contains([tag]))
    if collection_id is not None:
        statement = statement.where(Document.collection_id == collection_id)
    return list(db.scalars(statement.order_by(Document.created_at.desc())))


def document_detail(db: Session, document_id: uuid.UUID) -> tuple[Document, int, Dataset | None] | None:
    document = db.get(Document, document_id)
    if document is None:
        return None
    count = db.scalar(select(func.count(Chunk.id)).where(Chunk.document_id == document_id)) or 0
    dataset = db.scalar(
        select(Dataset).where(
            Dataset.project_id == document.project_id,
            Dataset.storage_hash == document.storage_hash,
            Dataset.collection_id == document.collection_id,
        )
    )
    return document, count, dataset


def reindex_document(
    db: Session,
    document_id: uuid.UUID,
    project_id: uuid.UUID,
) -> ReindexResult:
    document = db.get(Document, document_id)
    if document is None or document.project_id != project_id:
        raise LookupError("document not found")
    chunks = list(db.scalars(
        select(Chunk).where(Chunk.document_id == document_id).order_by(Chunk.position, Chunk.id)
    ))
    if not chunks:
        raise ValueError("document has no text chunks to reindex")
    try:
        vectors = embedder.encode([chunk.content for chunk in chunks])
    except Exception as exc:
        raise SemanticIndexUnavailable(
            "semantic embedding model is unavailable; restore the model configuration and retry"
        ) from exc
    if len(vectors) != len(chunks):
        raise SemanticIndexUnavailable("embedding model returned an incomplete vector batch")
    for chunk, vector in zip(chunks, vectors, strict=True):
        chunk.embedding = vector
    metadata = dict(document.extra_metadata or {})
    metadata["parse_status"] = "indexed"
    metadata["message"] = f"语义索引已重建，共更新 {len(chunks)} 个文本切块。"
    metadata["embedding_dimensions"] = len(vectors[0]) if vectors else 0
    document.extra_metadata = metadata
    db.commit()
    db.refresh(document)
    return ReindexResult(document.id, len(chunks), metadata["message"])


def delete_document(db: Session, document_id: uuid.UUID) -> bool:
    document = db.get(Document, document_id)
    if document is None:
        return False
    dataset = db.scalar(
        select(Dataset).where(
            Dataset.project_id == document.project_id,
            Dataset.storage_hash == document.storage_hash,
            Dataset.collection_id == document.collection_id,
        )
    )
    if dataset is not None:
        db.delete(dataset)
    db.delete(document)
    db.commit()
    return True


def update_document(
    db: Session, document_id: uuid.UUID, request: DocumentUpdate
) -> Document:
    document = db.get(Document, document_id)
    if document is None or document.project_id != request.project_id:
        raise LookupError("document not found")
    if "collection_id" in request.model_fields_set and request.collection_id is not None:
        collection = db.get(Collection, request.collection_id)
        if collection is None or collection.project_id != request.project_id:
            raise LookupError("collection not found")
    if "title" in request.model_fields_set:
        document.title = request.title.strip() if request.title else None
    if "collection_id" in request.model_fields_set:
        document.collection_id = request.collection_id
        dataset = db.scalar(select(Dataset).where(
            Dataset.project_id == document.project_id,
            Dataset.storage_hash == document.storage_hash,
        ))
        if dataset is not None:
            dataset.collection_id = request.collection_id
    db.commit()
    db.refresh(document)
    return document


def organize_documents(db: Session, request: DocumentOrganizeRequest) -> int:
    if request.collection_id is not None:
        collection = db.get(Collection, request.collection_id)
        if collection is None or collection.project_id != request.project_id:
            raise LookupError("collection not found")
    documents = list(db.scalars(select(Document).where(
        Document.project_id == request.project_id,
        Document.id.in_(request.document_ids),
    )))
    if len(documents) != len(set(request.document_ids)):
        raise LookupError("one or more documents were not found")
    hashes = {document.storage_hash for document in documents}
    for document in documents:
        document.collection_id = request.collection_id
    for dataset in db.scalars(select(Dataset).where(
        Dataset.project_id == request.project_id,
        Dataset.storage_hash.in_(hashes),
    )):
        dataset.collection_id = request.collection_id
    db.commit()
    return len(documents)
