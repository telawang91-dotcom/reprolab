import json
import secrets
import shutil
import socket
import time
import uuid
from pathlib import Path
from typing import Any

import docker
from docker.errors import DockerException, ImageNotFound, NotFound
from jupyter_client import BlockingKernelClient

from app.core.config import BACKEND_DIR, settings

NETWORK_NAME = "reprolab-sandbox-internal"
PROXY_NETWORK_NAME = "reprolab-sandbox-proxy"
PORT_FIELDS = ("shell_port", "iopub_port", "stdin_port", "control_port", "hb_port")
PROXY_SCRIPT = """
import os, select, socket, threading, time

target = os.environ["TARGET"]
ports = [int(value) for value in os.environ["PORTS"].split(",")]

def relay(client, port):
    deadline = time.monotonic() + 15
    while True:
        try:
            upstream = socket.create_connection((target, port), timeout=1)
            break
        except OSError:
            if time.monotonic() >= deadline:
                client.close()
                return
            time.sleep(0.1)
    peers = (client, upstream)
    try:
        while True:
            readable, _, _ = select.select(peers, [], [])
            for source in readable:
                data = source.recv(65536)
                if not data:
                    return
                (upstream if source is client else client).sendall(data)
    finally:
        client.close()
        upstream.close()

def serve(port):
    listener = socket.socket()
    listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    listener.bind(("0.0.0.0", port))
    listener.listen()
    while True:
        client, _ = listener.accept()
        threading.Thread(target=relay, args=(client, port), daemon=True).start()

for port in ports:
    threading.Thread(target=serve, args=(port,), daemon=True).start()
threading.Event().wait()
"""


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


def _wait_for_ports(ports: list[int], timeout: float = 15) -> None:
    deadline = time.monotonic() + timeout
    pending = set(ports)
    while pending and time.monotonic() < deadline:
        for port in list(pending):
            try:
                with socket.create_connection(("127.0.0.1", port), timeout=0.2):
                    pending.remove(port)
            except OSError:
                pass
        if pending:
            time.sleep(0.1)
    if pending:
        raise RuntimeError(f"sandbox ports did not become ready: {sorted(pending)}")


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


def _proxy_network(client):
    try:
        return client.networks.get(PROXY_NETWORK_NAME)
    except NotFound:
        return client.networks.create(
            PROXY_NETWORK_NAME,
            driver="bridge",
            labels={"app": "reprolab", "purpose": "sandbox-host-proxy"},
        )


class DockerKernelManager:
    def __init__(self, container: Any, proxy: Any, runtime_dir: Path, client: BlockingKernelClient):
        self.container = container
        self.proxy = proxy
        self.runtime_dir = runtime_dir
        self.client = client

    def is_alive(self) -> bool:
        try:
            self.container.reload()
            self.proxy.reload()
            return self.container.status == "running" and self.proxy.status == "running"
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
            self.proxy.remove(force=True)
        except NotFound:
            pass
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
    proxy_network = _proxy_network(engine)
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
    container = None
    proxy = None
    try:
        container = engine.containers.run(
            settings.sandbox_image,
            command=["python", "-m", "ipykernel_launcher", "-f", "/connection/kernel.json"],
            name=f"reprolab-kernel-{uuid.uuid4().hex[:12]}",
            detach=True,
            network=network.name,
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
        proxy = engine.containers.run(
            settings.sandbox_image,
            command=["python", "-u", "-c", PROXY_SCRIPT],
            name=f"reprolab-proxy-{uuid.uuid4().hex[:12]}",
            detach=True,
            network=proxy_network.name,
            ports=published,
            mem_limit="128m",
            nano_cpus=250_000_000,
            read_only=True,
            tmpfs={"/tmp": "rw,noexec,nosuid,size=16m"},
            cap_drop=["ALL"],
            security_opt=["no-new-privileges:true"],
            environment={"TARGET": container.name, "PORTS": ",".join(map(str, ports))},
            labels={"app": "reprolab", "purpose": "sandbox-host-proxy"},
        )
        network.connect(proxy)
        _wait_for_ports(ports)
        client = BlockingKernelClient(connection_file=str(connection_file))
        client.load_connection_file()
        client.ip = "127.0.0.1"
        client.start_channels()
        client.wait_for_ready(timeout=45)
        return DockerKernelManager(container, proxy, runtime_dir, client), client
    except Exception as exc:
        logs = ""
        if container is not None:
            try:
                logs = container.logs(stdout=True, stderr=True).decode("utf-8", errors="replace")[-2000:]
            except DockerException:
                pass
        if proxy is not None:
            try:
                logs += "\nproxy:\n" + proxy.logs(stdout=True, stderr=True).decode("utf-8", errors="replace")[-2000:]
            except DockerException:
                pass
        try:
            if proxy is not None:
                proxy.remove(force=True)
            if container is not None:
                container.remove(force=True)
        except Exception:
            pass
        shutil.rmtree(runtime_dir, ignore_errors=True)
        detail = logs.strip() or str(exc)
        raise RuntimeError(f"Docker kernel failed to start: {detail}") from exc
