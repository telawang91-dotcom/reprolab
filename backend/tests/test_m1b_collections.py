import inspect
import io
import uuid
import zipfile
from types import SimpleNamespace

import pytest
from sqlalchemy.dialects import postgresql

from app.main import app
from app.schemas.search import QARequest, SearchHit, SearchRequest
from app.services.agents.model_adapter import ModelResponse
from app.services.rag import batch_ingest
from app.services.rag.ingest import ingest
from app.services.rag.qa import answer_question
from app.services.rag.retrieval import _scope_statement


def _zip(entries: dict[str, bytes]) -> bytes:
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w") as archive:
        for name, raw in entries.items():
            archive.writestr(name, raw)
    return stream.getvalue()


def test_m1b_routes_and_backward_compatible_optional_contracts():
    paths = app.openapi()["paths"]
    assert "/api/v1/collections" in paths
    assert "/api/v1/documents/batch" in paths
    assert "/api/v1/documents/batch/{batch_id}" in paths
    assert "patch" in paths["/api/v1/documents/{document_id}"]
    assert "patch" in paths["/api/v1/documents/organize"]
    assert SearchRequest(project_id=uuid.uuid4(), query="q").collection_id is None
    assert QARequest(project_id=uuid.uuid4(), query="q").collection_id is None
    assert inspect.signature(ingest).parameters["collection_id"].default is None


def test_collection_filter_is_only_added_when_requested():
    project_id, collection_id = uuid.uuid4(), uuid.uuid4()
    unscoped = str(_scope_statement(project_id, None).compile(dialect=postgresql.dialect()))
    scoped = str(
        _scope_statement(project_id, None, collection_id).compile(dialect=postgresql.dialect())
    )
    assert scoped.count("documents.collection_id") == unscoped.count("documents.collection_id") + 1
    assert "WHERE documents.project_id" in unscoped


def test_batch_expands_supported_zip_entries_and_preserves_folder_name():
    files = batch_ingest.prepare_files([(
        "papers.zip",
        _zip({"review/a.pdf": b"pdf", "review/b.md": b"# b", "review/ignore.exe": b"x"}),
    )])
    assert [item.filename for item in files] == ["review/a.pdf", "review/b.md"]


def test_batch_rejects_zip_traversal_and_unsupported_upload():
    with pytest.raises(ValueError, match="unsafe zip entry"):
        batch_ingest.prepare_files([("bad.zip", _zip({"../escape.pdf": b"x"}))])
    with pytest.raises(ValueError, match="no supported files"):
        batch_ingest.prepare_files([("bad.exe", b"x")])
    with pytest.raises(ValueError, match="unsafe zip entry or upload path"):
        batch_ingest.prepare_files([("../outside.md", b"x")])


def test_batch_job_records_partial_success(monkeypatch):
    project_id = uuid.uuid4()
    files = [
        batch_ingest.PreparedFile("ok.md", b"ok"),
        batch_ingest.PreparedFile("bad.md", b"bad"),
    ]
    job = batch_ingest.create_job(project_id, None, files)

    class FakeSession:
        def __enter__(self): return self
        def __exit__(self, *_): return False

    monkeypatch.setattr(batch_ingest, "SessionLocal", FakeSession)

    def fake_ingest(_db, filename, *_args):
        if filename == "bad.md":
            raise ValueError("broken")
        return SimpleNamespace(document_id=uuid.uuid4(), dataset_id=None)

    monkeypatch.setattr(batch_ingest, "ingest", fake_ingest)
    batch_ingest.process_job(job.batch_id, project_id, None, None, files)
    result = batch_ingest.get_job(job.batch_id)
    assert result is not None
    assert result.status == "partial" and result.completed == 1 and result.failed == 1
    assert [item.status for item in result.items] == ["success", "error"]


def test_qa_forwards_collection_scope_and_keeps_source_anchor(monkeypatch):
    project_id, collection_id = uuid.uuid4(), uuid.uuid4()
    document_id, chunk_id = uuid.uuid4(), uuid.uuid4()
    observed = {}

    def fake_retrieve(*_args, **kwargs):
        observed["collection_id"] = kwargs.get("collection_id")
        return [SearchHit(
            chunk_id=chunk_id, document_id=document_id, content="空间内证据",
            section="结论", position=1, score=1.0,
        )]

    class FakeAdapter:
        def chat(self, request):
            observed["request"] = request
            return ModelResponse(content=f"空间内结论⟦src_{str(document_id)[:4]}⟧")

    monkeypatch.setattr("app.services.rag.qa.complex_retrieve", fake_retrieve)
    result = answer_question(
        SimpleNamespace(), project_id, "结论？", FakeAdapter(), collection_id
    )
    assert observed["collection_id"] == collection_id
    assert observed["request"]["messages"] and result.citations[0].document_id == document_id
