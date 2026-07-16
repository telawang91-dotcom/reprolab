from __future__ import annotations

import math
import threading
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field


@dataclass
class RouteMetric:
    requests: int = 0
    failures: int = 0
    durations_ms: deque[float] = field(default_factory=lambda: deque(maxlen=512))


_started_at = time.monotonic()
_lock = threading.Lock()
_routes: dict[tuple[str, str], RouteMetric] = defaultdict(RouteMetric)


def record_request(method: str, path: str, status_code: int, duration_ms: float) -> None:
    with _lock:
        metric = _routes[(method.upper(), path)]
        metric.requests += 1
        if status_code >= 500:
            metric.failures += 1
        metric.durations_ms.append(max(0.0, duration_ms))


def _percentile(values: list[float], percentile: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = max(0, min(len(ordered) - 1, math.ceil(percentile * len(ordered)) - 1))
    return round(ordered[index], 2)


def snapshot() -> dict:
    with _lock:
        routes = []
        requests_total = 0
        failures_total = 0
        for (method, path), metric in sorted(_routes.items()):
            values = list(metric.durations_ms)
            requests_total += metric.requests
            failures_total += metric.failures
            routes.append(
                {
                    "method": method,
                    "path": path,
                    "requests": metric.requests,
                    "failures": metric.failures,
                    "p50_ms": _percentile(values, 0.50),
                    "p95_ms": _percentile(values, 0.95),
                    "max_ms": round(max(values, default=0.0), 2),
                }
            )
    return {
        "uptime_seconds": round(time.monotonic() - _started_at, 2),
        "requests_total": requests_total,
        "failures_total": failures_total,
        "routes": routes,
    }


def reset_for_tests() -> None:
    with _lock:
        _routes.clear()
