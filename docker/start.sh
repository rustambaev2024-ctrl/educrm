#!/bin/bash
set -e

# WORKDIR is already /app/backend (set in Dockerfile)
# Wait for database to be available before running migrations
DB_HOST=${POSTGRES_HOST:-localhost}
DB_PORT=${POSTGRES_PORT:-5432}
DB_WAIT_TIMEOUT=${DB_WAIT_TIMEOUT:-120}
echo "Waiting for DB at $DB_HOST:$DB_PORT (timeout=${DB_WAIT_TIMEOUT}s)..."
python - <<'PY'
import os, time, socket, sys
host=os.getenv('POSTGRES_HOST','localhost')
port=int(os.getenv('POSTGRES_PORT','5432'))
timeout=int(os.getenv('DB_WAIT_TIMEOUT','120'))
start=time.time()
while True:
    try:
        s=socket.create_connection((host,port),2)
        s.close()
        print('DB reachable')
        break
    except Exception:
        if time.time()-start>timeout:
            print(f"Timeout waiting for DB {host}:{port}", file=sys.stderr)
            sys.exit(1)
        time.sleep(1)
PY

echo "Running shared migrations (public schema)..."
python manage.py migrate_schemas --shared

echo "Collecting static..."
python manage.py collectstatic --noinput

echo "Starting Celery worker in background..."
celery -A config worker -l warning -c 2 &
WORKER_PID=$!

echo "Starting Celery beat in background..."
celery -A config beat -l warning --loglevel=warning &
BEAT_PID=$!

echo "Starting Daphne..."
exec daphne -b 0.0.0.0 -p $PORT config.asgi:application
