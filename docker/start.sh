#!/bin/bash
set -e

# WORKDIR is already /app/backend (set in Dockerfile)
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
