import uuid
from types import SimpleNamespace

import pytest

from app.services.rag import ingest


class FakeSession:
    def __init__(self, document, chunks):
        self.document = document
        self.chunks = chunks
        self.committed = False
        self.refreshed = None

    def get(self, model, item_id):
        return self.document if item_id == self.document.id else None

    def scalars(self, statement):
        return self.chunks

    def commit(self):
        self.committed = True

    def refresh(self, item):
        self.refreshed = item


def test_reindex_rebuilds_existing_chunks_without_changing_content(monkeypatch):
    project_id = uuid.uuid4()
    document = SimpleNamespace(
        id=uuid.uuid4(),
        project_id=project_id,
        extra_metadata={"parse_status": "needs_attention", "parser": "markdown"},
    )
    chunks = [
        SimpleNamespace(id=uuid.uuid4(), content="first evidence", embedding=None, position=0),
        SimpleNamespace(id=uuid.uuid4(), content="second evidence", embedding=None, position=1),
    ]
    db = FakeSession(document, chunks)
    vectors = [[0.1] * 1024, [0.2] * 1024]
    monkeypatch.setattr(ingest.embedder, "encode", lambda texts: vectors)

    result = ingest.reindex_document(db, document.id, project_id)

    assert result.document_id == document.id
    assert result.chunks_count == 2
    assert [chunk.embedding for chunk in chunks] == vectors
    assert document.extra_metadata["parse_status"] == "indexed"
    assert document.extra_metadata["parser"] == "markdown"
    assert document.extra_metadata["embedding_dimensions"] == 1024
    assert db.committed and db.refreshed is document


def test_reindex_rejects_documents_without_text_chunks():
    project_id = uuid.uuid4()
    document = SimpleNamespace(id=uuid.uuid4(), project_id=project_id, extra_metadata={})
    with pytest.raises(ValueError, match="no text chunks"):
        ingest.reindex_document(FakeSession(document, []), document.id, project_id)


def test_reindex_turns_embedding_failure_into_retryable_service_error(monkeypatch):
    project_id = uuid.uuid4()
    document = SimpleNamespace(id=uuid.uuid4(), project_id=project_id, extra_metadata={})
    chunks = [SimpleNamespace(id=uuid.uuid4(), content="evidence", embedding=None, position=0)]
    monkeypatch.setattr(
        ingest.embedder,
        "encode",
        lambda texts: (_ for _ in ()).throw(RuntimeError("model offline")),
    )

    with pytest.raises(ingest.SemanticIndexUnavailable, match="restore the model"):
        ingest.reindex_document(FakeSession(document, chunks), document.id, project_id)
