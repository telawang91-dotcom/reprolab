import uuid

from app.services.sandbox.kernel import execute_code, kernel_registry


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
    assert any(item.kind == "figure" and item.data for item in figure.artifacts)
