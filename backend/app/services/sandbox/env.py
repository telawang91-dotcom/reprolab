import platform
import subprocess
import sys
from dataclasses import dataclass
from functools import lru_cache

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.knowledge import EnvSnapshot
from app.services.lineage.hashing import environment_hash


@dataclass(frozen=True, slots=True)
class EnvironmentInfo:
    python_version: str
    packages: list[str]
    env_hash: str


@lru_cache(maxsize=1)
def capture_environment() -> EnvironmentInfo:
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
