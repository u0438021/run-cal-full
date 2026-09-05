FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=8080
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN pip install --no-cache-dir uv && uv sync --frozen --no-dev
COPY app ./app
CMD ["sh", "-c", ".venv/bin/uvicorn app.firebase_main:app --host 0.0.0.0 --port ${PORT}"]
