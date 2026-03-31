FROM python:3.11-slim

WORKDIR /app/backend

RUN python -m pip install --upgrade pip \
	&& python -m pip install --no-cache-dir \
	fastapi uvicorn celery redis sqlalchemy psycopg2-binary pandas prophet mlxtend openpyxl

COPY backend /app/backend


EXPOSE 8000

CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]