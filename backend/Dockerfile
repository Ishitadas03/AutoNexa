# AutoNexa Backend Production Dockerfile
# Base Image: Official pinned Python 3.11 slim bookworm
FROM python:3.11.3-slim-bookworm

# Prevent Python from writing .pyc files and enable unbuffered terminal logging
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000 \
    SERVER_HOST=0.0.0.0 \
    SERVER_PORT=8000 \
    UPLOAD_DIR=/app/uploads \
    EXPERIMENTS_DIR=/app/experiments \
    METADATA_DB_PATH=/app/data/metadata.db

WORKDIR /app

# Install runtime curl for container healthcheck probe and clean apt cache
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

# Create non-root application group and user (UID/GID 10001)
RUN groupadd --gid 10001 autonexa && \
    useradd --uid 10001 --gid 10001 --shell /bin/false --create-home autonexa

# Pre-create writable persistent directories for metadata database, uploads, and experiments
RUN mkdir -p /app/data /app/uploads /app/experiments && \
    chown -R autonexa:autonexa /app

# Install pinned Python dependencies
COPY --chown=autonexa:autonexa requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application source code with non-root ownership
COPY --chown=autonexa:autonexa app ./app

# Declare mount points for persistent storage outside ephemeral container filesystem
VOLUME ["/app/data", "/app/uploads", "/app/experiments"]

# Run as non-privileged user
USER autonexa

# Expose HTTP API port
EXPOSE 8000

# Container liveness health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -f http://127.0.0.1:8000/api/v1/health || exit 1

# Single-worker operational constraint:
# AutoNexa utilizes in-process thread locking (threading.RLock) and in-memory metrics.
# Do NOT increase worker count beyond 1 without distributed lock and state infrastructure.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
