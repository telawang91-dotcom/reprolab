import os
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.core.db import SessionLocal
from app.main import app
from app.models.knowledge import Dataset, Document, Project


pytestmark = pytest.mark.skipif(os.getenv("RUN_INTEGRATION") != "1", reason="set RUN_INTEGRATION=1")


def test_dataset_catalog_multi_query_and_project_isolation():
    project_id = uuid.uuid4()
    other_project_id = uuid.uuid4()
    with SessionLocal() as db:
        db.add_all([Project(id=project_id, name="structured query"), Project(id=other_project_id, name="isolated")])
        db.commit()
    try:
        with TestClient(app) as client:
            uploaded = client.post(
                "/api/v1/documents",
                data={"project_id": str(project_id)},
                files={"file": ("samples.csv", b"sample,group,value\nA,control,1.0\nB,treated,4.5\nC,treated,3.0\n", "text/csv")},
            )
            assert uploaded.status_code == 201, uploaded.text
            dataset_id = uploaded.json()["dataset_id"]

            catalog = client.get("/api/v1/datasets", params={"project_id": str(project_id)})
            assert catalog.status_code == 200
            assert catalog.json()[0]["schema_json"]["row_count"] == 3

            response = client.post("/api/v1/datasets/query", json={
                "project_id": str(project_id),
                "queries": [
                    {
                        "dataset_id": dataset_id,
                        "columns": ["sample", "value"],
                        "filters": [{"column": "group", "op": "eq", "value": "treated"}],
                        "sort": {"column": "value", "direction": "desc"},
                        "limit": 1,
                    },
                    {"dataset_id": dataset_id, "search": "control", "limit": 10},
                ],
            })
            assert response.status_code == 200, response.text
            results = response.json()["results"]
            assert results[0]["rows"] == [{"sample": "B", "value": 4.5}]
            assert results[0]["matched_rows"] == 2
            assert results[1]["rows"][0]["group"] == "control"
            assert results[0]["receipt"]["storage_hash"] == uploaded.json()["storage_hash"]

            isolated = client.post("/api/v1/datasets/query", json={
                "project_id": str(other_project_id),
                "queries": [{"dataset_id": dataset_id}],
            })
            assert isolated.status_code == 404
    finally:
        with SessionLocal() as db:
            db.execute(delete(Document).where(Document.project_id.in_([project_id, other_project_id])))
            db.execute(delete(Dataset).where(Dataset.project_id.in_([project_id, other_project_id])))
            db.execute(delete(Project).where(Project.id.in_([project_id, other_project_id])))
            db.commit()
