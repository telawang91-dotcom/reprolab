import hmac
import threading
import time
from collections import defaultdict, deque

from fastapi import Header, HTTPException, Request

from app.core.config import settings

_requests: dict[str, deque[float]] = defaultdict(deque)
_lock = threading.Lock()


def require_agent_access(
    request: Request, authorization: str | None = Header(default=None)
) -> str:
    configured = settings.agent_api_token.strip()
    if configured:
        scheme, _, supplied = (authorization or "").partition(" ")
        if scheme.lower() != "bearer" or not hmac.compare_digest(supplied, configured):
            raise HTTPException(status_code=401, detail="invalid or missing agent API token")
    source = request.client.host if request.client else "unknown"
    now = time.monotonic()
    with _lock:
        bucket = _requests[source]
        while bucket and now - bucket[0] >= 60:
            bucket.popleft()
        if len(bucket) >= settings.agent_rate_limit_per_minute:
            raise HTTPException(status_code=429, detail="agent API rate limit exceeded")
        bucket.append(now)
    return source
