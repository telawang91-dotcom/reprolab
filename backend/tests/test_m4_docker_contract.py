from pathlib import Path

from app.core.config import settings
from app.services.sandbox.runner import _execution_paths


def test_docker_kernel_enforces_resource_and_network_contract():
    source = (Path(__file__).parents[1] / "app/services/sandbox/docker_kernel.py").read_text(encoding="utf-8")
    assert 'internal=True' in source
    assert 'mem_limit="512m"' in source
    assert 'nano_cpus=1_000_000_000' in source
    assert 'read_only=True' in source
    assert 'cap_drop=["ALL"]' in source
    assert '"mode": "ro"' in source


def test_dataset_hash_maps_to_container_readonly_mount(monkeypatch):
    monkeypatch.setattr(settings, "sandbox_backend", "docker")
    assert _execution_paths(["a" * 64]) == ["/data/" + "a" * 64]
