import uuid

from sqlalchemy.orm import Session

from app.models.knowledge import EnvSnapshot, Run
from app.schemas.lineage import ReproduceResponse
from app.services.lineage.compare import compare_artifacts
from app.services.lineage.ledger import artifacts_of, resolve_inputs
from app.services.sandbox.env import EnvironmentInfo, capture_environment
from app.services.sandbox.runner import run_code


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
    if capture_environment().env_hash != expected_environment.env_hash:
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
    comparisons = [
        compare_artifacts(old, new_artifacts[index] if index < len(new_artifacts) else None)
        for index, old in enumerate(old_artifacts)
    ]
    status = "match" if comparisons and all(item.within_tol for item in comparisons) else "drift"
    return ReproduceResponse(status=status, comparisons=comparisons, new_run_id=replay.run_id)

