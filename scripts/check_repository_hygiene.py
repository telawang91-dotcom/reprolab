from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import unquote


ROOT = Path(__file__).resolve().parents[1]
MAX_TRACKED_BYTES = 25 * 1024 * 1024

ALLOWED_ROOT_FILES = {
    ".dockerignore",
    ".env.example",
    ".gitattributes",
    ".gitignore",
    "AGENTS.md",
    "CHANGELOG.md",
    "README.md",
    "SECURITY.md",
    "docker-compose.yml",
}
ALLOWED_ROOT_DIRS = {
    ".github",
    "backend",
    "benchmarks",
    "deliverables",
    "docker",
    "docs",
    "frontend",
    "scripts",
    "tasks",
}
FORBIDDEN_TRACKED_PREFIXES = (
    ".backups/",
    ".downloads/",
    ".models/",
    ".runtime/",
    ".venv/",
    "backend/.runtime/",
    "backend/restore-storage/",
    "frontend/.next/",
    "frontend/node_modules/",
    "frontend/playwright-report/",
    "frontend/test-results/",
)
SECRET_PATTERNS = {
    "OpenAI-style token": re.compile(r"sk-[A-Za-z0-9_-]{20,}"),
    "GitHub token": re.compile(r"(?:ghp|github_pat)_[A-Za-z0-9_]{20,}"),
    "Google API key": re.compile(r"AIza[0-9A-Za-z_-]{20,}"),
    "private key": re.compile(r"-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----"),
}
MARKDOWN_LINK = re.compile(r"!?(?:\[[^\]]*\])\(([^)]+)\)")


def tracked_files() -> list[str]:
    result = subprocess.run(
        ["git", "-C", str(ROOT), "ls-files", "-z"],
        check=True,
        capture_output=True,
    )
    return [item.decode("utf-8") for item in result.stdout.split(b"\0") if item]


def is_forbidden(path: str) -> bool:
    normalized = path.replace("\\", "/")
    if normalized == ".env" or normalized.startswith(FORBIDDEN_TRACKED_PREFIXES):
        return True
    if normalized.startswith("backend/storage/") and normalized != "backend/storage/.gitkeep":
        return True
    if normalized.startswith("deliverables/") and normalized != "deliverables/README.md":
        return True
    return False


def read_text(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        return None


def check_readme_links(errors: list[str]) -> None:
    readme = ROOT / "README.md"
    content = read_text(readme)
    if content is None:
        errors.append("README.md is missing or is not valid UTF-8")
        return
    for raw_target in MARKDOWN_LINK.findall(content):
        target = raw_target.strip().split(maxsplit=1)[0].strip("<>")
        if not target or target.startswith(("#", "http://", "https://", "mailto:")):
            continue
        local_path = unquote(target.split("#", 1)[0])
        if not (ROOT / local_path).exists():
            errors.append(f"README link target does not exist: {target}")


def main() -> int:
    errors: list[str] = []
    tracked = tracked_files()

    for relative in tracked:
        path = ROOT / relative
        first = relative.replace("\\", "/").split("/", 1)[0]
        if "/" not in relative.replace("\\", "/") and first not in ALLOWED_ROOT_FILES:
            errors.append(f"unexpected tracked file in repository root: {relative}")
        elif "/" in relative.replace("\\", "/") and first not in ALLOWED_ROOT_DIRS:
            errors.append(f"unexpected tracked directory in repository root: {first}/")
        if is_forbidden(relative):
            errors.append(f"local/runtime artifact must not be tracked: {relative}")
        if not path.is_file():
            continue
        if path.stat().st_size > MAX_TRACKED_BYTES:
            errors.append(
                f"tracked file exceeds {MAX_TRACKED_BYTES // (1024 * 1024)} MiB: {relative}"
            )
        text = read_text(path)
        if text is None:
            continue
        for label, pattern in SECRET_PATTERNS.items():
            if pattern.search(text):
                errors.append(f"possible {label} in tracked file: {relative}")

    check_readme_links(errors)

    if errors:
        print("Repository hygiene check failed:", file=sys.stderr)
        for error in sorted(set(errors)):
            print(f"- {error}", file=sys.stderr)
        return 1

    print(
        f"Repository hygiene passed: {len(tracked)} tracked paths, "
        "no local artifacts, oversized files, obvious secrets, or broken README links."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
