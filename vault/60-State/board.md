# Доска задач

> Эта страница — для людей. Машиночитаемая правда живёт в `60-State/state.json`.
> Обновляется автоматически командой `/standup` или `python scripts/state.py board`.

## Легенда статусов
`backlog` → `design` → `design_review` → `dev` → `code_review` → `staging` → `qa` → `release_ready` → `prod` → `done`
Отдельно: `fix` (возврат из QA), `blocked`.

<!-- BOARD:START -->
_Обновлено: 2026-07-31T15:13:42Z_

### backlog (17)

| ID | Задача | Владелец | Блокер |
|---|---|---|---|
| `T-001` | Коммит: фикс маски телефона (phone-input.tsx, phone.ts) | `frontend` | — |
| `T-002` | Довести DateInput до готовности (min/max, id на инпут, i18n плейсхолдеров) и закоммитить с потребителями | `frontend` | — |
| `T-003` | Починить нечитаемость тёмной темы: student/coins.tsx, admin/leads.tsx, director/leads.tsx | `frontend` | — |
| `T-004` | Ресайз/сжатие логотипов public/brand, обновить manifest.webmanifest, убрать заглушку E в join.tsx | `frontend` | — |
| `T-005` | Коммит ребренда: frontend (layout+i18n+тема-тоггл+brand assets) + backend (дефолты/миграция/settings) | `frontend` | T-003 (backlog), T-004 (backlog) |
| `T-006` | QA-регресс: тёмная тема на 7 порталах, ввод даты, маска телефона, платформенные настройки | `qa` | также ждёт T-007 (бэкенд-часть ребренда) — добавлено вручную, инструмент не поддерживает добавление зависимости после создания задачи |
| `T-012` | R-21 backend: soft-delete ученика вместо физического удаления | `backend` | T-011 (qa) |
| `T-019` | Security-ревью T-008..T-018 перед staging | `security` | T-008 (staging), T-009 (staging), T-010 (qa), T-011 (qa), T-012 (backlog), T-013 (staging), T-014 (staging), T-015 (qa), T-016 (staging), T-017 (staging), T-018 (staging) |
| `T-020` | QA-регресс красных зон: тенант/права/деньги по 7 ролям | `qa` | T-019 (backlog) |
| `T-021` | R-19 follow-up: мигрировать join.tsx/play.$code.tsx на ticket-based вход в квиз | `frontend` | — |
| `T-022` | R-19 follow-up: убрать legacy ?schema= ветку в quizzes/consumers.py | `backend` | T-021 (backlog) |
| `T-023` | R-17 follow-up: перенос старых PII-файлов в приватное хранилище + validate_file на document_file | `backend` | — |
| `T-024` | R-17 follow-up: USE_PRIVATE_S3_DOCUMENTS + MinIO-креды на Railway | `devops` | T-023 (backlog) |
| `T-025` | R-17 follow-up: аудит-запись на скачивание документа ученика | `backend` | — |
| `T-026` | R-23 follow-up: серверный гейт блокирует API при must_change_password=true | `backend` | — |
| `T-027` | R-23 follow-up: экран принудительной смены пароля | `frontend` | T-026 (backlog) |
| `T-028` | R-24 follow-up: признак усечения в ответе при MAX_UNPAGINATED | `backend` | — |

### staging (7)

| ID | Задача | Владелец | Блокер |
|---|---|---|---|
| `T-008` | R-20: ученик не может сам себе выставить оценку/статус ДЗ | `devops` | — |
| `T-009` | R-22: trigger-daily-charge только свой тенант, асинхронно | `devops` | — |
| `T-013` | R-17: закрыть публичный /media/student_docs/, presigned ссылки | `devops` | — |
| `T-014` | R-18: branch_admin не может сменить пароль директора | `devops` | — |
| `T-016` | R-25: mark_overdue_homework без schema_context | `devops` | — |
| `T-017` | R-25: X-Tenant-Schema сверяется с JWT-claim в middleware | `devops` | — |
| `T-018` | R-24: включить DEFAULT_PAGINATION_CLASS глобально | `devops` | — |

### qa (4)

| ID | Задача | Владелец | Блокер |
|---|---|---|---|
| `T-007` | Коммит бэкенд-части ребренда: platform_name, SMS-текст, PDF-заголовки, OpenAPI title, миграция 0004 | `qa` | — |
| `T-010` | R-19: тенантная изоляция live-квиза (WS+REST схема из JWT, WS-группа с префиксом схемы) | `qa` | — |
| `T-011` | R-21 БД: Payment/CoinWallet on_delete CASCADE->PROTECT, проверка прод-данных | `qa` | — |
| `T-015` | R-23: убрать дефолтный пароль ChangeMe123, включить парольную политику | `qa` | — |

<!-- BOARD:END -->
