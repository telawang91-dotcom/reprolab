import io
import uuid
from dataclasses import dataclass
from typing import Literal

import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.knowledge import Artifact, Dataset, Run
from app.schemas.attribution import AttributeResponse, Attribution
from app.services.lineage.compare import artifact_value
from app.services.lineage.ledger import artifacts_of, resolve_inputs
from app.services.lineage.reproduce import reproduce
from app.services.rag.storage import read_bytes, save_bytes
from app.services.sandbox.runner import run_code


@dataclass(slots=True)
class Ablation:
    dataset_index: int
    dimension: str
    frame: pd.DataFrame
    detail: str


def _frame(storage_hash: str) -> pd.DataFrame:
    raw = read_bytes(storage_hash)
    try:
        return pd.read_csv(io.BytesIO(raw))
    except Exception as exc:
        raise ValueError("drift attribution currently requires CSV tabular datasets") from exc


def _keyed(
    old: pd.DataFrame,
    new: pd.DataFrame,
    key_columns: list[str],
) -> tuple[pd.DataFrame, pd.DataFrame]:
    missing = [
        column
        for column in key_columns
        if column not in old.columns or column not in new.columns
    ]
    if missing:
        raise ValueError("key columns are missing from old or new data: " + ", ".join(missing))
    if old[key_columns].isna().any(axis=None) or new[key_columns].isna().any(axis=None):
        raise ValueError("key columns cannot contain null values")
    if old.duplicated(key_columns).any() or new.duplicated(key_columns).any():
        raise ValueError("key columns must uniquely identify rows in both datasets")
    return (
        old.set_index(key_columns, drop=False),
        new.set_index(key_columns, drop=False),
    )


def _membership_ablation(
    index: int,
    old_indexed: pd.DataFrame,
    new_indexed: pd.DataFrame,
    name: str,
    key_columns: list[str],
) -> Ablation | None:
    old_keys, new_keys = set(old_indexed.index), set(new_indexed.index)
    if old_keys == new_keys:
        return None
    rows = [
        new_indexed.loc[[key]] if key in new_keys else old_indexed.loc[[key]]
        for key in old_indexed.index
    ]
    hybrid = pd.concat(rows, axis=0).reset_index(drop=True)
    return Ablation(
        dataset_index=index,
        dimension=f"{name}:__row_membership__",
        frame=hybrid,
        detail=(
            f"按主键 {', '.join(key_columns)} 回滚样本组成；"
            f"新数据新增 {len(new_keys - old_keys)} 行、删除 {len(old_keys - new_keys)} 行"
        ),
    )


def _column_ablations(
    index: int,
    old: pd.DataFrame,
    new: pd.DataFrame,
    name: str,
    key_columns: list[str] | None = None,
) -> list[Ablation]:
    keys = list(key_columns or [])
    if not keys and len(old) != len(new):
        raise ValueError(
            "column attribution requires equal row counts unless key_columns are provided"
        )
    if keys:
        old_indexed, new_indexed = _keyed(old, new, keys)
        common_index = new_indexed.index.intersection(old_indexed.index, sort=False)
    else:
        old_indexed = old.reset_index(drop=True)
        new_indexed = new.reset_index(drop=True)
        common_index = new_indexed.index
    common = [column for column in old.columns if column in new.columns]
    results: list[Ablation] = []
    for column in common:
        if column in keys:
            continue
        left = old_indexed.loc[common_index, column]
        right = new_indexed.loc[common_index, column]
        changed = ~(left.eq(right) | (left.isna() & right.isna()))
        if not bool(changed.any()):
            continue
        hybrid = new_indexed.copy()
        hybrid.loc[common_index, column] = left.to_numpy()
        results.append(Ablation(
            dataset_index=index,
            dimension=f"{name}:{column}",
            frame=hybrid.reset_index(drop=True),
            detail=(
                f"回滚列 {column}；{int(changed.sum())}/{len(common_index)} 个对齐行发生变化"
                + (f"；主键 {', '.join(keys)}" if keys else "")
            ),
        ))
    if keys:
        membership = _membership_ablation(
            index, old_indexed, new_indexed, name, keys
        )
        if membership is not None:
            results.append(membership)
    return results


def _rowgroup_ablations(
    index: int,
    old: pd.DataFrame,
    new: pd.DataFrame,
    name: str,
    key_columns: list[str] | None = None,
) -> list[Ablation]:
    keys = list(key_columns or [])
    if not keys and (len(old) != len(new) or list(old.columns) != list(new.columns)):
        raise ValueError(
            "rowgroup attribution requires aligned datasets unless key_columns are provided"
        )
    if keys:
        old_indexed, new_indexed = _keyed(old, new, keys)
        common_index = new_indexed.index.intersection(old_indexed.index, sort=False)
    else:
        old_indexed = old.reset_index(drop=True)
        new_indexed = new.reset_index(drop=True)
        common_index = new_indexed.index
    results: list[Ablation] = []
    for column in new.columns:
        if column in keys:
            continue
        groups = list(new[column].dropna().unique())
        if len(groups) < 2 or len(groups) > 20:
            continue
        for group in groups:
            group_index = new_indexed.index[new_indexed[column].eq(group)]
            aligned_group = group_index.intersection(common_index, sort=False)
            if not len(aligned_group):
                continue
            hybrid = new_indexed.copy()
            replace_columns = [item for item in new.columns if item not in keys]
            hybrid.loc[aligned_group, replace_columns] = old_indexed.loc[
                aligned_group, replace_columns
            ].to_numpy()
            if hybrid.equals(new_indexed):
                continue
            results.append(Ablation(
                dataset_index=index,
                dimension=f"{name}:{column}={group}",
                frame=hybrid.reset_index(drop=True),
                detail=(
                    f"回滚分组 {column}={group}；覆盖 {len(aligned_group)} 个对齐行"
                    + (f"；主键 {', '.join(keys)}" if keys else "")
                ),
            ))
    if keys:
        membership = _membership_ablation(
            index, old_indexed, new_indexed, name, keys
        )
        if membership is not None:
            results.append(membership)
    return results


def _register_frame(db: Session, run: Run, frame: pd.DataFrame, name: str) -> str:
    raw = frame.to_csv(index=False).encode("utf-8")
    storage_hash = save_bytes(raw)
    existing = db.scalar(select(Dataset).where(
        Dataset.project_id == run.project_id, Dataset.storage_hash == storage_hash
    ))
    if existing is None:
        db.add(Dataset(
            project_id=run.project_id,
            name=name,
            storage_hash=storage_hash,
            schema_json={
                "row_count": len(frame),
                "column_count": len(frame.columns),
                "columns": [{"name": str(column), "dtype": str(frame[column].dtype)} for column in frame.columns],
            },
        ))
        db.commit()
    return storage_hash


def _target(comparisons, target_artifact_id: uuid.UUID | None):
    if target_artifact_id is not None:
        return next((item for item in comparisons if item.artifact_id == target_artifact_id), None)
    return next((item for item in comparisons if item.kind in {"number", "coefficient"} and not item.within_tol), None) \
        or next((item for item in comparisons if item.kind in {"number", "coefficient"}), None)


def attribute_drift(
    db: Session,
    run_id: uuid.UUID,
    dataset_overrides: dict[str, str],
    target_artifact_id: uuid.UUID | None = None,
    granularity: Literal["column", "rowgroup"] = "column",
    top_k: int = 5,
    key_columns: list[str] | None = None,
) -> AttributeResponse:
    original = db.get(Run, run_id)
    if original is None:
        raise LookupError("run not found")
    replay = reproduce(db, run_id, dataset_overrides)
    target = _target(replay.comparisons, target_artifact_id)
    if target is None:
        raise ValueError("run has no numeric target artifact")
    if not isinstance(target.old, (int, float)) or not isinstance(target.new, (int, float)):
        raise ValueError("drift attribution requires a numeric target artifact")
    if replay.status == "match" or target.within_tol:
        return AttributeResponse(
            target_artifact_id=target.artifact_id,
            baseline=target.old,
            drifted=target.new,
            attributions=[],
        )

    resolved_hashes = resolve_inputs(db, original, dataset_overrides)
    candidates: list[Ablation] = []
    for index, (old_hash, new_hash) in enumerate(zip(original.input_hashes, resolved_hashes, strict=True)):
        if old_hash == new_hash:
            continue
        old_frame, new_frame = _frame(old_hash), _frame(new_hash)
        dataset = db.scalar(select(Dataset).where(
            Dataset.project_id == original.project_id, Dataset.storage_hash == new_hash
        ))
        name = dataset.name if dataset else f"dataset-{index + 1}"
        factory = _column_ablations if granularity == "column" else _rowgroup_ablations
        candidates.extend(factory(index, old_frame, new_frame, name, key_columns))

    original_artifacts = artifacts_of(db, original.id)
    target_index = next(
        (index for index, item in enumerate(original_artifacts) if item.id == target.artifact_id), None
    )
    if target_index is None:
        raise ValueError("target artifact does not belong to run")
    raw_results: list[tuple[float, str, str, str]] = []
    for candidate in candidates:
        hybrid_hash = _register_frame(
            db, original, candidate.frame, f"attribution-{candidate.dimension}.csv"
        )
        input_hashes = list(resolved_hashes)
        input_hashes[candidate.dataset_index] = hybrid_hash
        ablation_run = run_code(
            db,
            project_id=original.project_id,
            code=original.code,
            lang=original.lang,
            seed=original.seed or 42,
            conversation_id=None,
            timeout=30,
            input_hashes_override=input_hashes,
        )
        if ablation_run.status != "success":
            continue
        produced = artifacts_of(db, ablation_run.run_id)
        if target_index >= len(produced):
            continue
        value = artifact_value(produced[target_index])
        if not isinstance(value, (int, float)):
            continue
        strength = abs(float(target.new) - float(value))
        if strength <= 1e-15:
            continue
        direction = "up" if float(target.new) > float(value) else "down"
        raw_results.append((strength, candidate.dimension, direction, candidate.detail))

    selected = sorted(raw_results, key=lambda item: item[0], reverse=True)[:top_k]
    total = sum(item[0] for item in selected)
    attributions = [] if total <= 0 else [
        Attribution(
            dimension=dimension,
            contribution=strength / total,
            direction=direction,
            detail=detail,
        )
        for strength, dimension, direction, detail in selected
    ]
    return AttributeResponse(
        target_artifact_id=target.artifact_id,
        baseline=target.old,
        drifted=target.new,
        attributions=attributions,
    )
