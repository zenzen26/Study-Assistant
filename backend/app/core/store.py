from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
UPLOADS_DIR = DATA_DIR / "uploads"
STORE_PATH = DATA_DIR / "store.json"
ENV_PATH = Path(__file__).resolve().parents[2] / ".env"
NVIDIA_API_KEY_ENV = "NVIDIA_API_KEY"

DEFAULT_STORE: dict[str, Any] = {
    "settings": {},
    "resources": [],
    "flashcard_sets": [],
    "lectures": [],
}


def ensure_store() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    if not STORE_PATH.exists():
        STORE_PATH.write_text(json.dumps(DEFAULT_STORE, indent=2), encoding="utf-8")


def read_store() -> dict[str, Any]:
    ensure_store()
    return json.loads(STORE_PATH.read_text(encoding="utf-8"))


def write_store(store: dict[str, Any]) -> None:
    STORE_PATH.write_text(json.dumps(store, indent=2), encoding="utf-8")


def _parse_env_value(raw: str) -> str:
    value = raw.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        value = value[1:-1]
        if raw.strip().startswith('"'):
            value = value.replace('\\"', '"').replace("\\\\", "\\")
    return value


def _is_target_env_line(line: str, key: str) -> bool:
    if "=" not in line:
        return False
    left = line.split("=", 1)[0].strip()
    if left == key:
        return True
    if left.startswith("export "):
        return left.removeprefix("export ").strip() == key
    return False


def read_env_value(key: str) -> str:
    process_value = os.getenv(key, "").strip()
    if process_value:
        return process_value
    if not ENV_PATH.exists():
        return ""
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or not _is_target_env_line(line, key):
            continue
        _, raw_value = line.split("=", 1)
        value = _parse_env_value(raw_value)
        if value.strip():
            return value.strip()
    return ""


def write_env_value(key: str, value: str) -> None:
    clean_value = value.strip()
    if not clean_value:
        raise ValueError("Cannot save empty env value")

    escaped = clean_value.replace("\\", "\\\\").replace('"', '\\"')
    new_line = f'{key}="{escaped}"'

    lines = ENV_PATH.read_text(encoding="utf-8").splitlines() if ENV_PATH.exists() else []
    updated_lines: list[str] = []
    replaced = False
    for line in lines:
        if _is_target_env_line(line, key):
            if not replaced:
                updated_lines.append(new_line)
                replaced = True
            continue
        updated_lines.append(line)
    if not replaced:
        updated_lines.append(new_line)

    ENV_PATH.write_text("\n".join(updated_lines).rstrip() + "\n", encoding="utf-8")
    os.environ[key] = clean_value


def delete_env_value(key: str) -> None:
    os.environ.pop(key, None)
    if not ENV_PATH.exists():
        return
    kept_lines = [line for line in ENV_PATH.read_text(encoding="utf-8").splitlines() if not _is_target_env_line(line, key)]
    ENV_PATH.write_text("\n".join(kept_lines).rstrip() + "\n", encoding="utf-8")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


def mask_api_key(raw_key: str) -> str:
    key = raw_key.strip()
    if len(key) <= 8:
        return "*" * len(key)
    return f"{key[:6]}{'*' * max(0, len(key) - 10)}{key[-4:]}"
