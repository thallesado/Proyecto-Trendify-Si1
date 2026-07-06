#!/bin/sh
set -e

echo "Esperando PostgreSQL..."
python - <<'PY'
import os
import sys
import time

import psycopg2

url = os.environ.get("DATABASE_URL")
if not url:
    sys.exit("DATABASE_URL no esta definida")

for attempt in range(60):
    try:
        conn = psycopg2.connect(url)
        conn.close()
        print("PostgreSQL listo.")
        break
    except psycopg2.OperationalError:
        time.sleep(2)
else:
    sys.exit("Timeout: PostgreSQL no respondio a tiempo")
PY

echo "Sincronizando migraciones Django..."
# El schema SQL ya crea tablas de negocio; las tablas django_* requieren migrate real.
python manage.py migrate contenttypes
python manage.py migrate auth
python manage.py migrate admin
python manage.py migrate sessions
python manage.py migrate catalogos --fake

echo "Restableciendo contrasenas seed a 123456..."
python scripts/reset_passwords_and_list_users.py

exec "$@"
