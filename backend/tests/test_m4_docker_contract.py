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


def test_compose_keeps_build_only_sandbox_and_persistent_runtime_config():
    compose = (Path(__file__).parents[2] / "docker-compose.yml").read_text(encoding="utf-8")
    assert "\n  sandbox:\n" in compose
    assert 'profiles: ["sandbox"]' in compose
    assert "dockerfile: docker/sandbox.Dockerfile" in compose
    assert "PYTHON_BASE: ${REPROLAB_PYTHON_BASE:-python:3.11-slim-bookworm}" in compose
    assert "REPROLAB_RUNTIME_ENV_PATH: /data/config/runtime.env" in compose
    assert "reprolab_config:/data/config" in compose


def test_application_image_runs_as_unprivileged_user_without_setpriv_dependency():
    root = Path(__file__).parents[2]
    dockerfile = (root / "docker/app.Dockerfile").read_text(encoding="utf-8")
    entrypoint = (root / "docker/container-entrypoint.sh").read_text(encoding="utf-8")
    assert "USER reprolab" in dockerfile
    assert "/home/reprolab" in dockerfile
    assert "setpriv" not in entrypoint


def test_docker_context_excludes_secrets_and_delivery_archives():
    root = Path(__file__).parents[2]
    dockerignore = (root / ".dockerignore").read_text(encoding="utf-8")
    attributes = (root / ".gitattributes").read_text(encoding="utf-8")
    assert "\n.env\n" in f"\n{dockerignore}"
    assert "\ndeliverables\n" in f"\n{dockerignore}"
    assert "!.env.example" in dockerignore
    assert "*.sh text eol=lf" in attributes


def test_dataset_hash_maps_to_container_readonly_mount(monkeypatch):
    monkeypatch.setattr(settings, "sandbox_backend", "docker")
    assert _execution_paths(["a" * 64]) == ["/data/" + "a" * 64]
