import uuid

import pytest

from app.core.config import settings
from app.services.sandbox.kernel import CapturedOutput, ExecResult, execute_code, kernel_registry
from app.services.sandbox.runner import _discard_untrusted_artifacts, _enforce_artifact_budget


@pytest.fixture(autouse=True)
def host_sandbox(monkeypatch):
    monkeypatch.setattr(settings, "sandbox_backend", "host")
    yield
    kernel_registry.close_all()


def test_persistent_kernel_and_seed_reproducibility():
    conversation_id = uuid.uuid4()
    try:
        assert execute_code("x = 41", conversation_id=conversation_id).status == "success"
        second = execute_code("print(x + 1)", conversation_id=conversation_id)
        assert second.stdout == "42"
        first_random = execute_code("import random; print(random.random())", seed=7, conversation_id=conversation_id)
        second_random = execute_code("import random; print(random.random())", seed=7, conversation_id=conversation_id)
        assert first_random.stdout == second_random.stdout
    finally:
        kernel_registry.close_all()


def test_timeout_interrupts_but_kernel_recovers():
    conversation_id = uuid.uuid4()
    try:
        timeout = execute_code("while True: pass", timeout=5, conversation_id=conversation_id)
        assert timeout.status == "error"
        assert timeout.timed_out is True
        recovered = execute_code("print('alive')", timeout=10, conversation_id=conversation_id)
        assert recovered.status == "success"
        assert recovered.stdout == "alive"
    finally:
        kernel_registry.close_all()


def test_clean_kernel_captures_numeric_and_figure_outputs():
    numeric = execute_code("6 * 7", timeout=15)
    assert numeric.status == "success"
    assert numeric.artifacts[0].kind == "number"
    assert numeric.artifacts[0].value == 42
    figure = execute_code(
        "import matplotlib.pyplot as plt\nplt.plot([1, 2], [3, 4])\nplt.show()",
        timeout=20,
    )
    assert figure.status == "success"
    captured = next(item for item in figure.artifacts if item.kind == "figure")
    assert captured.data
    assert captured.value["version"] == 1
    assert captured.value["axes"][0]["lines"][0]["x"] == [1, 2]
    assert captured.value["axes"][0]["lines"][0]["y"] == [3, 4]


def test_figure_capture_uses_the_chart_title_instead_of_figure_number():
    figure = execute_code(
        "import matplotlib.pyplot as plt\nplt.plot([1, 2], [3, 4])\nplt.title('季度趋势')\nplt.show()",
        timeout=20,
    )
    captured = next(item for item in figure.artifacts if item.kind == "figure")
    assert captured.title == "季度趋势"
    assert captured.value["axes"][0]["title"] == "季度趋势"


def test_dataset_paths_are_real_execution_inputs(tmp_path):
    dataset = tmp_path / "input.txt"
    dataset.write_text("original", encoding="utf-8")
    result = execute_code(
        "print(open(DATASET_PATHS[0], encoding='utf-8').read())",
        dataset_paths=[str(dataset)],
        timeout=15,
    )
    assert result.status == "success"
    assert result.stdout == "original"


def test_load_dataset_reads_content_addressed_csv_without_extension(tmp_path):
    dataset = tmp_path / ("a" * 64)
    dataset.write_text("species,mass\nAdelie,3700\nGentoo,5000\n", encoding="utf-8")
    result = execute_code(
        "df = load_dataset(0)\nprint(df.shape, df['mass'].sum())",
        dataset_paths=[str(dataset)],
        timeout=15,
    )
    assert result.status == "success"
    assert result.stdout == "(2, 2) 8700"


def test_load_dataset_normalizes_paired_scientific_series(tmp_path):
    dataset = tmp_path / ("b" * 64)
    dataset.write_text(
        "Survey,,Scan\nBinding Energy,Counts,Binding Energy,Counts\n"
        "1,10,1,20\n2,11,2,21\n3,12,3,22\n4,13,4,23\n5,14,5,24\n",
        encoding="utf-8",
    )
    result = execute_code(
        "df = load_dataset(0)\nprint(df.shape, '|'.join(df.columns))\n"
        "print(df.attrs['reprolab_schema']['source_format'], df.attrs['reprolab_schema']['series'][0]['valid_point_count'])",
        dataset_paths=[str(dataset)],
        timeout=15,
    )
    assert result.status == "success"
    assert result.stdout == (
        "(5, 4) Survey_axis|Survey_intensity|Scan_axis|Scan_intensity\n"
        "paired_series_csv 5"
    )


@pytest.mark.parametrize(
    "code,name",
    [
        ("DATASET_PATHS = ['/tmp/fake.csv']", "DATASET_PATHS"),
        ("def load_dataset(index):\n    return None", "load_dataset"),
        ("emit_artifact = lambda *args: None", "emit_artifact"),
        ("for SEED in [1]:\n    pass", "SEED"),
    ],
)
def test_generated_code_cannot_replace_system_managed_symbols(code, name):
    result = execute_code(code, timeout=15)
    assert result.status == "error"
    assert result.stdout.startswith("CODE_POLICY_VIOLATION:")
    assert name in result.stdout


def test_explicit_coefficient_artifact_is_structured():
    result = execute_code("emit_artifact('coefficient', 0.083, title='mass effect', tol=1e-5)", timeout=15)
    assert result.status == "success"
    assert len(result.artifacts) == 1
    artifact = result.artifacts[0]
    assert artifact.kind == "coefficient"
    assert artifact.value == 0.083
    assert artifact.title == "mass effect"
    assert artifact.tol == 1e-5


def test_text_and_dataframe_artifacts_are_normalized():
    result = execute_code(
        "import pandas as pd\n"
        "emit_artifact('text', 'field meaning', title='description')\n"
        "emit_artifact('table', pd.DataFrame({'species': ['Adelie'], 'count': [1]}), title='counts')",
        timeout=15,
    )
    assert result.status == "success"
    assert result.artifacts[0].kind == "text"
    assert result.artifacts[0].value == "field meaning"
    assert result.artifacts[1].value["columns"] == ["species", "count"]
    assert result.artifacts[1].value["data"] == [["Adelie", 1]]


def test_period_index_table_artifact_is_serialized_without_recursion():
    result = execute_code(
        "import pandas as pd\n"
        "frame = pd.DataFrame({'value': [1.2, 2.4]}, index=pd.period_range('2024Q1', periods=2, freq='Q'))\n"
        "emit_artifact('table', frame, title='quarterly')",
        timeout=15,
    )
    assert result.status == "success"
    assert result.artifacts[0].value["index"] == ["2024Q1", "2024Q2"]
    assert result.artifacts[0].value["data"] == [[1.2], [2.4]]


def test_artifact_budget_curates_noisy_runs_without_failing_computation():
    execution = ExecResult(
        status="success",
        stdout="computed",
        artifacts=[
            CapturedOutput(kind="number", mime_type="application/json", value=1, title="metric"),
            CapturedOutput(kind="figure", mime_type="image/png", data=b"figure"),
            CapturedOutput(kind="figure", mime_type="image/png", data=b"figure"),
            CapturedOutput(kind="figure", mime_type="image/png", data=b"second-figure"),
            CapturedOutput(kind="table", mime_type="application/json", value={"rows": [1]}, title="summary"),
            CapturedOutput(kind="text", mime_type="text/plain", value="debug"),
        ],
    )
    limited = _enforce_artifact_budget(execution, 2)
    assert limited.status == "success"
    assert [item.kind for item in limited.artifacts] == ["figure", "table"]
    assert "retained 2 decision-relevant outputs from 5" in limited.stdout


def test_failed_execution_discards_values_emitted_before_exception():
    execution = ExecResult(
        status="error",
        stdout="ValueError: stopped",
        artifacts=[CapturedOutput(kind="number", mime_type="application/json", value=42)],
    )
    trusted = _discard_untrusted_artifacts(execution)
    assert trusted.status == "error"
    assert trusted.stdout == execution.stdout
    assert trusted.artifacts == []
