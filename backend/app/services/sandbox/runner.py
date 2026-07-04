import hashlib
import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.knowledge import Dataset, Run
from app.schemas.runs import ArtifactCapture, RunResponse
from app.services.rag.storage import path_of, save_bytes
from app.services.sandbox.env import EnvironmentInfo, capture_environment, get_or_create_snapshot
from app.services.lineage.hashing import merged_input_hash, trusted_code_hash
from app.services.sandbox.kernel import CapturedOutput, ExecResult, execute_code


def _dataset_hashes(db: Session, dataset_ids: list[uuid.UUID]) -> list[str]:
    if not dataset_ids:
        return []
    rows = list(db.scalars(select(Dataset).where(Dataset.id.in_(dataset_ids))))
    found = {row.id for row in rows}
    missing = [str(item) for item in dataset_ids if item not in found]
    if missing:
        raise ValueError("dataset not found: " + ", ".join(missing))
    return sorted(row.storage_hash for row in rows)


def _capture_artifact(output: CapturedOutput) -> tuple[ArtifactCapture, str]:
    if output.data is not None:
        storage_hash = save_bytes(output.data)
        return ArtifactCapture(
            kind=output.kind,
            mime_type=output.mime_type,
            storage_hash=storage_hash,
            title=output.title,
            tol=output.tol,
        ), storage_hash
    serialized = str(output.value).encode("utf-8")
    output_hash = hashlib.sha256(serialized).hexdigest()
    return ArtifactCapture(
        kind=output.kind,
        mime_type=output.mime_type,
        value=output.value,
        title=output.title,
        tol=output.tol,
    ), output_hash


def run_code(
    db: Session,
    project_id: uuid.UUID,
    code: str,
    lang: str = "python",
    dataset_ids: list[uuid.UUID] | None = None,
    seed: int = 42,
    conversation_id: uuid.UUID | None = None,
    timeout: float = 30,
    input_hashes_override: list[str] | None = None,
) -> RunResponse:
    if lang != "python":
        raise ValueError("only python is supported")
    input_hashes = sorted(input_hashes_override) if input_hashes_override is not None else _dataset_hashes(db, dataset_ids or [])
    dataset_paths = [str(path_of(item)) for item in input_hashes]
    input_hash = merged_input_hash(input_hashes)
    environment = capture_environment()
    snapshot = get_or_create_snapshot(db, environment)
    code_hash = trusted_code_hash(code, lang, input_hash, environment.env_hash)
    execution = execute_code(code, seed, timeout, conversation_id, dataset_paths)
    captured = [_capture_artifact(item) for item in execution.artifacts]
    artifacts = [item[0] for item in captured]
    output_hashes = [item[1] for item in captured]
    run = Run(
        project_id=project_id,
        conversation_id=conversation_id,
        code=code,
        lang=lang,
        env_snapshot_id=snapshot.id,
        input_hashes=input_hashes,
        output_hashes=output_hashes,
        input_hash=input_hash,
        code_hash=code_hash,
        seed=seed,
        status=execution.status,
        stdout=execution.stdout,
    )
    db.add(run)
    db.flush()
    from app.services.lineage.ledger import register_run_outputs

    artifacts = register_run_outputs(db, run, artifacts)
    db.commit()
    db.refresh(run)
    return RunResponse(
        run_id=run.id,
        status=run.status,
        stdout=run.stdout or "",
        artifacts=artifacts,
        code_hash=run.code_hash,
    )


def run_with_retry(db: Session, max_retries: int = 2, **kwargs) -> RunResponse:
    response = run_code(db, **kwargs)
    attempts = 0
    while response.status == "error" and attempts < max_retries:
        attempts += 1
        response = run_code(db, **kwargs)
    return response


def sandbox_run(
    code: str,
    input_hashes: list[str] | None = None,
    seed: int = 42,
    environment: EnvironmentInfo | None = None,
    timeout: float = 30,
) -> ExecResult:
    expected = environment or capture_environment()
    current = capture_environment()
    if expected.env_hash != current.env_hash:
        raise RuntimeError("requested environment snapshot is not available in this sandbox")
    # input_hashes are part of caller-side trust validation; datasets are mounted by the Docker backend.
    resolved_hashes = sorted(input_hashes or [])
    merged_input_hash(resolved_hashes)
    dataset_paths = [str(path_of(item)) for item in resolved_hashes]
    return execute_code(code, seed, timeout, conversation_id=None, dataset_paths=dataset_paths)
