FROM node:22.12-bookworm-slim AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONPATH=/app/src:/app \
    TFD_STATIC_DIR=/app/static \
    TFD_MODEL_URI_DOOR=/app/models/door \
    TFD_MODEL_URI_ACV=/app/models/acv \
    TFD_MODEL_URI_RAIL=/app/models/rail \
    TFD_MODEL_URI_SHM=/app/models/shm
WORKDIR /app

COPY requirements-serving.txt ./
RUN python -m pip install --upgrade pip && python -m pip install -r requirements-serving.txt
COPY src/ ./src/
COPY backend/ ./backend/
COPY .model_artifacts/ ./models/
COPY --from=frontend /frontend/dist/ ./static/

EXPOSE 8080
CMD ["sh", "-c", "uvicorn backend.app:app --host 0.0.0.0 --port ${PORT:-8080}"]
