# EduCRM — Claude Agent Instructions

## Проект
- Frontend: React + TypeScript + Vite (папка: корень проекта)
- Backend: Django + DRF (папка: backend/)
- БД: PostgreSQL (Railway)
- Деплой: Railway (автодеплой из ветки main)
- Репозиторий: https://github.com/rustambadev2024-ctrl/educrm

## Роли пользователей
- superadmin — суперадмин (public схема)
- director — директор филиала
- admin — администратор
- branch_admin — администратор филиала
- teacher — учитель
- support_teacher — помощник учителя
- student — студент

## Правила работы
1. ВСЕГДА читай этот файл первым
2. Перед изменениями — покажи что собираешься менять
3. После изменений — npm run build (проверка фронта)
4. После изменений — python manage.py check (проверка бэка)
5. Коммить только рабочий код

## Структура
- backend/apps/ — Django приложения
- src/routes/ — страницы фронтенда по ролям
- src/components/ — переиспользуемые компоненты
- src/lib/api.ts — все API вызовы

## Последние коммиты
- 9596b6a — fix: support_teacher validations and permissions
- 0a331c8 — fix: show real error message on student delete failure
