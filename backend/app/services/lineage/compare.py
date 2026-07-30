import math
from typing import Any

from app.models.knowledge import Artifact
from app.schemas.lineage import Comparison

DEFAULT_TOL = 1e-6


def _number(old: float, new: float, tol: float) -> tuple[bool, float]:
    difference = new - old
    return abs(difference) <= tol * max(1.0, abs(old)), difference


def _nested(old: Any, new: Any, tol: float) -> tuple[bool, Any]:
    if isinstance(old, (int, float)) and not isinstance(old, bool) and isinstance(new, (int, float)) and not isinstance(new, bool):
        return _number(float(old), float(new), tol)
    if isinstance(old, list) and isinstance(new, list) and len(old) == len(new):
        comparisons = [_nested(left, right, tol) for left, right in zip(old, new, strict=True)]
        return all(item[0] for item in comparisons), [item[1] for item in comparisons]
    if isinstance(old, dict) and isinstance(new, dict) and old.keys() == new.keys():
        comparisons = {key: _nested(old[key], new[key], tol) for key in old}
        return all(item[0] for item in comparisons.values()), {key: item[1] for key, item in comparisons.items()}
    return old == new, None if old == new else {"old": old, "new": new}


def artifact_value(artifact: Artifact) -> Any:
    value = artifact.value_json
    if artifact.kind in {"number", "coefficient"} and isinstance(value, dict):
        return value.get("value")
    if artifact.kind == "table" and isinstance(value, dict):
        return value.get("data")
    if artifact.kind == "figure" and isinstance(value, dict):
        return value.get("figure_data")
    if artifact.kind == "conclusion" and isinstance(value, dict):
        return value.get("text")
    return value


def compare_artifacts(old: Artifact, new: Artifact | None) -> Comparison:
    old_value = artifact_value(old)
    new_value = artifact_value(new) if new is not None else None
    tolerance = old.tol if old.tol is not None else DEFAULT_TOL
    if new is None or old.kind != new.kind:
        within, difference = False, "matching artifact missing"
    elif old.kind in {"number", "coefficient"}:
        if not isinstance(old_value, (int, float)) or not isinstance(new_value, (int, float)):
            within, difference = False, "numeric artifact has non-numeric value"
        else:
            within, difference = _number(float(old_value), float(new_value), tolerance)
    elif old.kind == "figure" and (old_value is None or new_value is None):
        # PNG bytes are deliberately ignored, but absence of a structured
        # fingerprint must never be promoted to a successful reproduction.
        within, difference = False, "structured figure data missing"
    else:
        within, difference = _nested(old_value, new_value, tolerance)
    return Comparison(
        artifact_id=old.id,
        kind=old.kind,
        old=old_value,
        new=new_value,
        within_tol=within,
        diff=difference,
    )
