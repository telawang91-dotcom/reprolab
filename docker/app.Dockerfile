ARG NODE_BASE=node:20-bookworm-slim
ARG PYTHON_BASE=python:3.11-slim-bookworm
ARG INSTALL_OS_PACKAGES=1
ARG INSTALL_PYTHON_DEPS=1
ARG INSTALL_FRONTEND_DEPS=1

FROM ${NODE_BASE} AS frontend-build
ARG INSTALL_FRONTEND_DEPS
WORKDIR /build/frontend
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_API_BASE=/api/v1
COPY frontend/package.json frontend/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    if [ "$INSTALL_FRONTEND_DEPS" = "1" ]; then \
        npm ci; \
    else \
        cp -a /app/node_modules ./node_modules; \
    fi
COPY frontend/ ./
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

FROM ${PYTHON_BASE} AS runtime
ARG INSTALL_OS_PACKAGES
ARG INSTALL_PYTHON_DEPS
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    NEXT_TELEMETRY_DISABLED=1 \
    MPLBACKEND=Agg \
    MPLCONFIGDIR=/tmp/matplotlib \
    HOME=/home/reprolab \
    STORAGE_DIR=/data/storage \
    SANDBOX_BACKEND=host \
    EMBEDDING_PRELOAD=false \
    REPROLAB_INTERNAL_API=http://127.0.0.1:8000

RUN if [ "$INSTALL_OS_PACKAGES" = "1" ]; then \
        apt-get update \
        && apt-get install -y --no-install-recommends ca-certificates fonts-noto-cjk libgomp1 \
        && rm -rf /var/lib/apt/lists/*; \
    fi

COPY --from=frontend-build /usr/local/bin/node /usr/local/bin/node
WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN --mount=type=cache,target=/root/.cache/pip \
    if [ "$INSTALL_PYTHON_DEPS" = "1" ]; then \
        pip install --index-url https://download.pytorch.org/whl/cpu torch==2.3.1 \
        && pip install -r requirements.txt \
        && pip install scipy==1.17.1 scikit-learn==1.9.0; \
    fi

COPY backend/ ./
COPY --from=frontend-build /build/frontend/.next /app/frontend/.next
COPY --from=frontend-build /build/frontend/node_modules /app/frontend/node_modules
COPY --from=frontend-build /build/frontend/package.json /app/frontend/package.json
COPY --from=frontend-build /build/frontend/next.config.mjs /app/frontend/next.config.mjs
COPY docker/container-entrypoint.sh /app/container-entrypoint.sh

RUN useradd --create-home --uid 10001 reprolab \
    && mkdir -p /data/storage /app/backend/.runtime \
    && chown -R reprolab:reprolab /data /app/backend/.runtime \
    && chmod +x /app/container-entrypoint.sh

EXPOSE 3000 8000
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=6 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:3000/health', timeout=3)"

CMD ["/app/container-entrypoint.sh"]
