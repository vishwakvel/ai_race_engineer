FROM python:3.11-slim

WORKDIR /app

# Build from repo root so backend package resolves; copy backend and treat project root as /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY . /app
ENV PYTHONPATH=/app

WORKDIR /app
EXPOSE 8000
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
