import hashlib
import io
import json
import os
import uuid

import fitz
import pandas as pd
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, func, select

if os.getenv("RUN_INTEGRATION") != "1":
    pytest.skip("set RUN_INTEGRATION=1 to run PostgreSQL/Docker acceptance", allow_module_level=True)

from app.core.config import settings
from app.core.db import SessionLocal
from app.main import app
from app.models.knowledge import (
    Artifact,
    Chunk,
    Claim,
    Conversation,
    Dataset,
    Document,
    Edge,
    EnvSnapshot,
    Message,
    Project,
    Run,
)


@pytest.fixture(scope="module")
def project_id():
    value = uuid.uuid4()
    with SessionLocal() as db:
        db.add(Project(id=value, name="P0 integration acceptance", description="temporary"))
        db.commit()
    yield value
    with SessionLocal() as db:
        run_ids = select(Run.id).where(Run.project_id == value)
        conversation_ids = select(Conversation.id).where(Conversation.project_id == value)
        document_ids = select(Document.id).where(Document.project_id == value)
        db.execute(delete(Edge).where(
            (Edge.from_id.in_(run_ids)) | (Edge.to_id.in_(run_ids))
            | (Edge.from_id.in_(select(Dataset.id).where(Dataset.project_id == value)))
            | (Edge.to_id.in_(select(Artifact.id).where(Artifact.project_id == value)))
        ))
        db.execute(delete(Artifact).where(Artifact.project_id == value))
        db.execute(delete(Run).where(Run.project_id == value))
        db.execute(delete(Message).where(Message.conversation_id.in_(conversation_ids)))
        db.execute(delete(Conversation).where(Conversation.project_id == value))
        db.execute(delete(Claim).where(Claim.project_id == value))
        db.execute(delete(Chunk).where(Chunk.document_id.in_(document_ids)))
        db.execute(delete(Document).where(Document.project_id == value))
        db.execute(delete(Dataset).where(Dataset.project_id == value))
        db.execute(delete(Project).where(Project.id == value))
        db.commit()


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as value:
        yield value


def upload(client: TestClient, project_id: uuid.UUID, filename: str, raw: bytes, document_type: str | None = None):
    data = {"project_id": str(project_id)}
    if document_type:
        data["type"] = document_type
    response = client.post("/api/v1/documents", data=data, files={"file": (filename, raw)})
    assert response.status_code == 201, response.text
    return response.json()


def three_page_pdf() -> bytes:
    document = fitz.open()
    for page_number in range(1, 4):
        page = document.new_page()
        page.insert_text((72, 72), f"Penguin morphology study 2024\nPage {page_number}: body mass evidence")
    raw = document.tobytes()
    document.close()
    return raw


def test_m1_real_ingest_contract(client: TestClient, project_id: uuid.UUID):
    pdf = upload(client, project_id, "study.pdf", three_page_pdf(), "paper")
    assert pdf["chunks_count"] > 0
    detail = client.get(f"/api/v1/documents/{pdf['id']}")
    assert detail.status_code == 200
    assert detail.json()["year"] == 2024
    with SessionLocal() as db:
        chunks = list(db.scalars(select(Chunk).where(Chunk.document_id == uuid.UUID(pdf["id"]))))
        assert len(chunks) == pdf["chunks_count"]
        assert all(chunk.embedding is not None and len(chunk.embedding) == 1024 for chunk in chunks)

    frame = pd.DataFrame({"group": ["A", "B"] * 5, "value": range(10), "valid": [True] * 10})
    csv_raw = frame.to_csv(index=False).encode()
    csv = upload(client, project_id, "measurements.csv", csv_raw)
    assert csv["dataset_id"]
    csv_detail = client.get(f"/api/v1/documents/{csv['id']}").json()
    assert csv_detail["schema_json"]["row_count"] == 10
    assert len(csv_detail["schema_json"]["columns"]) == 3
    assert csv_detail["storage_hash"] == hashlib.sha256(csv_raw).hexdigest()
    assert (settings.storage_dir / csv_detail["storage_hash"]).is_file()
    duplicate = upload(client, project_id, "measurements-copy.csv", csv_raw)
    assert duplicate["storage_hash"] == csv_detail["storage_hash"]

    notebook = json.dumps({
        "nbformat": 4, "nbformat_minor": 5, "metadata": {},
        "cells": [{"id": "c1", "cell_type": "code", "execution_count": None, "metadata": {}, "outputs": [], "source": ["print(42)"]}],
    }).encode()
    ipynb = upload(client, project_id, "analysis.ipynb", notebook)
    markdown = upload(client, project_id, "notes.md", b"# Notes\nreproducible evidence " * 120)
    assert ipynb["type"] == "code" and ipynb["chunks_count"] > 0
    assert markdown["type"] == "note" and markdown["chunks_count"] > 0
    paper_list = client.get(f"/api/v1/documents?project_id={project_id}&type=paper").json()
    assert paper_list and all(item["type"] == "paper" for item in paper_list)
    assert client.delete(f"/api/v1/documents/{markdown['id']}").status_code == 200
    with SessionLocal() as db:
        assert db.scalar(select(func.count(Chunk.id)).where(Chunk.document_id == uuid.UUID(markdown["id"]))) == 0


def _metric(hits: list[dict], expected_id: str) -> tuple[float, float]:
    ids = [item["document_id"] for item in hits[:5]]
    if expected_id not in ids:
        return 0.0, 0.0
    rank = ids.index(expected_id)
    import math
    return 1.0, 1.0 / math.log2(rank + 2)


def test_m2_real_hybrid_search_and_isolation(client: TestClient, project_id: uuid.UUID):
    topics = [
        ("albatross", "信天翁翼展与远洋飞行能耗研究"),
        ("mangrove", "红树林盐度梯度与碳汇测量"),
        ("perovskite", "钙钛矿太阳能电池稳定性实验"),
        ("microbiome", "肠道微生物群多样性与饮食干预"),
        ("inflation", "通货膨胀预期与货币政策传导"),
        ("seismic", "地震波速度与地下结构反演"),
    ]
    document_ids: dict[str, str] = {}
    for key, text in topics:
        result = upload(client, project_id, f"{key}.md", (f"# {key}\n{text}\n" * 30).encode(), "note")
        document_ids[key] = result["id"]
    queries = [(key, key) for key, _ in topics for _ in range(5)]
    totals = {mode: [0.0, 0.0] for mode in ("keyword", "semantic", "hybrid")}
    for key, query in queries:
        for mode in totals:
            response = client.post("/api/v1/search", json={
                "project_id": str(project_id), "query": query, "mode": mode, "filters": {"type": "note"}, "k": 5,
            })
            assert response.status_code == 200, response.text
            recall, ndcg = _metric(response.json()["hits"], document_ids[key])
            totals[mode][0] += recall
            totals[mode][1] += ndcg
    scores = {mode: (values[0] / 30, values[1] / 30) for mode, values in totals.items()}
    print("M2 metrics", scores)
    assert scores["hybrid"][0] >= max(scores["keyword"][0], scores["semantic"][0])
    assert scores["hybrid"][1] >= max(scores["keyword"][1], scores["semantic"][1])
    filtered = client.post("/api/v1/search", json={
        "project_id": str(project_id), "query": "study", "mode": "keyword", "filters": {"type": "paper", "year_gte": 2020}, "k": 8,
    }).json()["hits"]
    with SessionLocal() as db:
        docs = [db.get(Document, uuid.UUID(hit["document_id"])) for hit in filtered]
        assert all(doc and doc.type == "paper" and doc.year >= 2020 for doc in docs)
    isolated_project = uuid.uuid4()
    with SessionLocal() as db:
        db.add(Project(id=isolated_project, name="isolated")); db.commit()
    try:
        isolated = client.post("/api/v1/search", json={
            "project_id": str(isolated_project), "query": "albatross", "mode": "hybrid", "k": 8,
        }).json()["hits"]
        assert isolated == []
    finally:
        with SessionLocal() as db:
            db.execute(delete(Project).where(Project.id == isolated_project)); db.commit()


def test_m4_m5_real_ledger_match_and_drift(client: TestClient, project_id: uuid.UUID):
    original_raw = pd.DataFrame({"value": [1.0, 2.0, 3.0]}).to_csv(index=False).encode()
    modified_raw = pd.DataFrame({"value": [10.0, 20.0, 30.0]}).to_csv(index=False).encode()
    original = upload(client, project_id, "original.csv", original_raw)
    modified = upload(client, project_id, "modified.csv", modified_raw)
    conversation_id = uuid.uuid4()
    with SessionLocal() as db:
        db.add(Conversation(id=conversation_id, project_id=project_id, title="integration")); db.commit()
    first = client.post("/api/v1/runs", json={
        "project_id": str(project_id), "conversation_id": str(conversation_id),
        "code": "x = 41", "dataset_ids": [], "seed": 42,
    })
    second = client.post("/api/v1/runs", json={
        "project_id": str(project_id), "conversation_id": str(conversation_id),
        "code": "print(x + 1)", "dataset_ids": [], "seed": 42,
    })
    assert first.json()["status"] == "success" and second.json()["stdout"] == "42"

    code = (
        "import pandas as pd\n"
        "df = pd.read_csv(DATASET_PATHS[0])\n"
        "value = float(df['value'].mean())\n"
        "emit_artifact('coefficient', value, title='mean value', tol=1e-6)"
    )
    run_response = client.post("/api/v1/runs", json={
        "project_id": str(project_id), "code": code, "dataset_ids": [original["dataset_id"]], "seed": 7,
    })
    assert run_response.status_code == 200, run_response.text
    run = run_response.json()
    assert run["status"] == "success" and len(run["code_hash"]) == 64
    artifact_id = run["artifacts"][0]["artifact_id"]
    with SessionLocal() as db:
        assert db.get(Run, uuid.UUID(run["run_id"])) is not None
        assert db.scalar(select(func.count(EnvSnapshot.id))) >= 1
        edge_relations = set(db.scalars(select(Edge.relation).where(
            (Edge.to_id == uuid.UUID(run["run_id"])) | (Edge.from_id == uuid.UUID(run["run_id"]))
        )))
        assert {"reads", "produces"}.issubset(edge_relations)
    lineage = client.get(f"/api/v1/artifacts/{artifact_id}/lineage")
    assert lineage.status_code == 200
    assert {node["type"] for node in lineage.json()["nodes"]}.issuperset({"dataset", "run", "artifact"})

    match = client.post(f"/api/v1/runs/{run['run_id']}/reproduce", json={"dataset_overrides": {}})
    assert match.status_code == 200, match.text
    assert match.json()["status"] == "match" and all(item["within_tol"] for item in match.json()["comparisons"])
    old_hash = hashlib.sha256(original_raw).hexdigest(); new_hash = hashlib.sha256(modified_raw).hexdigest()
    drift = client.post(f"/api/v1/runs/{run['run_id']}/reproduce", json={"dataset_overrides": {old_hash: new_hash}})
    assert drift.status_code == 200, drift.text
    assert drift.json()["status"] == "drift"
    assert any(not item["within_tol"] and item["diff"] for item in drift.json()["comparisons"])

    figure_run = client.post("/api/v1/runs", json={
        "project_id": str(project_id),
        "code": "import matplotlib.pyplot as plt\nplt.plot([1,2],[3,4])\nplt.show()",
        "dataset_ids": [], "seed": 42,
    }).json()
    figure_match = client.post(f"/api/v1/runs/{figure_run['run_id']}/reproduce", json={"dataset_overrides": {}}).json()
    figure_comparisons = [item for item in figure_match["comparisons"] if item["kind"] == "figure"]
    assert figure_comparisons and all(item["within_tol"] for item in figure_comparisons)

    if settings.sandbox_backend == "docker":
        network = client.post("/api/v1/runs", json={
            "project_id": str(project_id),
            "code": "import urllib.request\nurllib.request.urlopen('http://example.com', timeout=3)",
            "dataset_ids": [], "seed": 42,
        }).json()
        assert network["status"] == "error"


def test_m7_real_adversarial_verification(client: TestClient, project_id: uuid.UUID):
    raw = pd.DataFrame({"value": [1.0, 2.0, 3.0]}).to_csv(index=False).encode()
    dataset = upload(client, project_id, "verify-source.csv", raw)
    run = client.post("/api/v1/runs", json={
        "project_id": str(project_id),
        "code": (
            "import pandas as pd\n"
            "df = pd.read_csv(DATASET_PATHS[0])\n"
            "emit_artifact('coefficient', float(df['value'].mean()), title='verified mean', tol=1e-6)"
        ),
        "dataset_ids": [dataset["dataset_id"]], "seed": 42,
    }).json()
    artifact_id = run["artifacts"][0]["artifact_id"]
    anchor = f"⟦art_{artifact_id[:4]}⟧"

    valid = client.post("/api/v1/verify", json={
        "project_id": str(project_id), "text": f"均值为 2{anchor}。", "checks": ["number"],
    })
    assert valid.status_code == 200, valid.text
    assert valid.json()["verdict"] == "pass"
    assert valid.json()["items"][0]["verdict"] == "pass"

    mismatch = client.post("/api/v1/verify", json={
        "project_id": str(project_id), "text": f"均值为 99{anchor}。", "checks": ["number"],
    }).json()
    assert mismatch["verdict"] == "fail" and "不符" in mismatch["items"][0]["reason"]
    bare = client.post("/api/v1/verify", json={
        "project_id": str(project_id), "text": "均值为 2。", "checks": ["number"],
    }).json()
    assert bare["verdict"] == "fail" and bare["items"][0]["target_anchor"] is None
    fake_reference = client.post("/api/v1/verify", json={
        "project_id": str(project_id), "text": "该结论已有研究支持⟦src_dead⟧。", "checks": ["citation"],
    }).json()
    assert fake_reference["verdict"] == "fail" and "不在知识库" in fake_reference["items"][0]["reason"]

    writing = upload(client, project_id, "verified-note.md", f"均值为 2{anchor}。".encode(), "note")
    claim_id = uuid.uuid4()
    with SessionLocal() as db:
        db.add(Claim(id=claim_id, project_id=project_id, doc_id=uuid.UUID(writing["id"]), text=f"均值为 2{anchor}。"))
        db.commit()
    status = client.post("/api/v1/verify", json={
        "project_id": str(project_id), "doc_id": writing["id"], "checks": ["number"],
    }).json()
    assert status["verdict"] == "pass" and status["claim_status"] == "verified"
    with SessionLocal() as db:
        assert db.get(Claim, claim_id).status == "verified"


@pytest.mark.skipif(not settings.llm_api_key, reason="LLM_API_KEY intentionally deferred")
def test_m3_real_sse_chat_requires_configured_llm(client: TestClient, project_id: uuid.UUID):
    with client.stream("POST", "/api/v1/chat", json={
        "project_id": str(project_id), "message": "输出一个可溯源的简单统计量", "dataset_ids": [],
    }) as response:
        assert response.status_code == 200
        body = "".join(response.iter_text())
    positions = [body.index(f"event: {name}") for name in ("plan", "thinking", "code", "run", "artifact", "message", "done")]
    assert positions == sorted(positions)
