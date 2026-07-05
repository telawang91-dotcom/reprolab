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
