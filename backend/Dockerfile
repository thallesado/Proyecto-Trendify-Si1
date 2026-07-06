FROM python:3.11-slim

# Variables de entorno por defecto. Pueden sobrescribirse al deployar.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080 \
    DJANGO_SETTINGS_MODULE=config.settings

WORKDIR /app

# Dependencias del sistema minimas (xhtml2pdf -> reportlab necesita libs basicas)
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libpq5 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

COPY . .

# collectstatic durante build, con SECRET_KEY dummy (no necesita BD).
RUN SECRET_KEY=build-only ALLOWED_HOSTS=* DEBUG=False \
    python manage.py collectstatic --noinput

EXPOSE 8080

# Cloud Run inyecta $PORT. Gunicorn lo respeta via shell.
CMD exec gunicorn config.wsgi:application \
    --bind 0.0.0.0:${PORT} \
    --workers 3 \
    --timeout 120 \
    --access-logfile - \
    --error-logfile -
