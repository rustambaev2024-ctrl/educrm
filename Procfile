web: sh -c 'cd backend && python manage.py migrate_schemas --shared && python manage.py collectstatic --noinput && daphne -b 0.0.0.0 -p $PORT config.asgi:application'
worker: sh -c 'cd backend && celery -A config worker -l warning -c 2'
beat: sh -c 'cd backend && celery -A config beat -l warning --loglevel=warning'
