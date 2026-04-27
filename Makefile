.PHONY: dev test lint format migrate makemigrations runserver worker beat

dev:
	python backend/manage.py runserver 0.0.0.0:8000

test:
	pytest backend/tests -q

lint:
	flake8 backend

format:
	black backend
	isort backend

migrate:
	python backend/manage.py migrate_schemas --shared

makemigrations:
	python backend/manage.py makemigrations

runserver:
	python backend/manage.py runserver 0.0.0.0:8000

worker:
	celery -A config worker -l info

beat:
	celery -A config beat -l info
