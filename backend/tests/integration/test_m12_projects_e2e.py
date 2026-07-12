import os
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

if os.getenv("RUN_INTEGRATION") != "1":
    pytest.skip("set RUN_INTEGRATION=1 to run PostgreSQL project acceptance", allow_module_level=True)

from app.core.db import SessionLocal
from app.main import app
from app.models.knowledge import Artifact, Dataset, Document, Edge, Project, Run


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


def test_two_projects_do_not_expose_each_others_documents_runs_or_lineage():
    project_ids: list[uuid.UUID] = []
    with TestClient(app) as client:
        for suffix in ("a", "b"):
            response = client.post("/api/v1/projects", json={"name": f"isolation-{suffix}-{uuid.uuid4().hex[:6]}"})
            assert response.status_code == 201, response.text
            project_ids.append(uuid.UUID(response.json()["id"]))
        try:
            uploaded = []
            for project_id, value in zip(project_ids, (1, 99), strict=True):
                document = client.post(
                    "/api/v1/documents",
                    data={"project_id": str(project_id)},
                    files={"file": ("same-name.csv", f"value\n{value}\n".encode())},
                )
                assert document.status_code == 201, document.text
                uploaded.append(document.json())

            assert client.get(
                f"/api/v1/documents/{uploaded[0]['id']}", params={"project_id": str(project_ids[1])}
            ).status_code == 404

            run = client.post("/api/v1/runs", json={
                "project_id": str(project_ids[0]),
                "code": "emit_artifact('number', 1, title='isolated')",
                "dataset_ids": [uploaded[0]["dataset_id"]],
                "seed": 42,
            })
            assert run.status_code == 200 and run.json()["status"] == "success", run.text
            artifact_id = run.json()["artifacts"][0]["artifact_id"]
            assert client.get(
                f"/api/v1/artifacts/{artifact_id}/lineage", params={"project_id": str(project_ids[1])}
            ).status_code == 404
            assert client.get(
                f"/api/v1/runs/{run.json()['run_id']}/report", params={"project_id": str(project_ids[1])}
            ).status_code == 404

            renamed = client.patch(f"/api/v1/projects/{project_ids[0]}", json={"name": "renamed-isolation"})
            assert renamed.status_code == 200 and renamed.json()["name"] == "renamed-isolation"
        finally:
            with SessionLocal() as db:
                for project_id in project_ids:
                    entity_ids = [
                        *db.scalars(db.query(Run.id).filter(Run.project_id == project_id).statement),
                        *db.scalars(db.query(Artifact.id).filter(Artifact.project_id == project_id).statement),
                        *db.scalars(db.query(Dataset.id).filter(Dataset.project_id == project_id).statement),
                    ]
                    if entity_ids:
                        db.query(Edge).filter((Edge.from_id.in_(entity_ids)) | (Edge.to_id.in_(entity_ids))).delete(
                            synchronize_session=False
                        )
                    db.query(Artifact).filter(Artifact.project_id == project_id).delete()
                    db.query(Run).filter(Run.project_id == project_id).delete()
                    db.query(Dataset).filter(Dataset.project_id == project_id).delete()
                    db.query(Document).filter(Document.project_id == project_id).delete()
                    db.query(Project).filter(Project.id == project_id).delete()
                db.commit()
