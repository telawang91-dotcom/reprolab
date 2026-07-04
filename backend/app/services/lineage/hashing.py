import hashlib
import json


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def environment_hash(packages: list[str], python_version: str) -> str:
    serialized = json.dumps(sorted(packages), ensure_ascii=False, separators=(",", ":"))
    return sha256_text(serialized + python_version)


def merged_input_hash(dataset_storage_hashes: list[str]) -> str:
    return sha256_text("".join(sorted(dataset_storage_hashes)))


def trusted_code_hash(code: str, lang: str, input_hash: str, env_hash: str) -> str:
    return sha256_text(code + lang + input_hash + env_hash)

