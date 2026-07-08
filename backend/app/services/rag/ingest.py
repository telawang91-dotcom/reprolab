import re
import uuid
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.knowledge import Chunk, Collection, Dataset, Document
from app.services.rag import chunker, embedder, parser, storage


@dataclass(slots=True)
class IngestResult:
    document_id: uuid.UUID
    document_type: str
    filename: str
    storage_hash: str
    chunks_count: int | None = None
    dataset_id: uuid.UUID | None = None


def infer_type(filename: str) -> str:
    lowered = filename.lower()
    if lowered.endswith(".pdf"):
        return "paper"
    if lowered.endswith((".py", ".ipynb")):
        return "code"
    if lowered.endswith((".md", ".txt")):
        return "note"
    return "other"


def _metadata(text: str, filename: str) -> tuple[str | None, int | None, str | None]:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    title = lines[0][:500] if lines else filename.rsplit(".", 1)[0]
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
    if collection_id is not None:
        collection = db.get(Collection, collection_id)
        if collection is None:
            raise ValueError("collection not found")
        if collection.project_id != project_id:
            raise ValueError("collection belongs to another project")
    parsed = parser.parse(filename, raw)
    storage_hash = storage.save_bytes(raw)
    resolved_type = document_type or infer_type(filename)
    if resolved_type not in {"paper", "note", "code", "other"}:
        raise ValueError("type must be paper, note, code, or other")

    if parsed.kind == "dataset":
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
            extra_metadata={"kind": "dataset"},
        )
        db.add_all([dataset, document])
        db.commit()
        db.refresh(dataset)
        db.refresh(document)
        return IngestResult(document.id, document.type, filename, storage_hash, dataset_id=dataset.id)

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
    )
    db.add(document)
    db.flush()
    text_chunks = chunker.split(parsed)
    vectors = embedder.encode([item.content for item in text_chunks])
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
    return IngestResult(document.id, document.type, filename, storage_hash, chunks_count=len(text_chunks))


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
