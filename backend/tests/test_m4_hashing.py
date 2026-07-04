from app.services.sandbox.hashing import environment_hash, merged_input_hash, trusted_code_hash


def test_hashes_are_order_stable_and_environment_bound():
    env_a = environment_hash(["numpy==1.26.4", "pandas==2.2.2"], "3.11.9")
    env_same = environment_hash(["pandas==2.2.2", "numpy==1.26.4"], "3.11.9")
    env_b = environment_hash(["numpy==2.0.0", "pandas==2.2.2"], "3.11.9")
    inputs = merged_input_hash(["b", "a"])
    assert env_a == env_same
    assert env_a != env_b
    assert trusted_code_hash("print(1)", "python", inputs, env_a) == trusted_code_hash(
        "print(1)", "python", merged_input_hash(["a", "b"]), env_same
    )
    assert trusted_code_hash("print(1)", "python", inputs, env_a) != trusted_code_hash(
        "print(1)", "python", inputs, env_b
    )

