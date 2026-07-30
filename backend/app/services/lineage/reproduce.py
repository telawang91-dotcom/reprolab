import uuid

from sqlalchemy.orm import Session

from app.models.knowledge import Artifact, EnvSnapshot, Run
from app.schemas.lineage import ReproduceResponse
from app.services.lineage.compare import compare_artifacts
from app.services.lineage.ledger import artifacts_of, resolve_inputs
from app.services.sandbox.env import EnvironmentInfo, capture_execution_environment
from app.services.sandbox.runner import run_code


def _normalized_title(value: str | None) -> str:
    return "".join((value or "").lower().split())


def _match_replayed_artifacts(
    old_artifacts: list[Artifact], new_artifacts: list[Artifact]
) -> list[tuple[Artifact, Artifact | None]]:
    """Match replay outputs semantically instead of by capture order.

    Matplotlib display hooks and explicit ``emit_artifact`` calls can be
    observed in a different order across otherwise identical executions.
    Positional matching therefore reports false drift.  Kind is the hard
    boundary; within a kind, prefer an exact title and then an actually equal
    value under the artifact's tolerance.
    """
    remaining = list(new_artifacts)
    matched = []
    for old in old_artifacts:
        candidates = [item for item in remaining if item.kind == old.kind]
        if not candidates:
            matched.append((old, None))
            continue
        old_title = _normalized_title(old.title)
        exact_title = [item for item in candidates if old_title and _normalized_title(item.title) == old_title]
        ordered = exact_title + [item for item in candidates if item not in exact_title]
        selected = next((item for item in ordered if compare_artifacts(old, item).within_tol), ordered[0])
        remaining.remove(selected)
        matched.append((old, selected))
    return matched


def reproduce(db: Session, run_id: uuid.UUID, dataset_overrides: dict[str, str] | None = None) -> ReproduceResponse:
    original = db.get(Run, run_id)
    if original is None:
        raise LookupError("run not found")
    if original.status != "success":
        raise ValueError("only successful runs can be reproduced")
    snapshot = db.get(EnvSnapshot, original.env_snapshot_id)
    if snapshot is None:
        raise ValueError("run has no environment snapshot")
    expected_environment = EnvironmentInfo(snapshot.python_version, snapshot.packages, snapshot.env_hash)
    if capture_execution_environment().env_hash != expected_environment.env_hash:
        raise RuntimeError("current sandbox environment differs from original run")
    resolved_hashes = resolve_inputs(db, original, dataset_overrides or {})
    replay = run_code(
        db,
        project_id=original.project_id,
        code=original.code,
        lang=original.lang,
        seed=original.seed or 42,
        conversation_id=None,
        timeout=30,
        input_hashes_override=resolved_hashes,
    )
    if replay.status != "success":
        raise RuntimeError("replay execution failed: " + replay.stdout)
    old_artifacts = artifacts_of(db, original.id)
    new_artifacts = artifacts_of(db, replay.run_id)
    comparisons = [compare_artifacts(old, new) for old, new in _match_replayed_artifacts(old_artifacts, new_artifacts)]
    status = "match" if comparisons and all(item.within_tol for item in comparisons) else "drift"
    return ReproduceResponse(status=status, comparisons=comparisons, new_run_id=replay.run_id)
