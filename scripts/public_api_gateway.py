"""Expose only ReproLab's platform API through a token-protected local gateway."""

from __future__ import annotations

import hmac
import json
import os
import sys
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit


UPSTREAM = os.getenv("REPROLAB_GATEWAY_UPSTREAM", "http://127.0.0.1:8000").rstrip("/")
TOKEN = os.getenv("REPROLAB_GATEWAY_TOKEN", "").strip()
HOST = os.getenv("REPROLAB_GATEWAY_HOST", "127.0.0.1")
PORT = int(os.getenv("REPROLAB_GATEWAY_PORT", "8128"))
UPSTREAM_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))

PUBLIC_EXACT_PATHS = {
    "/",
    "/health",
    "/docs",
    "/docs/oauth2-redirect",
    "/openapi.json",
    "/redoc",
}
AGENT_PREFIX = "/api/v1/agent"
FORWARDED_REQUEST_HEADERS = {
    "accept",
    "content-type",
    "idempotency-key",
    "x-request-id",
}
FORWARDED_RESPONSE_HEADERS = {
    "content-type",
    "content-disposition",
    "x-request-id",
    "server-timing",
}


def _filtered_openapi(payload: bytes) -> bytes:
    spec = json.loads(payload)
    spec["paths"] = {
        path: operations
        for path, operations in spec.get("paths", {}).items()
        if path.startswith(AGENT_PREFIX) or path == "/health"
    }
    components = spec.setdefault("components", {})
    security_schemes = components.setdefault("securitySchemes", {})
    security_schemes["BearerAuth"] = {
        "type": "http",
        "scheme": "bearer",
        "description": "Use the API token supplied by the ReproLab operator.",
    }
    for path, operations in spec["paths"].items():
        if not path.startswith(AGENT_PREFIX):
            continue
        for operation in operations.values():
            if not isinstance(operation, dict):
                continue
            operation["security"] = [{"BearerAuth": []}]
            parameters = operation.get("parameters", [])
            operation["parameters"] = [
                item
                for item in parameters
                if not (
                    item.get("in") == "header"
                    and str(item.get("name", "")).lower() == "authorization"
                )
            ]
    spec["servers"] = [{"url": "/"}]
    return json.dumps(spec, ensure_ascii=False).encode("utf-8")


class GatewayHandler(BaseHTTPRequestHandler):
    server_version = "ReproLabPublicGateway/1.0"

    def do_GET(self) -> None:  # noqa: N802
        self._handle()

    def do_POST(self) -> None:  # noqa: N802
        self._handle()

    def do_DELETE(self) -> None:  # noqa: N802
        self._handle()

    def do_OPTIONS(self) -> None:  # noqa: N802
        self._handle()

    def _json_error(self, status: int, message: str) -> None:
        body = json.dumps(
            {"error": {"code": f"http_{status}", "message": message}}
        ).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _authorized(self) -> bool:
        scheme, _, supplied = self.headers.get("Authorization", "").partition(" ")
        return scheme.lower() == "bearer" and hmac.compare_digest(supplied, TOKEN)

    def _handle(self) -> None:
        parsed = urlsplit(self.path)
        is_agent_path = parsed.path == AGENT_PREFIX or parsed.path.startswith(
            f"{AGENT_PREFIX}/"
        )
        if parsed.path not in PUBLIC_EXACT_PATHS and not is_agent_path:
            self._json_error(404, "public endpoint not found")
            return
        if is_agent_path and not self._authorized():
            self._json_error(401, "invalid or missing API token")
            return

        length = int(self.headers.get("Content-Length", "0"))
        request_body = self.rfile.read(length) if length else None
        headers = {
            name: value
            for name, value in self.headers.items()
            if name.lower() in FORWARDED_REQUEST_HEADERS
        }
        if is_agent_path:
            headers["Authorization"] = f"Bearer {TOKEN}"

        request = urllib.request.Request(
            f"{UPSTREAM}{self.path}",
            data=request_body,
            headers=headers,
            method=self.command,
        )
        try:
            response = UPSTREAM_OPENER.open(request, timeout=300)
        except urllib.error.HTTPError as exc:
            response = exc
        except (urllib.error.URLError, TimeoutError) as exc:
            self._json_error(502, f"upstream unavailable: {exc.reason}")
            return

        body = response.read()
        if parsed.path == "/openapi.json" and response.status == 200:
            body = _filtered_openapi(body)

        self.send_response(response.status)
        for name, value in response.headers.items():
            if name.lower() in FORWARDED_RESPONSE_HEADERS:
                self.send_header(name, value)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if self.command != "HEAD":
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
                pass

    def log_message(self, format: str, *args: object) -> None:
        sys.stderr.write(
            "%s - - [%s] %s\n"
            % (self.client_address[0], self.log_date_time_string(), format % args)
        )
        sys.stderr.flush()


def main() -> None:
    if not TOKEN:
        raise SystemExit("REPROLAB_GATEWAY_TOKEN must be configured")
    server = ThreadingHTTPServer((HOST, PORT), GatewayHandler)
    print(f"ReproLab public API gateway listening on http://{HOST}:{PORT}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
