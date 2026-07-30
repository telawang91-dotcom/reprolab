import pandas as pd

from app.services.lineage.attribution import _column_ablations, _rowgroup_ablations


def test_column_ablation_only_emits_changed_dimensions():
    old = pd.DataFrame({"group": ["a", "b"], "value": [1.0, 2.0], "same": [7, 7]})
    new = pd.DataFrame({"group": ["a", "b"], "value": [10.0, 20.0], "same": [7, 7]})
    items = _column_ablations(0, old, new, "data.csv")
    assert [item.dimension for item in items] == ["data.csv:value"]
    assert items[0].frame["value"].tolist() == [1.0, 2.0]
    assert items[0].frame["same"].tolist() == [7, 7]


def test_rowgroup_ablation_rolls_back_only_selected_group():
    old = pd.DataFrame({"group": ["a", "a", "b"], "value": [1, 2, 3]})
    new = pd.DataFrame({"group": ["a", "a", "b"], "value": [10, 20, 30]})
    items = _rowgroup_ablations(0, old, new, "data.csv")
    group_a = next(item for item in items if item.dimension == "data.csv:group=a")
    assert group_a.frame["value"].tolist() == [1, 2, 30]


def test_keyed_column_ablation_handles_reordered_added_and_deleted_rows():
    old = pd.DataFrame({
        "sample_id": ["a", "b", "c"],
        "value": [1.0, 2.0, 3.0],
        "same": [7, 7, 7],
    })
    new = pd.DataFrame({
        "sample_id": ["c", "b", "d"],
        "value": [30.0, 20.0, 40.0],
        "same": [7, 7, 7],
    })

    items = _column_ablations(0, old, new, "data.csv", ["sample_id"])

    value = next(item for item in items if item.dimension == "data.csv:value")
    assert value.frame["sample_id"].tolist() == ["c", "b", "d"]
    assert value.frame["value"].tolist() == [3.0, 2.0, 40.0]
    membership = next(
        item for item in items
        if item.dimension == "data.csv:__row_membership__"
    )
    assert membership.frame["sample_id"].tolist() == ["a", "b", "c"]
    assert membership.frame["value"].tolist() == [1.0, 20.0, 30.0]
    assert "新增 1 行、删除 1 行" in membership.detail


def test_key_alignment_rejects_duplicate_identifiers():
    old = pd.DataFrame({"id": ["a", "a"], "value": [1, 2]})
    new = pd.DataFrame({"id": ["a", "b"], "value": [1, 2]})

    try:
        _column_ablations(0, old, new, "data.csv", ["id"])
    except ValueError as exc:
        assert "uniquely identify" in str(exc)
    else:
        raise AssertionError("duplicate primary keys must be rejected")
