import re
import uuid
from datetime import date, datetime
from typing import Any

import pandas as pd
from pandas.api.types import is_bool_dtype, is_datetime64_any_dtype, is_numeric_dtype
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.knowledge import Dataset
from app.schemas.datasets import DatasetQuery, DatasetQueryResult
from app.services.rag.parser import read_dataset_frame
from app.services.rag.storage import read_bytes


def list_datasets(
    db: Session,
    project_id: uuid.UUID,
    collection_id: uuid.UUID | None = None,
) -> list[Dataset]:
    statement = select(Dataset).where(Dataset.project_id == project_id)
    if collection_id is not None:
        statement = statement.where(Dataset.collection_id == collection_id)
    return list(db.scalars(statement.order_by(Dataset.created_at.desc())))


def _require_columns(frame: pd.DataFrame, columns: list[str]) -> None:
    missing = [column for column in columns if column not in frame.columns]
    if missing:
        raise ValueError("字段不存在：" + "、".join(missing))


def _coerce_value(series: pd.Series, value: Any) -> Any:
    if is_numeric_dtype(series.dtype) and not is_bool_dtype(series.dtype):
        try:
            return float(value)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"字段 {series.name} 需要数值筛选条件") from exc
    if is_datetime64_any_dtype(series.dtype):
        try:
            return pd.to_datetime(value)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"字段 {series.name} 需要有效日期筛选条件") from exc
    if is_bool_dtype(series.dtype) and isinstance(value, str):
        lowered = value.lower()
        if lowered in {"true", "1", "yes"}:
            return True
        if lowered in {"false", "0", "no"}:
            return False
    return value


def apply_query(frame: pd.DataFrame, query: DatasetQuery) -> tuple[pd.DataFrame, int]:
    working = frame.copy()
    working.columns = [str(column) for column in working.columns]
    requested = query.columns or list(working.columns)
    involved = [*requested, *(item.column for item in query.filters)]
    if query.sort:
        involved.append(query.sort.column)
    _require_columns(working, list(dict.fromkeys(involved)))

    mask = pd.Series(True, index=working.index, dtype=bool)
    if query.search:
        pattern = re.escape(query.search)
        searchable = requested or list(working.columns)
        search_mask = pd.Series(False, index=working.index, dtype=bool)
        for column in searchable:
            search_mask |= working[column].astype("string").str.contains(pattern, case=False, na=False, regex=True)
        mask &= search_mask

    for condition in query.filters:
        series = working[condition.column]
        if condition.op == "is_null":
            mask &= series.isna()
            continue
        if condition.op == "not_null":
            mask &= series.notna()
            continue
        value = _coerce_value(series, condition.value)
        if condition.op == "contains":
            mask &= series.astype("string").str.contains(re.escape(str(value)), case=False, na=False, regex=True)
        elif condition.op == "eq":
            mask &= series == value
        elif condition.op == "ne":
            mask &= series != value
        elif condition.op == "gt":
            mask &= series > value
        elif condition.op == "gte":
            mask &= series >= value
        elif condition.op == "lt":
            mask &= series < value
        elif condition.op == "lte":
            mask &= series <= value

    filtered = working.loc[mask]
    matched_rows = int(len(filtered))
    if query.sort:
        filtered = filtered.sort_values(
            query.sort.column,
            ascending=query.sort.direction == "asc",
            kind="mergesort",
            na_position="last",
        )
    return filtered.loc[:, requested].iloc[query.offset : query.offset + query.limit], matched_rows


def _json_value(value: Any) -> Any:
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    if isinstance(value, (datetime, date, pd.Timestamp)):
        return value.isoformat()
    if hasattr(value, "item"):
        value = value.item()
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def query_dataset(dataset: Dataset, query: DatasetQuery) -> DatasetQueryResult:
    schema = dataset.schema_json or {}
    sheet_names = {str(item.get("name")) for item in schema.get("sheets", [])}
    if query.sheet is not None and sheet_names and query.sheet not in sheet_names:
        raise ValueError(f"工作表不存在：{query.sheet}")
    sheet = query.sheet or schema.get("default_sheet")
    frame = read_dataset_frame(dataset.name, read_bytes(dataset.storage_hash), sheet)
    selected, matched_rows = apply_query(frame, query)
    rows = [
        {str(column): _json_value(value) for column, value in row.items()}
        for row in selected.to_dict(orient="records")
    ]
    columns = [{"name": str(name), "dtype": str(dtype)} for name, dtype in selected.dtypes.items()]
    return DatasetQueryResult(
        dataset_id=dataset.id,
        name=dataset.name,
        storage_hash=dataset.storage_hash,
        sheet=str(sheet) if sheet is not None else None,
        columns=columns,
        rows=rows,
        matched_rows=matched_rows,
        returned_rows=len(rows),
        receipt={
            "dataset_id": str(dataset.id),
            "storage_hash": dataset.storage_hash,
            "sheet": sheet,
            "columns": query.columns,
            "filters": [item.model_dump() for item in query.filters],
            "search": query.search,
            "sort": query.sort.model_dump() if query.sort else None,
            "offset": query.offset,
            "limit": query.limit,
        },
    )


def query_datasets(
    db: Session,
    project_id: uuid.UUID,
    queries: list[DatasetQuery],
) -> list[DatasetQueryResult]:
    ids = [query.dataset_id for query in queries]
    rows = list(db.scalars(select(Dataset).where(Dataset.id.in_(ids), Dataset.project_id == project_id)))
    by_id = {item.id: item for item in rows}
    if any(dataset_id not in by_id for dataset_id in ids):
        raise LookupError("dataset not found")
    return [query_dataset(by_id[query.dataset_id], query) for query in queries]
