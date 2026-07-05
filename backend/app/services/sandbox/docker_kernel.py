import json
import secrets
import shutil
import socket
import uuid
from pathlib import Path
from typing import Any

import docker
from docker.errors import DockerException, ImageNotFound, NotFound
from jupyter_client import BlockingKernelClient

from app.core.config import BACKEND_DIR, settings

NETWORK_NAME = "reprolab-sandbox-internal"
PORT_FIELDS = ("shell_port", "iopub_port", "stdin_port", "control_port", "hb_port")


def _free_ports(count: int) -> list[int]:
    sockets: list[socket.socket] = []
    try:
        for _ in range(count):
            item = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            item.bind(("127.0.0.1", 0))
            sockets.append(item)
        return [int(item.getsockname()[1]) for item in sockets]
    finally:
        for item in sockets:
            item.close()


def _docker_client():
    try:
        client = docker.from_env()
        client.ping()
        return client
    except DockerException as exc:
        raise RuntimeError("Docker daemon is unavailable") from exc


def _internal_network(client):
    try:
        return client.networks.get(NETWORK_NAME)
    except NotFound:
        return client.networks.create(
            NETWORK_NAME,
            driver="bridge",
            internal=True,
            labels={"app": "reprolab", "purpose": "sandbox-no-egress"},
        )


class DockerKernelManager:
    def __init__(self, container: Any, runtime_dir: Path, client: BlockingKernelClient):
        self.container = container
        self.runtime_dir = runtime_dir
        self.client = client

    def is_alive(self) -> bool:
        try:
            self.container.reload()
            return self.container.status == "running"
        except DockerException:
            return False

    def interrupt_kernel(self) -> None:
        self.container.kill(signal="SIGINT")

    def restart_kernel(self, now: bool = True) -> None:
        self.client.stop_channels()
        self.container.restart(timeout=0 if now else 10)
        self.client.start_channels()
        self.client.wait_for_ready(timeout=30)

    def shutdown_kernel(self, now: bool = False) -> None:
        try:
            self.container.remove(force=True)
        except NotFound:
            pass
        finally:
            shutil.rmtree(self.runtime_dir, ignore_errors=True)


def new_docker_handle() -> tuple[DockerKernelManager, BlockingKernelClient]:
    engine = _docker_client()
    try:
        engine.images.get(settings.sandbox_image)
    except ImageNotFound as exc:
        raise RuntimeError(
            f"sandbox image {settings.sandbox_image!r} is missing; run docker compose --profile sandbox build sandbox"
        ) from exc
    network = _internal_network(engine)
    ports = _free_ports(len(PORT_FIELDS))
    runtime_dir = BACKEND_DIR / ".runtime" / "kernels" / str(uuid.uuid4())
    runtime_dir.mkdir(parents=True, exist_ok=False)
    connection_file = runtime_dir / "kernel.json"
    connection = {
        "ip": "0.0.0.0",
        "transport": "tcp",
        "signature_scheme": "hmac-sha256",
        "key": secrets.token_hex(32),
        **dict(zip(PORT_FIELDS, ports, strict=True)),
    }
    connection_file.write_text(json.dumps(connection), encoding="utf-8")
    published = {f"{port}/tcp": ("127.0.0.1", port) for port in ports}
    try:
        container = engine.containers.run(
            settings.sandbox_image,
            command=["python", "-m", "ipykernel_launcher", "-f", "/connection/kernel.json"],
            name=f"reprolab-kernel-{uuid.uuid4().hex[:12]}",
            detach=True,
            network=network.name,
            ports=published,
            mem_limit="512m",
            nano_cpus=1_000_000_000,
            read_only=True,
            tmpfs={"/tmp": "rw,noexec,nosuid,size=64m"},
            volumes={
                str(runtime_dir): {"bind": "/connection", "mode": "ro"},
                str(settings.storage_dir): {"bind": "/data", "mode": "ro"},
            },
            cap_drop=["ALL"],
            security_opt=["no-new-privileges:true"],
            environment={"HOME": "/tmp", "MPLCONFIGDIR": "/tmp/matplotlib", "PYTHONUNBUFFERED": "1"},
            labels={"app": "reprolab", "purpose": "sandbox-kernel"},
        )
        client = BlockingKernelClient(connection_file=str(connection_file))
        client.load_connection_file()
        client.ip = "127.0.0.1"
        client.start_channels()
        client.wait_for_ready(timeout=45)
        return DockerKernelManager(container, runtime_dir, client), client
    except Exception:
        try:
            container.remove(force=True)  # type: ignore[possibly-undefined]
        except Exception:
            pass
        shutil.rmtree(runtime_dir, ignore_errors=True)
        raise

