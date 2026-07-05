import ast
import base64
import queue
import re
import sys
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

from jupyter_client import KernelManager

from app.services.sandbox.seed import seed_prefix

ANSI_ESCAPE = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]")


@dataclass(slots=True)
class CapturedOutput:
    kind: str
    mime_type: str
    value: Any | None = None
    data: bytes | None = None
    title: str | None = None
    tol: float | None = None


@dataclass(slots=True)
class ExecResult:
    status: str
    stdout: str
    artifacts: list[CapturedOutput] = field(default_factory=list)
    timed_out: bool = False


@dataclass(slots=True)
class KernelHandle:
    manager: Any
    client: Any
    lock: threading.Lock = field(default_factory=threading.Lock)


def _new_host_handle() -> KernelHandle:
    manager = KernelManager(kernel_name="python3")
    # Always run the same locked Python 3.11 environment as the backend.
    manager.kernel_spec.argv = [sys.executable, "-m", "ipykernel_launcher", "-f", "{connection_file}"]
    manager.start_kernel()
    client = manager.client()
    client.start_channels()
    client.wait_for_ready(timeout=30)
    return KernelHandle(manager=manager, client=client)


def _new_handle() -> KernelHandle:
    from app.core.config import settings

    if settings.sandbox_backend == "host":
        return _new_host_handle()
    if settings.sandbox_backend == "docker":
        from app.services.sandbox.docker_kernel import new_docker_handle

        manager, client = new_docker_handle()
        return KernelHandle(manager=manager, client=client)
    raise RuntimeError(f"unsupported sandbox backend: {settings.sandbox_backend}")


def _as_artifacts(data: dict[str, Any]) -> list[CapturedOutput]:
    artifacts: list[CapturedOutput] = []
    if "application/vnd.reprolab.artifact+json" in data:
        payload = data["application/vnd.reprolab.artifact+json"]
        return [
            CapturedOutput(
                payload["kind"],
                "application/vnd.reprolab.artifact+json",
                value=payload.get("value"),
                title=payload.get("title"),
                tol=payload.get("tol"),
            )
        ]
    if "image/png" in data:
        artifacts.append(CapturedOutput("figure", "image/png", data=base64.b64decode(data["image/png"])))
    if "text/html" in data:
        artifacts.append(CapturedOutput("table", "text/html", value=data["text/html"]))
    if "text/plain" in data and not artifacts:
        text = data["text/plain"]
        try:
            parsed = ast.literal_eval(text)
        except (ValueError, SyntaxError):
            parsed = text
        kind = "number" if isinstance(parsed, (int, float)) and not isinstance(parsed, bool) else "text"
        artifacts.append(CapturedOutput(kind, "text/plain", value=parsed))
    return artifacts


def _wait_for_idle(handle: KernelHandle, message_id: str, timeout: float = 5) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            message = handle.client.get_iopub_msg(timeout=0.25)
        except queue.Empty:
            continue
        if message.get("parent_header", {}).get("msg_id") != message_id:
            continue
        if message["header"]["msg_type"] == "status" and message["content"].get("execution_state") == "idle":
            return
    # A kernel that cannot acknowledge an interrupt is unsafe to reuse.
    handle.manager.restart_kernel(now=True)
    handle.client.wait_for_ready(timeout=30)


def execute(
    handle: KernelHandle,
    code: str,
    seed: int = 42,
    timeout: float = 30,
    dataset_paths: list[str] | None = None,
) -> ExecResult:
    full_code = seed_prefix(seed, dataset_paths) + "\n" + code
    stdout: list[str] = []
    artifacts: list[CapturedOutput] = []
    status = "success"
    with handle.lock:
        message_id = handle.client.execute(full_code, store_history=True, stop_on_error=True)
        deadline = time.monotonic() + timeout
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                handle.manager.interrupt_kernel()
                _wait_for_idle(handle, message_id)
                stdout.append(f"Execution timed out after {timeout:g} seconds")
                return ExecResult("error", "\n".join(stdout), artifacts, timed_out=True)
            try:
                message = handle.client.get_iopub_msg(timeout=min(remaining, 1.0))
            except queue.Empty:
                continue
            if message.get("parent_header", {}).get("msg_id") != message_id:
                continue
            message_type = message["header"]["msg_type"]
            content = message["content"]
            if message_type == "stream":
                stdout.append(content.get("text", ""))
            elif message_type in {"display_data", "execute_result"}:
                artifacts.extend(_as_artifacts(content.get("data", {})))
            elif message_type == "error":
                status = "error"
                traceback = "\n".join(content.get("traceback", []))
                stdout.append(ANSI_ESCAPE.sub("", traceback))
            elif message_type == "status" and content.get("execution_state") == "idle":
                break
    return ExecResult(status, "".join(stdout).rstrip(), artifacts)


class KernelRegistry:
    def __init__(self) -> None:
        self._handles: dict[uuid.UUID, KernelHandle] = {}
        self._lock = threading.Lock()

    def get_or_create(self, conversation_id: uuid.UUID) -> KernelHandle:
        with self._lock:
            handle = self._handles.get(conversation_id)
            if handle is None or not handle.manager.is_alive():
                if handle is not None:
                    close_handle(handle)
                handle = _new_handle()
                self._handles[conversation_id] = handle
            return handle

    def close_all(self) -> None:
        with self._lock:
            for handle in self._handles.values():
                close_handle(handle)
            self._handles.clear()


def close_handle(handle: KernelHandle) -> None:
    try:
        handle.client.stop_channels()
    finally:
        handle.manager.shutdown_kernel(now=True)


kernel_registry = KernelRegistry()


def execute_code(
    code: str,
    seed: int = 42,
    timeout: float = 30,
    conversation_id: uuid.UUID | None = None,
    dataset_paths: list[str] | None = None,
) -> ExecResult:
    if conversation_id is not None:
        return execute(kernel_registry.get_or_create(conversation_id), code, seed, timeout, dataset_paths)
    handle = _new_handle()
    try:
        return execute(handle, code, seed, timeout, dataset_paths)
    finally:
        close_handle(handle)
