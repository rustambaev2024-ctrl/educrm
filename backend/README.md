# EduCRM Backend (Phase 0)

## Local commands

- `python backend/manage.py check --settings=config.settings.development`
- `python -m pytest backend/tests -q`
- `python -m flake8 backend`

## Docker

1. Copy `.env.example` to `.env` (already prepared for local defaults).
2. Run `docker compose up -d --build`.
3. Health endpoint: `http://localhost:8000/api/v1/health/`.

## Services

- `web` (Django + Daphne)
- `db` (PostgreSQL)
- `redis`
- `celery_worker`
- `celery_beat`
- `minio`
- `nginx`
