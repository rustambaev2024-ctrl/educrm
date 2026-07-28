# EduCRM — инструкции для агентов

Мультитенантная платформа управления учебными центрами.
**Продакшен с реальными данными реальных учебных центров.** Ошибки стоят денег и доверия.

Репозиторий: `https://github.com/rustambaev2024-ctrl/educrm`
Railway: проект `pleasing-trust`, сервис `educrm`

---

## Прочитай до любого действия
```bash
cat vault/00-Index/HOME.md
python scripts/state.py show
```

## Единственный источник правды — `vault/`
Obsidian-хранилище. Люди открывают в Obsidian, агенты читают как markdown из репозитория.

| Что нужно | Где |
|---|---|
| Продукт, 13 модулей, 7 ролей, бизнес-процессы | `vault/10-Product/` |
| Дизайн-система, 8 столпов UI, двуязычность | `vault/20-Brand/` |
| Стек, мультитенант, API, модель данных, **риски**, ADR | `vault/30-Architecture/` |
| **Стандарты, Definition of Done, инструменты, протокол разведки** | `vault/40-Standards/` |
| Окружения, релизы | `vault/50-Ops/` |
| **Состояние задач, открытые жалобы** | `vault/60-State/` |
| Отчёты Наzorat, постмортемы | `vault/80-Reports/` |

Ключевые файлы, которые читают все:
- `vault/30-Architecture/risks.md` — **10 известных рисков.** Знания, купленные болью прода
- `vault/60-State/open-issues.md` — **открытые жалобы, причины не найдены.** Что уже проверено и исключено
- `vault/40-Standards/recon-protocol.md` — как начинать работу
- `vault/40-Standards/tooling.md` — какой MCP/скилл брать под задачу

---

## Четыре правила

### 1. Знание — только в vault
Ни один агент не хранит знание в своём промпте, только ссылку в vault.
Узнал новое или нашёл устаревшее — **правь vault в том же прогоне**. Знание, оставшееся в чате, потеряно навсегда. Это причина, по которой предыдущая команда агентов отупела.

Нашёл причину жалобы из `open-issues.md` → **впиши причину туда же**.

### 2. Разведка по коду, не по документации
Документация здесь уже врала: старый `CLAUDE.md` указывал деплой из ветки `main`, которой не существует, и перечислял 8 ролей вместо 7.
Прежде чем менять — прочитай код. Найди 2–3 похожих места и следуй их паттерну.

### 3. Состояние — только через CLI
```bash
python scripts/state.py show          # всё состояние
python scripts/state.py mine <role>   # мои незаблокированные задачи
python scripts/state.py check         # валидация процесса
python scripts/baseline.py check      # техдолг не вырос?
```
`vault/60-State/state.json` руками **не редактируется** — запрещено в настройках. Движок валидирует переходы: он физически не даст тестировщику начать до пуша в staging, а фиче — уехать в прод без QA.

### 4. Не выходи за свою роль
Фронтенд не додумывает дизайн. Бэкенд не решает про схему БД. QA не правит код. Наzorat не участвует в работе.
Нет входных данных → не начинай, скажи чего ждёшь.

---

## Роли и агенты

| Роль | Агент | Владеет статусами |
|---|---|---|
| Тех-лид | `tech-lead` | backlog, design_review, code_review, release_ready |
| Дизайнер | `designer` | design |
| UX-редактор | `ux-writer` | design |
| Backend | `backend-dev` | dev, fix |
| Frontend | `frontend-dev` | dev, fix |
| БД | `db-engineer` | dev, fix |
| QA | `qa-engineer` | qa |
| DevOps | `devops` | staging, prod |
| Безопасность | `security-reviewer` | code_review (по триггеру) |
| **Наzorat** | `auditor` | — (read-only наблюдатель) |

## Поток задачи
```
backlog → design → design_review → dev → code_review
        → staging → qa → (fix → dev) → release_ready → prod → done
```

## Ветки
- `master` → **production, реальные данные.** Прямой пуш запрещён, только merge из `staging`
- `staging` → тестовое окружение
- `fix` → локальная ветка для правок
- Ветки `main` **не существует** — не верь старым инструкциям

---

## Стек (по факту, не по докам)
**Backend:** Django 4.x + DRF · PostgreSQL + `django-tenants` · Redis (cache + Celery broker + Channels, всё db/0) · Celery worker+beat · Django Channels · MinIO · Daphne · JWT (access 60 мин / refresh 30 дней)
**Frontend:** React 19.2 · TypeScript · TanStack Router 1.168 + Start 1.167 · Tailwind **v4.2** · Vite 7.3 · Radix + shadcn/ui (`new-york`) · `lucide-react` · `sonner`

**Структура:** `backend/apps/` (18 приложений) · `src/routes/` (порталы по ролям) · `src/components/` · `src/lib/api.ts` (все API-вызовы)

Порталы: `superadmin` `director` `admin` (это роль **`branch_admin`**, имя папки историческое) `teacher` `support-teacher` `student` `parent`

## 7 ролей — подтверждено по `backend/apps/accounts/models.py`
`superadmin` · `director` · `branch_admin` · `teacher` · `support_teacher` · `student` · `parent`

---

## Три красные зоны — максимальная осторожность

**1. Мультитенант.** Запрос вне схемы тенанта = утечка данных между учебными центрами. Самый тяжёлый класс дефекта. **Celery-задачи обязаны явно ставить схему** — воркер не наследует контекст HTTP-запроса.

**2. Деньги.** `balance_before` / `balance_after` — аудит-тропа, неприкосновенна. Операции идемпотентны: `daily_lesson_charge` может запуститься дважды. `Payment` только append.

**3. PII несовершеннолетних.** В карточках учеников паспорта и свидетельства о рождении.

## Техдолг — храповик, не абсолютные правила
`vault/40-Standards/baseline.json` фиксирует текущий уровень: 85 небрендовых hex · 145 `any` · 98 проверок роли вне permission-классов.
Правило: **в новом коде соблюдать, существующее не ухудшать.** `baseline.py check` падает только при росте. Починил попутно — baseline опустился и обратно не поднимется.

Нулевая терпимость: секреты в коде, иконки не из `lucide-react`.

## Двуязычность
Каждая строка существует парой **UZ + RU**. Строка без пары — баг, а не техдолг.

## Проверка перед сдачей
```bash
npm run build                      # фронт
python manage.py check             # бэк (migrate агентам запрещён)
python scripts/baseline.py check  # техдолг
python scripts/state.py check     # процесс
```

---

## Команды
**`/tl "описание проблемы"`** — главная. Всё остальное вспомогательное.

`/standup` · `/work <role>` · `/staging <id> <sha>` · `/qa` · `/release` · `/nazorat` · `/vault-sync` · `/feature`
