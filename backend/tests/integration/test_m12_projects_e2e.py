import os
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

if os.getenv("RUN_INTEGRATION") != "1":
    pytest.skip("set RUN_INTEGRATION=1 to run PostgreSQL project acceptance", allow_module_level=True)

from app.core.db import SessionLocal
from app.main import app
from app.models.knowledge import Dataset, Document, Project


def test_project_archive_blocks_writes_and_restore_reopens_workspace():
    with TestClient(app) as client:
        created = client.post("/api/v1/projects", json={
            "name": f"acceptance-{uuid.uuid4().hex[:8]}", "description": "temporary",
        })
        assert created.status_code == 201, created.text
        project_id = created.json()["id"]
        try:
            archived = client.post(f"/api/v1/projects/{project_id}/archive")
            assert archived.status_code == 200 and archived.json()["archived_at"]

            blocked = client.post("/api/v1/documents", data={"project_id": project_id}, files={
                "file": ("blocked.csv", b"value\n1\n2\n"),
            })
            assert blocked.status_code == 409, blocked.text
            assert blocked.json()["error"]["code"] == "project_archived"

            restored = client.post(f"/api/v1/projects/{project_id}/restore")
            assert restored.status_code == 200 and restored.json()["archived_at"] is None
            writable = client.post("/api/v1/documents", data={"project_id": project_id}, files={
                "file": ("restored.csv", b"value\n1\n2\n"),
            })
            assert writable.status_code == 201, writable.text
            document_id = writable.json()["id"]
            assert client.get(f"/api/v1/documents/{document_id}", params={"project_id": project_id}).status_code == 200
            assert client.get(f"/api/v1/documents/{document_id}", params={"project_id": str(uuid.uuid4())}).status_code == 404
            evidence = client.get(f"/api/v1/documents/{document_id}/evidence", params={"project_id": project_id})
            assert evidence.status_code == 200 and evidence.json()["document_id"] == document_id
        finally:
            with SessionLocal() as db:
                db.execute(delete(Dataset).where(Dataset.project_id == uuid.UUID(project_id)))
                db.execute(delete(Document).where(Document.project_id == uuid.UUID(project_id)))
                db.execute(delete(Project).where(Project.id == uuid.UUID(project_id)))
                db.commit()
