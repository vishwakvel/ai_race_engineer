FROM python:3.11-slim

WORKDIR /app

COPY backend/requirements.txt requirements.txt

RUN pip install --no-cache-dir torch==2.2.0 --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ backend/

ENV PYTHONPATH=/app
ENV DATA_DIR=/app/backend/data/processed
ENV MODEL_DIR=/app/backend/data/models

# Render injects PORT; default 8000 for local docker compose.
CMD uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}
