from types import SimpleNamespace

from app.core.config import settings
from app.services.sandbox import env
from app.services.lineage.hashing import environment_hash


class _FakeContainers:
    def __init__(self, payload: bytes):
        self.payload = payload
        self.calls = []

    def run(self, image_id, command, **kwargs):
        self.calls.append((image_id, command, kwargs))
        return self.payload


class _FakeImages:
    def get(self, image):
        return SimpleNamespace(id=f"sha256:{image}")


class _FakeDocker:
    def __init__(self, payload: bytes):
        self.containers = _FakeContainers(payload)
        self.images = _FakeImages()


def test_host_backend_captures_the_backend_interpreter(monkeypatch):
    expected = env.EnvironmentInfo("3.11.9", ["numpy==1.26.4"], "host-hash")
    monkeypatch.setattr(settings, "sandbox_backend", "host")
    monkeypatch.setattr(env, "capture_environment", lambda: expected)

    assert env.capture_execution_environment() is expected


def test_docker_backend_hashes_packages_read_inside_the_execution_image(monkeypatch):
    payload = (
        b'{"python_version":"3.11.13","packages":'
        b'["pandas==2.2.2","numpy==1.26.4"]}\n'
    )
    fake = _FakeDocker(payload)
    monkeypatch.setattr(settings, "sandbox_backend", "docker")
    monkeypatch.setattr(settings, "sandbox_image", "reprolab-sandbox:test")
    monkeypatch.setattr(env, "_docker_client", lambda: fake)
    env._capture_docker_environment.cache_clear()

    captured = env.capture_execution_environment()

    assert captured.python_version == "3.11.13"
    assert captured.packages == ["numpy==1.26.4", "pandas==2.2.2"]
    assert captured.env_hash == environment_hash(captured.packages, "3.11.13")
    image_id, command, options = fake.containers.calls[0]
    assert image_id == "sha256:reprolab-sandbox:test"
    assert command[:2] == ["python", "-c"]
    assert options["network_disabled"] is True
    assert options["read_only"] is True
    assert options["cap_drop"] == ["ALL"]


def test_docker_environment_cache_is_scoped_by_image_identity(monkeypatch):
    payload = b'{"python_version":"3.11.13","packages":["numpy==1.26.4"]}\n'
    fake = _FakeDocker(payload)
    monkeypatch.setattr(env, "_docker_client", lambda: fake)
    env._capture_docker_environment.cache_clear()

    first = env._capture_docker_environment("sha256:first")
    second = env._capture_docker_environment("sha256:first")
    third = env._capture_docker_environment("sha256:second")

    assert first is second
    assert third.env_hash == first.env_hash
    assert len(fake.containers.calls) == 2
