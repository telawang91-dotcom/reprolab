import hashlib
import io
import json
import os
import uuid
import zipfile
from datetime import datetime, timedelta, timezone

import fitz
import pandas as pd
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, func, select

if os.getenv("RUN_INTEGRATION") != "1":
    pytest.skip("set RUN_INTEGRATION=1 to run PostgreSQL/Docker acceptance", allow_module_level=True)
if "test" not in os.getenv("DATABASE_URL", "").lower():
    pytest.skip("integration tests require an isolated test DATABASE_URL", allow_module_level=True)

from app.core.config import settings
from app.core.db import SessionLocal
from app.main import app
from app.models.knowledge import (
    Artifact,
    Chunk,
    Claim,
    Collection,
    Conversation,
    Dataset,
    Document,
    Edge,
    EnvSnapshot,
    Memory,
    Message,
    Project,
    Run,
)
from app.models.suggestions import Suggestion
from app.models.skills import Skill


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
        db.execute(delete(Memory).where(Memory.project_id == value))
        db.execute(delete(Suggestion).where(Suggestion.project_id == value))
        db.execute(delete(Skill).where(Skill.project_id == value))
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


def test_m1b_real_collection_scope_batch_and_set_null(client: TestClient, project_id: uuid.UUID):
    first = client.post("/api/v1/collections", json={
        "project_id": str(project_id), "name": f"综述-{uuid.uuid4().hex[:6]}",
    })
    second = client.post("/api/v1/collections", json={
        "project_id": str(project_id), "name": f"实验-{uuid.uuid4().hex[:6]}",
    })
    assert first.status_code == second.status_code == 201
    first_id, second_id = first.json()["id"], second.json()["id"]
    marker = f"collection-scope-{uuid.uuid4().hex}"

    doc_a = client.post("/api/v1/documents", data={
        "project_id": str(project_id), "collection_id": first_id, "type": "paper",
    }, files={"file": ("a.md", f"{marker} evidence A".encode())}).json()
    doc_b = client.post("/api/v1/documents", data={
        "project_id": str(project_id), "collection_id": second_id, "type": "paper",
    }, files={"file": ("b.md", f"{marker} evidence B".encode())}).json()

    for collection_id, expected, excluded in (
        (first_id, doc_a["id"], doc_b["id"]),
        (second_id, doc_b["id"], doc_a["id"]),
    ):
        response = client.post("/api/v1/search", json={
            "project_id": str(project_id), "collection_id": collection_id,
            "query": marker, "mode": "keyword", "k": 8,
        })
        ids = {item["document_id"] for item in response.json()["hits"]}
        assert expected in ids and excluded not in ids

    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w") as archive:
        archive.writestr("folder/c.md", f"{marker} batch C")
        archive.writestr("folder/d.txt", f"{marker} batch D")
    batch = client.post("/api/v1/documents/batch", data={
        "project_id": str(project_id), "collection_id": first_id,
    }, files=[("files", ("papers.zip", stream.getvalue()))])
    assert batch.status_code == 202, batch.text
    status_response = client.get(
        f"/api/v1/documents/batch/{batch.json()['batch_id']}",
        params={"project_id": str(project_id)},
    )
    assert status_response.status_code == 200
    assert status_response.json()["status"] == "success"
    assert status_response.json()["completed"] == 2

    removed = client.delete(f"/api/v1/collections/{first_id}")
    assert removed.status_code == 200
    with SessionLocal() as db:
        preserved = db.get(Document, uuid.UUID(doc_a["id"]))
        assert preserved is not None and preserved.collection_id is None
        assert db.get(Collection, uuid.UUID(first_id)) is None


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
    detail = client.get(f"/api/v1/documents/{pdf['id']}", params={"project_id": str(project_id)})
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
    csv_detail = client.get(f"/api/v1/documents/{csv['id']}", params={"project_id": str(project_id)}).json()
    assert csv_detail["schema_json"]["row_count"] == 10
    assert len(csv_detail["schema_json"]["columns"]) == 3
    assert csv_detail["storage_hash"] == hashlib.sha256(csv_raw).hexdigest()
    assert (settings.storage_dir / csv_detail["storage_hash"]).is_file()
    duplicate = upload(client, project_id, "measurements-copy.csv", csv_raw)
    assert duplicate["storage_hash"] == csv_detail["storage_hash"]
    assert duplicate["duplicate"] is True
    assert duplicate["id"] == csv["id"]

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
    assert client.delete(f"/api/v1/documents/{markdown['id']}", params={"project_id": str(project_id)}).status_code == 200
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
    artifact_list = client.get(f"/api/v1/projects/{project_id}/artifacts", params={"view": "all"})
    assert artifact_list.status_code == 200, artifact_list.text
    listed_artifact = next(item for item in artifact_list.json()["items"] if item["id"] == artifact_id)
    assert listed_artifact["source_complete"] is True
    assert listed_artifact["saved_at"] is None
    saved_library = client.get(f"/api/v1/projects/{project_id}/artifacts")
    assert all(item["id"] != artifact_id for item in saved_library.json()["items"])
    save_result = client.put(f"/api/v1/artifacts/{artifact_id}/library", json={
        "project_id": str(project_id), "saved": True,
    })
    assert save_result.status_code == 200 and save_result.json()["saved"] is True
    assert any(item["id"] == artifact_id for item in client.get(f"/api/v1/projects/{project_id}/artifacts").json()["items"])
    remove_result = client.put(f"/api/v1/artifacts/{artifact_id}/library", json={
        "project_id": str(project_id), "saved": False,
    })
    assert remove_result.status_code == 200 and remove_result.json()["saved"] is False
    assert all(item["id"] != artifact_id for item in client.get(f"/api/v1/projects/{project_id}/artifacts").json()["items"])
    assert any(item["id"] == artifact_id for item in client.get(
        f"/api/v1/projects/{project_id}/artifacts", params={"view": "candidates"}
    ).json()["items"])
    with SessionLocal() as db:
        assert db.get(Run, uuid.UUID(run["run_id"])) is not None
        assert db.scalar(select(func.count(EnvSnapshot.id))) >= 1
        edge_relations = set(db.scalars(select(Edge.relation).where(
            (Edge.to_id == uuid.UUID(run["run_id"])) | (Edge.from_id == uuid.UUID(run["run_id"]))
        )))
        assert {"reads", "produces"}.issubset(edge_relations)
    lineage = client.get(f"/api/v1/artifacts/{artifact_id}/lineage", params={"project_id": str(project_id)})
    assert lineage.status_code == 200
    assert {node["type"] for node in lineage.json()["nodes"]}.issuperset({"dataset", "run", "artifact"})
    report = client.get(f"/api/v1/runs/{run['run_id']}/report", params={"project_id": str(project_id)})
    assert report.status_code == 200 and report.json()["artifacts"] and report.json()["datasets"]
    bundle = client.get(f"/api/v1/runs/{run['run_id']}/bundle", params={"project_id": str(project_id)})
    assert bundle.status_code == 200 and bundle.headers["content-type"] == "application/zip"
    with zipfile.ZipFile(io.BytesIO(bundle.content)) as archive:
        names = set(archive.namelist())
        assert {"analysis.py", "run-report.json", "manifest.json", "bundle-audit.json"}.issubset(names)
        assert json.loads(archive.read("bundle-audit.json"))["passed"] is True
        manifest = json.loads(archive.read("manifest.json"))
        for name, expected_hash in manifest["files"].items():
            assert hashlib.sha256(archive.read(name)).hexdigest() == expected_hash
    quality = client.get(f"/api/v1/projects/{project_id}/quality-report")
    assert quality.status_code == 200
    provenance = next(item for item in quality.json()["metrics"] if item["key"] == "provenance")
    assert provenance["value"] >= 1 and provenance["ratio"] == 1
    comparison = client.get(f"/api/v1/runs/{run['run_id']}/compare", params={
        "project_id": str(project_id), "other_run_id": run["run_id"],
    })
    assert comparison.status_code == 200 and comparison.json()["code_changed"] is False
    timeline = client.get(f"/api/v1/projects/{project_id}/timeline")
    assert timeline.status_code == 200 and any(item["kind"] == "run" for item in timeline.json()["events"])
    review = client.get(f"/api/v1/projects/{project_id}/review")
    assert review.status_code == 200 and review.json()["counts"]["artifacts"] >= 1

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


def test_m5b_real_column_attribution_and_match_guard(client: TestClient, project_id: uuid.UUID):
    original_raw = pd.DataFrame({"group": ["a", "b", "c"], "value": [1.0, 2.0, 3.0]}).to_csv(index=False).encode()
    modified_raw = pd.DataFrame({"group": ["a", "b", "c"], "value": [0.1, 0.2, 0.3]}).to_csv(index=False).encode()
    original = upload(client, project_id, "attribution-original.csv", original_raw)
    modified = upload(client, project_id, "attribution-modified.csv", modified_raw)
    run = client.post("/api/v1/runs", json={
        "project_id": str(project_id),
        "code": (
            "import pandas as pd\n"
            "df = pd.read_csv(DATASET_PATHS[0])\n"
            "emit_artifact('coefficient', float(df['value'].mean()), title='attribution mean', tol=1e-9)"
        ),
        "dataset_ids": [original["dataset_id"]], "seed": 42,
    }).json()
    with SessionLocal() as db:
        runs_before = db.scalar(select(func.count(Run.id)).where(Run.project_id == project_id))
    old_hash, new_hash = hashlib.sha256(original_raw).hexdigest(), hashlib.sha256(modified_raw).hexdigest()
    response = client.post(f"/api/v1/runs/{run['run_id']}/attribute-drift", json={
        "dataset_overrides": {old_hash: new_hash},
        "target_artifact_id": run["artifacts"][0]["artifact_id"],
        "granularity": "column", "top_k": 5,
    })
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["drifted"] < result["baseline"]
    assert result["attributions"] and result["attributions"][0]["dimension"].endswith(":value")
    assert result["attributions"][0]["contribution"] > 0.95
    assert result["attributions"][0]["direction"] == "down"
    assert abs(sum(item["contribution"] for item in result["attributions"]) - 1) <= 0.05
    with SessionLocal() as db:
        runs_after = db.scalar(select(func.count(Run.id)).where(Run.project_id == project_id))
        assert runs_after >= runs_before + 2  # drift replay + persisted ablation replay

    no_drift = client.post(f"/api/v1/runs/{run['run_id']}/attribute-drift", json={
        "dataset_overrides": {}, "granularity": "column",
    })
    assert no_drift.status_code == 200 and no_drift.json()["attributions"] == []


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


def test_m7b_real_nli_labels_threshold_and_evidence_span(client: TestClient, project_id: uuid.UUID):
    paper = upload(
        client, project_id, "nli-support.md",
        ("Randomized trial evidence shows the treatment reduces systolic blood pressure.\n" * 30).encode(),
        "paper",
    )
    anchor = f"⟦src_{paper['id'][:4]}⟧"

    from app.services.agents.model_adapter import ModelResponse
    from app.services.agents.verifier import check_citations

    class StaticAdapter:
        def __init__(self, content):
            self.content = content
        def chat(self, request):
            return ModelResponse(content=self.content)

    with SessionLocal() as db:
        supported = check_citations(
            db, project_id, f"该治疗可降低收缩压{anchor}。",
            StaticAdapter('{"label":"entailment","support_score":0.82,"reason":"试验结论直接支持"}'),
        )[0]
        assert supported.verdict == "pass" and supported.label == "entailment"
        assert supported.support_score >= 0.6 and supported.evidence_span.startswith("chunk:")

        misplaced = check_citations(
            db, project_id, f"该治疗可提高材料导电率{anchor}。",
            StaticAdapter('{"label":"neutral","support_score":0.08,"reason":"段落仅讨论血压"}'),
        )[0]
        assert misplaced.verdict == "fail" and misplaced.label == "neutral"
        assert "张冠李戴" in misplaced.reason

        old_threshold = settings.nli_support_threshold
        try:
            settings.nli_support_threshold = 0.5
            boundary = check_citations(
                db, project_id, f"该治疗可降低收缩压{anchor}。",
                StaticAdapter('{"label":"entailment","support_score":0.55,"reason":"边界支持"}'),
            )[0]
            assert boundary.verdict == "pass"
        finally:
            settings.nli_support_threshold = old_threshold


def test_m7c_real_numeric_repair_citation_replacement_and_flagged_limit(client: TestClient, project_id: uuid.UUID):
    dataset = upload(client, project_id, "repair-values.csv", b"value\n1\n2\n3\n")
    run = client.post("/api/v1/runs", json={
        "project_id": str(project_id),
        "code": (
            "import pandas as pd\n"
            "df = pd.read_csv(DATASET_PATHS[0])\n"
            "emit_artifact('number', float(df['value'].mean()), title='repair mean', tol=1e-9)"
        ),
        "dataset_ids": [dataset["dataset_id"]], "seed": 42,
    }).json()
    artifact_id = run["artifacts"][0]["artifact_id"]
    numeric = client.post("/api/v1/verify", json={
        "project_id": str(project_id),
        "text": f"均值为 99⟦art_{artifact_id[:4]}⟧。",
        "checks": ["number"], "repair": True,
    })
    assert numeric.status_code == 200, numeric.text
    repaired = numeric.json()
    assert repaired["verdict"] == "pass" and repaired["claim_status"] == "verified"
    assert f"2⟦art_{artifact_id[:4]}⟧" in repaired["repaired_text"]
    assert repaired["iterations"] and "账本产物真实值" in repaired["iterations"][0]["repair_action"]
    with SessionLocal() as db:
        claim = db.scalar(select(Claim).where(
            Claim.project_id == project_id, Claim.text == repaired["repaired_text"]
        ))
        assert claim and claim.status == "verified" and claim.repair_count >= 1

    bad = upload(client, project_id, "repair-bad-source.md", ("GEOLOGY_ONLY tectonic plates.\n" * 30).encode(), "paper")
    good = upload(client, project_id, "repair-good-source.md", ("OMEGA_SUPPORT Omega therapy lowers systolic pressure.\n" * 30).encode(), "paper")
    from app.services.agents.model_adapter import ModelResponse
    from app.services.agents.reflexion import repair_loop

    class EvidenceAdapter:
        def chat(self, request):
            premise = request["messages"][-1]["content"].split("假设：", 1)[0]
            if "OMEGA_SUPPORT" in premise:
                return ModelResponse(content='{"label":"entailment","support_score":0.91,"reason":"直接支持"}')
            return ModelResponse(content='{"label":"neutral","support_score":0.05,"reason":"主题无关"}')

    with SessionLocal() as db:
        citation = repair_loop(
            db, project_id, f"Omega therapy lowers systolic pressure⟦src_{bad['id'][:4]}⟧。",
            None, ["citation"], adapter=EvidenceAdapter(),
        )
        assert citation.verdict == "pass" and citation.claim_status == "verified"
        assert f"⟦src_{good['id'][:4]}⟧" in citation.repaired_text
        assert citation.iterations and "NLI 支持引用" in citation.iterations[0].repair_action

    impossible = client.post("/api/v1/verify", json={
        "project_id": str(project_id), "text": "无法归因的裸数字 123。",
        "checks": ["number"], "repair": True,
    })
    assert impossible.status_code == 200
    assert impossible.json()["verdict"] == "fail"
    assert impossible.json()["claim_status"] == "flagged"
    assert "没有满足可信约束" in impossible.json()["iterations"][0]["repair_action"]


def test_m8_real_writeback_is_searchable_and_linked(client: TestClient, project_id: uuid.UUID):
    source = upload(client, project_id, "writeback-source.csv", b"value\n7\n8\n9\n")
    run = client.post("/api/v1/runs", json={
        "project_id": str(project_id),
        "code": (
            "import pandas as pd\n"
            "df = pd.read_csv(DATASET_PATHS[0])\n"
            "emit_artifact('coefficient', float(df['value'].mean()), title='writeback mean', tol=1e-6)"
        ),
        "dataset_ids": [source["dataset_id"]], "seed": 42,
    }).json()
    artifact_id = run["artifacts"][0]["artifact_id"]
    anchor = f"art_{artifact_id[:4]}"
    marker = f"reprolab-writeback-{uuid.uuid4().hex}"
    claim_text = f"{marker} 的均值为 8⟦{anchor}⟧。"
    response = client.post("/api/v1/conclusions", json={
        "project_id": str(project_id), "claim_text": claim_text,
        "anchors": [anchor], "status": "verified",
    })
    assert response.status_code == 200, response.text
    document_id = uuid.UUID(response.json()["document_id"])
    with SessionLocal() as db:
        document = db.get(Document, document_id)
        claim = db.scalar(select(Claim).where(Claim.doc_id == document_id))
        assert document and document.type == "note"
        assert claim and claim.status == "verified"
        assert db.scalar(select(Edge.id).where(
            Edge.from_id == uuid.UUID(artifact_id), Edge.to_id == claim.id, Edge.relation == "supports",
        )) is not None
        assert db.get(Artifact, uuid.UUID(artifact_id)).saved_at is not None

    search = client.post("/api/v1/search", json={
        "project_id": str(project_id), "query": marker,
        "mode": "keyword", "filters": {"type": "note"}, "k": 5,
    })
    assert search.status_code == 200, search.text
    assert str(document_id) in {item["document_id"] for item in search.json()["hits"]}


def test_m9_real_dedup_recall_decay_and_reflection(client: TestClient, project_id: uuid.UUID):
    payload = {
        "project_id": str(project_id), "layer": "semantic",
        "content": "差异检验优先使用配对 t 检验", "tags": ["统计"], "importance": 0.7,
    }
    first = client.post("/api/v1/memories", json=payload)
    second = client.post("/api/v1/memories", json=payload)
    assert first.status_code == 201 and second.status_code == 201
    assert first.json()["id"] == second.json()["id"]
    with SessionLocal() as db:
        count = db.scalar(select(func.count(Memory.id)).where(
            Memory.project_id == project_id,
            Memory.layer == "semantic",
            Memory.content == payload["content"],
        ))
        assert count == 1

        from app.services.memory.embed import embed_memory
        vector = embed_memory("差异检验方法")
        now = datetime.now(timezone.utc)
        old = Memory(
            project_id=project_id, layer="semantic", content="旧的差异检验方法",
            embedding=vector, tags=["decay"], importance=0.8,
            written_at=now - timedelta(days=60),
        )
        new = Memory(
            project_id=project_id, layer="semantic", content="新的差异检验方法",
            embedding=vector, tags=["decay"], importance=0.8, written_at=now,
        )
        stale = Memory(
            project_id=project_id, layer="semantic", content="过期低权重差异检验",
            embedding=vector, tags=["stale"], importance=0.1,
            written_at=now - timedelta(days=365),
        )
        db.add_all([old, new, stale]); db.commit()
        old_id, new_id, stale_id = str(old.id), str(new.id), str(stale.id)

    recalled = client.get("/api/v1/memories", params={
        "project_id": str(project_id), "q": "差异检验方法", "k": 10,
    })
    assert recalled.status_code == 200, recalled.text
    ids = [item["id"] for item in recalled.json()]
    assert new_id in ids and old_id in ids and ids.index(new_id) < ids.index(old_id)
    assert stale_id not in ids

    conversation_id = uuid.uuid4()
    with SessionLocal() as db:
        db.add(Conversation(id=conversation_id, project_id=project_id, title="memory reflection"))
        db.add(Message(
            conversation_id=conversation_id, role="user",
            content="以后优先使用中文文献", extra_metadata={},
        ))
        db.commit()

        from app.services.memory.reflect import reflect_conversation

        class FakeAdapter:
            def chat(self, request):
                from app.services.agents.model_adapter import ModelResponse
                return ModelResponse(content=(
                    '[{"layer":"semantic","content":"用户优先使用中文文献",'
                    '"tags":["偏好"],"importance":0.8}]'
                ))

        written = reflect_conversation(db, conversation_id, adapter=FakeAdapter())
        assert any(item.layer == "episodic" and item.written_at for item in written)
        assert any(item.layer == "semantic" and item.written_at for item in written)


def test_m10_real_evidence_whitelist_and_empty_project(client: TestClient, project_id: uuid.UUID):
    paper = upload(
        client, project_id, "suggestion-paper.md",
        ("# Sensitivity study\nRobustness analysis supports the proposed method.\n" * 20).encode(),
        "paper",
    )
    dataset = upload(client, project_id, "suggestion-data.csv", b"value\n1\n2\n3\n")
    run = client.post("/api/v1/runs", json={
        "project_id": str(project_id),
        "code": (
            "import pandas as pd\n"
            "df = pd.read_csv(DATASET_PATHS[0])\n"
            "emit_artifact('number', float(df['value'].mean()), title='suggestion mean', tol=1e-6)"
        ),
        "dataset_ids": [dataset["dataset_id"]], "seed": 42,
    }).json()
    artifact_id = run["artifacts"][0]["artifact_id"]

    from app.services.suggest.generator import generate_suggestions

    class FakeAdapter:
        def chat(self, request):
            from app.services.agents.model_adapter import ModelResponse
            return ModelResponse(content=json.dumps([{
                "type": "next_step",
                "content": "对当前均值做敏感性分析，并与入库研究比较。",
                "evidence": [
                    {"kind": "artifact", "id": artifact_id},
                    {"kind": "document", "id": paper["id"]},
                ],
            }], ensure_ascii=False))

    with SessionLocal() as db:
        generated = generate_suggestions(db, project_id, adapter=FakeAdapter())
        assert len(generated) == 1
        assert {item["id"] for item in generated[0].evidence} == {artifact_id, paper["id"]}
        assert all(item["anchor"].startswith(("⟦art_", "⟦src_")) for item in generated[0].evidence)

    listed = client.get("/api/v1/suggestions", params={"project_id": str(project_id)})
    assert listed.status_code == 200 and listed.json()
    assert listed.json()[0]["evidence"]
    lineage = client.get(f"/api/v1/artifacts/{artifact_id}/lineage", params={"project_id": str(project_id)})
    assert lineage.status_code == 200
    assert {node["type"] for node in lineage.json()["nodes"]}.issuperset({"dataset", "run", "artifact"})

    class HallucinatingAdapter:
        def chat(self, request):
            from app.services.agents.model_adapter import ModelResponse
            return ModelResponse(content=json.dumps([{
                "type": "hypothesis", "content": "幻觉建议",
                "evidence": [{"kind": "artifact", "id": str(uuid.uuid4())}],
            }]))

    with SessionLocal() as db:
        assert generate_suggestions(db, project_id, adapter=HallucinatingAdapter()) == []

    empty_project = uuid.uuid4()
    with SessionLocal() as db:
        db.add(Project(id=empty_project, name="empty suggestions")); db.commit()
    try:
        empty = client.post("/api/v1/suggestions/refresh", json={"project_id": str(empty_project)})
        assert empty.status_code == 200 and empty.json() == {"generated": 0, "items": []}
    finally:
        with SessionLocal() as db:
            db.execute(delete(Project).where(Project.id == empty_project)); db.commit()


def test_m11_real_builtin_registration_harvest_filter_and_lineage(client: TestClient, project_id: uuid.UUID):
    builtins = client.get("/api/v1/skills", params={"project_id": str(project_id)})
    assert builtins.status_code == 200, builtins.text
    assert any(item["discipline"] == "general" and item["template"] for item in builtins.json())

    biology = client.post("/api/v1/skills", json={
        "project_id": str(project_id), "name": "生物重复测量模板",
        "discipline": "biology", "template": "print('biology template')",
        "meta": {"tools": ["pandas"], "renderer": "table"},
    })
    assert biology.status_code == 201, biology.text
    filtered = client.get("/api/v1/skills", params={
        "project_id": str(project_id), "discipline": "biology",
    }).json()
    assert len(filtered) == 1 and filtered[0]["id"] == biology.json()["id"]

    dataset = upload(
        client, project_id, "skill-demo.csv",
        pd.DataFrame({"group": ["a", "a", "b", "b"], "value": [1.0, 2.0, 4.0, 5.0]}).to_csv(index=False).encode(),
    )
    general = next(item for item in builtins.json() if item["discipline"] == "general")
    run = client.post("/api/v1/runs", json={
        "project_id": str(project_id), "code": general["template"],
        "dataset_ids": [dataset["dataset_id"]], "seed": 42,
    })
    assert run.status_code == 200, run.text
    run_data = run.json()
    assert run_data["status"] == "success" and run_data["artifacts"]
    artifact_id = run_data["artifacts"][0]["artifact_id"]
    lineage = client.get(f"/api/v1/artifacts/{artifact_id}/lineage", params={"project_id": str(project_id)}).json()
    assert {node["type"] for node in lineage["nodes"]}.issuperset({"dataset", "run", "artifact"})

    from app.services.skills.harvest import from_run
    from app.services.skills.store import create_skill
    with SessionLocal() as db:
        harvested_request = from_run(db, uuid.UUID(run_data["run_id"]), name="已跑通技能")
        harvested = create_skill(db, harvested_request)
        assert harvested.meta["source_run_id"] == run_data["run_id"]
    listed = client.get("/api/v1/skills", params={"project_id": str(project_id)}).json()
    assert any(item["name"] == "已跑通技能" and item["meta"]["source_run_id"] == run_data["run_id"] for item in listed)


def test_platform_real_headless_endpoint_aggregates_lineage_and_verification(client: TestClient, project_id: uuid.UUID):
    dataset = upload(client, project_id, "headless-data.csv", b"value\n1\n2\n3\n")
    from app.services.agents.model_adapter import ModelResponse
    from app.services.agents.headless import invoke_agent as real_invoke
    import app.api.agent as agent_api

    class ScriptedAnalysisAdapter:
        def __init__(self):
            self.models = []
        def chat(self, request):
            self.models.append(request.get("model"))
            system = request["messages"][0]["content"]
            if "规划者" in system:
                return ModelResponse(content='{"steps":[{"title":"计算均值","rationale":"使用真实数据"}]}')
            if "执行器" in system:
                return ModelResponse(content=(
                    "df = load_dataset(0)\n"
                    "emit_artifact('number', float(df['value'].mean()), title='headless mean', tol=1e-9)"
                ))
            if "面向用户的科研分析回答者" in system:
                with SessionLocal() as lookup:
                    artifact = lookup.scalar(select(Artifact).where(
                        Artifact.project_id == project_id,
                        Artifact.title == "headless mean",
                    ).order_by(Artifact.created_at.desc()))
                return ModelResponse(content=f"均值为 2⟦art_{str(artifact.id)[:4]}⟧。")
            raise AssertionError(f"unexpected role: {system}")

    adapter = ScriptedAnalysisAdapter()
    old_routes = settings.planner_model, settings.executor_model, settings.critic_model
    try:
        settings.planner_model = "hunyuan:planner-test"
        settings.executor_model = "hunyuan:executor-test"
        settings.critic_model = "deepseek:critic-test"

        async def wired_invoke(db, request):
            return await real_invoke(db, request, adapter)

        with pytest.MonkeyPatch.context() as patcher:
            patcher.setattr(agent_api, "invoke_agent", wired_invoke)
            response = client.post("/api/v1/agent/invoke", json={
                "project_id": str(project_id), "task": "计算数据均值",
                "inputs": {"dataset_ids": [dataset["dataset_id"]]},
            })
        assert response.status_code == 200, response.text
        payload = response.json()
        assert set(payload) == {"result", "artifacts", "lineage", "verify_report"}
        assert payload["artifacts"] and payload["verify_report"]["verdict"] == "pass"
        artifact_id = payload["artifacts"][0]["artifact_id"]
        assert {node["type"] for node in payload["lineage"][artifact_id]["nodes"]}.issuperset({"dataset", "run", "artifact"})
        assert adapter.models == ["hunyuan:planner-test", "hunyuan:executor-test", "deepseek:critic-test"]
    finally:
        settings.planner_model, settings.executor_model, settings.critic_model = old_routes

    invalid = client.post("/api/v1/agent/invoke", json={
        "project_id": str(project_id), "task": "", "inputs": {"unknown": True},
    })
    assert invalid.status_code == 422
    assert set(invalid.json()) == {"error"}


@pytest.mark.skipif(not settings.llm_api_key, reason="LLM_API_KEY intentionally deferred")
def test_m3_real_sse_chat_requires_configured_llm(client: TestClient, project_id: uuid.UUID):
    with client.stream("POST", "/api/v1/chat", json={
        "project_id": str(project_id), "message": "输出一个可溯源的简单统计量", "dataset_ids": [],
    }) as response:
        assert response.status_code == 200
        body = "".join(response.iter_text())
    positions = [body.index(f"event: {name}") for name in ("plan", "thinking", "code", "run", "artifact", "message", "done")]
    assert positions == sorted(positions)
