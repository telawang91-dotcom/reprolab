from __future__ import annotations

import hashlib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1] / "deliverables" / "submission"
OUTPUT = ROOT / "MANIFEST-SHA256.txt"


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            value.update(block)
    return value.hexdigest()


if not ROOT.is_dir():
    raise SystemExit(f"submission directory not found: {ROOT}")


files = sorted(
    (path for path in ROOT.rglob("*") if path.is_file() and path != OUTPUT),
    key=lambda path: path.relative_to(ROOT).as_posix(),
)
lines = [f"{digest(path)}  {path.relative_to(ROOT).as_posix()}" for path in files]
OUTPUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
print(f"files={len(files)} output={OUTPUT}")
