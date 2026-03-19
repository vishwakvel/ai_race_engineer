FROM python:3.11-slim

WORKDIR /app

# Install only what's needed at runtime (no build tools after)
COPY requirements.txt requirements.txt

# Install CPU-only PyTorch (much smaller than default which includes CUDA)
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

# Install everything else
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PYTHONPATH=/app

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]