import uuid

from app.models.knowledge import Artifact
from app.schemas.runs import ArtifactCapture
from app.services.lineage.compare import compare_artifacts
from app.services.lineage.ledger import _value_json


def artifact(kind: str, value, tol: float = 1e-6, content_hash: str | None = None) -> Artifact:
    return Artifact(
        id=uuid.uuid4(),
        kind=kind,
        value_json=value,
        tol=tol,
        content_hash=content_hash,
    )


def test_number_uses_relative_tolerance():
    old = artifact("coefficient", {"value": 100.0})
    close = artifact("coefficient", {"value": 100.00005})
    drift = artifact("coefficient", {"value": 100.001})
    assert compare_artifacts(old, close).within_tol is True
    result = compare_artifacts(old, drift)
    assert result.within_tol is False
    assert result.diff == 0.0010000000000047748


def test_coefficient_is_stored_as_numeric_value():
    capture = ArtifactCapture(
        kind="coefficient",
        mime_type="application/vnd.reprolab.artifact+json",
        value=0.083,
    )
    assert _value_json(capture)["value"] == 0.083


def test_table_compares_numeric_cells_with_tolerance():
    old = artifact("table", {"data": [[1.0, 2.0], [3.0, 4.0]]})
    new = artifact("table", {"data": [[1.0, 2.0 + 1e-7], [3.0, 4.0]]})
    assert compare_artifacts(old, new).within_tol is True


def test_figure_never_uses_png_content_hash():
    old = artifact("figure", {"figure_data": None}, content_hash="a" * 64)
    new = artifact("figure", {"figure_data": None}, content_hash="b" * 64)
    assert compare_artifacts(old, new).within_tol is True
