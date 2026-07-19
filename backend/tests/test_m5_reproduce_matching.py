import uuid

from app.models.knowledge import Artifact
from app.services.lineage.reproduce import _match_replayed_artifacts


def _artifact(kind: str, title: str, value) -> Artifact:
    return Artifact(id=uuid.uuid4(), kind=kind, title=title, value_json=value, tol=1e-6)


def test_replay_matches_artifacts_by_kind_when_capture_order_changes():
    old_table = _artifact("table", "汇总表", {"data": [[1, 2]]})
    old_figure = _artifact("figure", "趋势图", {"figure_data": [[1, 2, 3]]})
    new_figure = _artifact("figure", "趋势图", {"figure_data": [[1, 2, 3]]})
    new_table = _artifact("table", "汇总表", {"data": [[1, 2]]})

    pairs = _match_replayed_artifacts([old_table, old_figure], [new_figure, new_table])

    assert pairs == [(old_table, new_table), (old_figure, new_figure)]


def test_replay_prefers_equal_value_when_generic_titles_collide():
    first = _artifact("table", "分析数据表", {"data": [[1]]})
    second = _artifact("table", "分析数据表", {"data": [[2]]})
    replay_second = _artifact("table", "分析数据表", {"data": [[2]]})
    replay_first = _artifact("table", "分析数据表", {"data": [[1]]})

    pairs = _match_replayed_artifacts([first, second], [replay_second, replay_first])

    assert pairs == [(first, replay_first), (second, replay_second)]
