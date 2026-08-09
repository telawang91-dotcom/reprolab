#!/bin/bash
set -euo pipefail

cd /app/backend
for attempt in $(seq 1 30); do
    if python -m alembic upgrade head; then
        break
    fi
    if [ "$attempt" -eq 30 ]; then
        echo "Database did not become ready after 60 seconds." >&2
        exit 1
    fi
    echo "Database is not ready yet; retrying migration in 2 seconds..." >&2
    sleep 2
done

python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 &
api_pid=$!

cd /app/frontend
node ./node_modules/next/dist/bin/next start -H 0.0.0.0 -p 3000 &
web_pid=$!

shutdown() {
    kill -TERM "$api_pid" "$web_pid" 2>/dev/null || true
    wait "$api_pid" "$web_pid" 2>/dev/null || true
}
trap shutdown INT TERM EXIT

wait -n "$api_pid" "$web_pid"
exit_code=$?
exit "$exit_code"
