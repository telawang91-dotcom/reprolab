from fastapi.testclient import TestClient

from app.main import app


def test_root_discovers_direct_api_endpoints():
    with TestClient(app) as client:
        response = client.get("/")

    assert response.status_code == 200
    assert response.json() == {
        "service": "ReproLab",
        "status": "ok",
        "api_prefix": "/api/v1",
        "health": "/health",
        "openapi": "/openapi.json",
        "docs": "/docs",
    }
