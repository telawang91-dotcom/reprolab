import json
import platform
import subprocess
import sys
from dataclasses import dataclass
from functools import lru_cache

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.knowledge import EnvSnapshot
from app.core.config import settings
from app.services.lineage.hashing import environment_hash


@dataclass(frozen=True, slots=True)
class EnvironmentInfo:
    python_version: str
    packages: list[str]
    env_hash: str


@lru_cache(maxsize=1)
def capture_environment() -> EnvironmentInfo:
    """Capture the backend interpreter for the explicit host sandbox backend."""
    completed = subprocess.run(
        [sys.executable, "-m", "pip", "freeze", "--disable-pip-version-check"],
        check=True,
        capture_output=True,
        text=True,
        timeout=30,
    )
    packages = sorted(line.strip() for line in completed.stdout.splitlines() if line.strip())
    python_version = platform.python_version()
    return EnvironmentInfo(python_version, packages, environment_hash(packages, python_version))


def _docker_client():
    import docker

    client = docker.from_env()
    client.ping()
    return client


@lru_cache(maxsize=8)
def _capture_docker_environment(image_id: str) -> EnvironmentInfo:
    """Read the immutable execution image's Python environment inside Docker."""
    client = _docker_client()
    script = (
        "import json,platform,subprocess,sys;"
        "raw=subprocess.check_output([sys.executable,'-m','pip','freeze',"
        "'--disable-pip-version-check'],text=True);"
        "print(json.dumps({'python_version':platform.python_version(),"
        "'packages':sorted(x.strip() for x in raw.splitlines() if x.strip())}))"
    )
    try:
        output = client.containers.run(
            image_id,
            ["python", "-c", script],
            remove=True,
            network_disabled=True,
            mem_limit="512m",
            nano_cpus=1_000_000_000,
            read_only=True,
            tmpfs={"/tmp": "rw,noexec,nosuid,size=64m"},
            cap_drop=["ALL"],
            security_opt=["no-new-privileges"],
        )
        payload = json.loads(output.decode("utf-8"))
        python_version = str(payload["python_version"])
        packages = sorted(str(item) for item in payload["packages"])
    except Exception as exc:
        raise RuntimeError("failed to capture the Docker sandbox environment") from exc
    return EnvironmentInfo(
        python_version,
        packages,
        environment_hash(packages, python_version),
    )


def capture_execution_environment() -> EnvironmentInfo:
    """Capture the environment that will actually execute the submitted code."""
    if settings.sandbox_backend == "host":
        return capture_environment()
    if settings.sandbox_backend != "docker":
        raise RuntimeError(f"unsupported sandbox backend: {settings.sandbox_backend}")
    client = _docker_client()
    try:
        image = client.images.get(settings.sandbox_image)
    except Exception as exc:
        raise RuntimeError(
            f"sandbox image {settings.sandbox_image!r} is unavailable"
        ) from exc
    return _capture_docker_environment(image.id)


def get_or_create_snapshot(db: Session, info: EnvironmentInfo) -> EnvSnapshot:
    existing = db.scalar(select(EnvSnapshot).where(EnvSnapshot.env_hash == info.env_hash))
    if existing is not None:
        return existing
    snapshot = EnvSnapshot(
        python_version=info.python_version,
        packages=info.packages,
        env_hash=info.env_hash,
    )
    db.add(snapshot)
    db.flush()
    return snapshot
