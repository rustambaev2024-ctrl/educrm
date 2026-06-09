# EduCRM — Claude Code Context

## Дизайн-система
Перед любым изменением UI обязательно прочитай DESIGN_SYSTEM.md.
Все компоненты должны строго следовать правилам из этого файла.

## Роль агента
Ты senior fullstack разработчик проекта EduCRM.
Работаешь под руководством техлида (пользователь получает задачи от техлида в claude.ai).
Твоя задача — точно выполнять задания, писать чистый код, не ломать существующий функционал.

## Критические правила

### Папка проекта
```
ПРАВИЛЬНО: C:\Users\kitsu\Desktop\CRM\educrm-deploy\
НИКОГДА: C:\Users\kitsu\Desktop\CRM\grow-class-co-main\ (другой проект!)
```

### Перед каждым коммитом ОБЯЗАТЕЛЬНО
```powershell
cd C:\Users\kitsu\Desktop\CRM\educrm-deploy
npm run build
# Должно быть: ✓ built in X.XXs БЕЗ ошибок
# Если ошибки — исправить ДО коммита
```

### Git workflow
```powershell
git add -A
git commit -m "тип: краткое описание"
git push
# Railway деплоит автоматически после push
```

### Типы коммитов
- `feat:` — новый функционал
- `fix:` — исправление бага
- `perf:` — оптимизация производительности
- `ux:` — UX/UI улучшения
- `security:` — безопасность
- `refactor:` — рефакторинг

### Дата — НИКОГДА не использовать UTC
```typescript
// ❌ НЕПРАВИЛЬНО — сдвигает дату на -5 часов (UTC+5)
new Date().toISOString().slice(0, 10)

// ✅ ПРАВИЛЬНО — локальная дата
const now = new Date()
const localDate = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`
```

### Миграции Django
```powershell
# Создать миграцию (локально)
python manage.py makemigrations app_name

# НЕ запускать migrate_schemas локально!
# Railway применяет автоматически при деплое
```

---

## Архитектура

### Стек
| Слой | Технология |
|------|-----------|
| Backend | Django 5.x + DRF |
| Multi-tenancy | django-tenants (schema-based) |
| Auth | SimpleJWT |
| Background | Celery + Redis |
| WebSockets | Django Channels |
| Frontend | React 19 + TypeScript + Vite |
| Routing | TanStack Router (file-based) |
| UI | Tailwind v4 + shadcn/ui |
| DB | PostgreSQL 16 |
| Deploy | Railway (автодеплой из GitHub) |

### Структура
```
educrm-deploy/
├── backend/
│   ├── apps/
│   │   ├── accounts/     — авторизация
│   │   ├── finance/      — платежи, кошельки
│   │   ├── lessons/      — уроки, посещаемость
│   │   ├── notifications/— уведомления
│   │   ├── reports/      — аналитика
│   │   ├── staff/        — сотрудники, штрафы, бонусы
│   │   ├── students/     — студенты, лиды, родители
│   │   └── ...
│   └── config/
└── src/
    ├── components/edu/   — доменные компоненты
    ├── lib/
    │   ├── api.ts        — все API методы
    │   ├── auth.tsx      — авторизация
    │   └── data/store.tsx— глобальный стейт
    └── routes/
        ├── admin/        — портал администратора
        ├── director/     — портал директора
        ├── teacher/      — портал учителя
        ├── student/      — портал студента
        └── parent/       — портал родителя
```

### Railway сервисы
- `educrm` → Django backend: https://educrm-production.up.railway.app
- `rare-elegance` → React frontend: https://rare-elegance-production.up.railway.app
- GitHub: rustambaev2024-ctrl/educrm (ветка master)

---

## Ключевые модели

### Payment (finance/models.py)
```python
payment_type: top_up | charge | discount | refund | expense | manual_charge | manual_top_up
```

### Lesson (lessons/models.py)
```python
status: scheduled | conducted | cancelled | rescheduled
# Автоматически → "conducted" при отметке посещаемости
```

### TeacherAttendance (lessons/models.py)
```python
# Приход учителя на урок — отдельная от посещаемости учеников!
status: present | late | absent
```

### StaffBonus / StaffPenalty (staff/models.py)
### ParentLinkCode (students/models.py) — 6-значный код привязки родителя

---

## API паттерны

### Frontend (src/lib/api.ts)
```typescript
// Все API клиенты
lessonApi, paymentApi, studentApi, staffApi,
analyticsApi, penaltyApi, bonusApi, branchApi,
leadApi, parentApi, superadminApi, notificationApi

// Пагинация студентов (50/page)
studentApi.list({ page, page_size, search, branch_id })

// Кэшированные endpoints (5 мин)
analyticsApi.teachers(params)
analyticsApi.dailyReport(params)
analyticsApi.groupReport(groupId, params)
```

### Backend endpoints
```
/api/v1/lessons/{id}/attendance/          — посещаемость учеников
/api/v1/lessons/{id}/teacher-checkin/     — приход учителя
/api/v1/analytics/teachers/               — статистика учителей
/api/v1/analytics/daily-report/           — ежедневный отчёт
/api/v1/analytics/group-report/{id}/      — отчёт по группе
/api/v1/students/{id}/generate-link-code/ — код для родителя
/api/v1/salary/calculate/                 — расчёт зарплаты
```

---

## Локализация
- Всегда uz + ru
- Паттерн: `lang === "uz" ? "узбекский" : "русский"`
- НИКОГДА хардкод только на одном языке
- НИКОГДА английский текст в UI

## autoComplete
- Все Input в формах: `autoComplete="off"`
- Поля пароля: `autoComplete="new-password"`
- Поля поиска: `autoComplete="off"`

## Иконки
- Только lucide-react
- НИКОГДА emoji в UI (💰📚👥)
- Паттерн: иконка в цветном rounded контейнере

## Цвета (dark theme обязателен)
```typescript
// ❌ НЕПРАВИЛЬНО
className="bg-green-50 text-green-700"

// ✅ ПРАВИЛЬНО
className="bg-emerald-500/10 text-emerald-600"
```

---

## Часто используемые команды

```powershell
# Запуск локально
cd C:\Users\kitsu\Desktop\CRM\educrm-deploy\backend
python manage.py runserver

cd C:\Users\kitsu\Desktop\CRM\educrm-deploy
npm run dev

# Сборка
npm run build

# Миграция
cd backend
python manage.py makemigrations app_name

# Деплой
git add -A && git commit -m "описание" && git push
```

---

## Важные компоненты (уже созданы)

| Компонент | Путь | Описание |
|-----------|------|----------|
| NazoratPage | src/components/edu/nazorat-page.tsx | Контроль учителей |
| DailyReportPage | src/components/edu/daily-report-page.tsx | Ежедневный отчёт |
| GlobalSearch | src/components/edu/global-search.tsx | Command+K поиск |
| GroupReportSheet | src/components/edu/group-report-sheet.tsx | Отчёт по группе |
| MessengerPanel | src/components/edu/messenger-panel.tsx | Мессенджер |

---

## Текущий клиент
- Организация: Kelajak-Talim, Xiva shahar
- Один тенант в продакшне
- Язык интерфейса: uz (основной) + ru

---

## Что НЕЛЬЗЯ делать
1. Редактировать grow-class-co-main
2. Запускать migrate (только makemigrations)
3. Коммитить с ошибками сборки
4. Хардкодить только один язык
5. Использовать emoji в UI
6. Использовать UTC для дат
7. Делать N+1 запросы в циклах
