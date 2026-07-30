from app.main import app


def test_workbench_and_project_scoped_read_routes_are_exposed():
    paths = app.openapi()["paths"]
    assert "/api/v1/projects/{project_id}/timeline" in paths
    assert "/api/v1/projects/{project_id}/review" in paths
    assert "/api/v1/projects/{project_id}/quality-report" in paths
    assert "/api/v1/projects/{project_id}/artifacts" in paths
    assert "/api/v1/artifacts/{artifact_id}/library" in paths
    assert "/api/v1/runs/{run_id}/report" in paths
    assert "/api/v1/runs/{run_id}/bundle" in paths
    assert "/api/v1/runs/{run_id}/compare" in paths
    assert "/api/v1/documents/{document_id}/evidence" in paths
    assert "/api/v1/documents/{document_id}/reindex" in paths
    detail_parameters = paths["/api/v1/documents/{document_id}"]["get"]["parameters"]
    assert any(item["name"] == "project_id" and item["required"] for item in detail_parameters)
    lineage_parameters = paths["/api/v1/artifacts/{artifact_id}/lineage"]["get"]["parameters"]
    assert any(item["name"] == "project_id" and item["required"] for item in lineage_parameters)
