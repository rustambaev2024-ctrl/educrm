# Стек технологий

> Сверено с `package.json`, `requirements/`, `railway.*.toml` — не с документацией.

| Компонент | Технология |
|---|---|
| Backend | Python, **Django 4.x**, Django REST Framework |
| Frontend | **React 19.2**, TypeScript, **TanStack Router 1.168 + TanStack Start 1.167**, **Tailwind v4.2**, Vite 7.3, Radix UI + shadcn/ui |
| База данных | **PostgreSQL** + мультитенант (`django-tenants`) |
| Кэш/Брокер | **Redis** — cache + Celery broker/backend + Channels layer, **всё в db/0** |
| Фоновые задачи | **Celery** (worker + beat) |
| Реалтайм | **Django Channels** (WebSocket) |
| Файлы | **MinIO** (S3-совместимое) |
| ASGI-сервер | **Daphne** (сейчас один процесс) |
| Деплой | **Railway**, проект `pleasing-trust`, сервис `educrm` |
| Аутентификация | JWT (SimpleJWT): access 60 мин, refresh 30 дней |
| Пакетный менеджер | bun (`bun.lockb`) + npm (`package-lock.json`) |

## Django-приложения (`backend/apps/`)
`accounts` · `audit` · `chat` · `coins` · `core` · `courses` · `finance` · `grades` · `homework` · `institutions` · `lessons` · `notifications` · `quizzes` · `reports` · `staff` · `students` · `superadmin` · `tenants`

## Структура фронта
- `src/routes/` — страницы по ролям
- `src/components/` — переиспользуемые компоненты
- `src/lib/api.ts` — **все** API-вызовы

## Аутентификация
Логин по **номеру телефона + пароль**. Backend определяет тенант перебором схем по номеру телефона.

> ⚠️ **Известный риск.** Перебор схем деградирует линейно с ростом числа учебных центров и даёт возможность user enumeration. Прямо на пути масштабирования. См. [[risks]].

## Известные архитектурные риски
Все зафиксированы в [[risks]] — читай перед работой с инфраструктурой.
