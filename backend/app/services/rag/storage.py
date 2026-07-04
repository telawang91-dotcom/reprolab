from hashlib import sha256
from pathlib import Path

from app.core.config import settings


def save_bytes(data: bytes) -> str:
    digest = sha256(data).hexdigest()
    settings.storage_dir.mkdir(parents=True, exist_ok=True)
    target = settings.storage_dir / digest
    if not target.exists():
        temporary = target.with_suffix(".tmp")
        temporary.write_bytes(data)
        temporary.replace(target)
    return digest


def path_of(storage_hash: str) -> Path:
    if len(storage_hash) != 64 or any(char not in "0123456789abcdef" for char in storage_hash):
        raise ValueError("invalid sha256 storage hash")
    path = settings.storage_dir / storage_hash
    if not path.is_file():
        raise FileNotFoundError(storage_hash)
    return path


def read_bytes(storage_hash: str) -> bytes:
    return path_of(storage_hash).read_bytes()

