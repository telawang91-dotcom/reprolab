import uuid

import pandas as pd
import pytest
from pydantic import ValidationError

from app.models.knowledge import Dataset
from app.schemas.datasets import DatasetFilter, DatasetQuery, DatasetQueryRequest
from app.services.rag.datasets import apply_query, query_dataset


def test_declarative_query_filters_sorts_and_limits_without_expressions():
    frame = pd.DataFrame({
        "group": ["control", "treated", "treated", "control"],
        "score": [1.0, 3.5, 2.5, None],
        "note": ["baseline", "strong response", "mild response", "missing"],
    })
    query = DatasetQuery(
        dataset_id=uuid.uuid4(),
        columns=["group", "score"],
        filters=[DatasetFilter(column="group", op="eq", value="treated")],
        search="treated",
        sort={"column": "score", "direction": "desc"},
        limit=1,
    )
    selected, matched = apply_query(frame, query)
    assert matched == 2
    assert selected.to_dict(orient="records") == [{"group": "treated", "score": 3.5}]


def test_dataset_query_returns_hash_receipt_and_json_safe_missing_value(monkeypatch):
    dataset_id = uuid.uuid4()
    dataset = Dataset(
        id=dataset_id,
        project_id=uuid.uuid4(),
        name="measurements.tsv",
        storage_hash="a" * 64,
        schema_json={
            "row_count": 2,
            "column_count": 2,
            "columns": [{"name": "sample", "dtype": "object"}, {"name": "value", "dtype": "float64"}],
        },
    )
    monkeypatch.setattr(
        "app.services.rag.datasets.read_bytes",
        lambda _: b"sample\tvalue\nA\t1.5\nB\t\n",
    )
    result = query_dataset(dataset, DatasetQuery(dataset_id=dataset_id, limit=10))
    assert result.storage_hash == "a" * 64
    assert result.rows == [{"sample": "A", "value": 1.5}, {"sample": "B", "value": None}]
    assert result.receipt["dataset_id"] == str(dataset_id)
    assert result.receipt["limit"] == 10


def test_dataset_query_contract_rejects_raw_sql_and_unknown_fields():
    with pytest.raises(ValidationError):
        DatasetQueryRequest.model_validate({
            "project_id": str(uuid.uuid4()),
            "queries": [{"dataset_id": str(uuid.uuid4()), "sql": "DROP TABLE datasets"}],
        })


def test_dataset_query_rejects_unknown_column():
    frame = pd.DataFrame({"value": [1, 2]})
    query = DatasetQuery(dataset_id=uuid.uuid4(), filters=[{"column": "missing", "op": "eq", "value": 1}])
    with pytest.raises(ValueError, match="字段不存在"):
        apply_query(frame, query)
