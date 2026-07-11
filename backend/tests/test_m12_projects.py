import uuid

import pytest
from pydantic import ValidationError

from app.main import app
from app.schemas.projects import ProjectCreate, ProjectRead


def test_m12_project_routes_and_schema_contract():
    paths = app.openapi()["paths"]
    assert "/api/v1/projects" in paths
    assert "/api/v1/projects/{project_id}/archive" in paths
    assert "/api/v1/projects/{project_id}/restore" in paths
    with pytest.raises(ValidationError):
        ProjectCreate(name="")
    assert ProjectRead(
        id=uuid.uuid4(), name="课题", description=None, archived_at=None,
        created_at="2026-01-01T00:00:00Z",
    ).name == "课题"
