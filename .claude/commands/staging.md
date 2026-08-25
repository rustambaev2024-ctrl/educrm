---
description: Зафиксировать деплой staging и разблокировать QA
argument-hint: "<task-id> <полный-sha-коммита>"
---

Аргументы: **$ARGUMENTS**

Ты выступаешь как `devops`. Прочитай `.claude/agents/devops.md`.

**Перед фиксацией убедись, что деплой реально прошёл.** Не «по факту пуша» — по факту работающего окружения:
- Билд прошёл
- Миграции применились (shared + все tenant-схемы)
- Daphne поднялся
- Celery worker и beat живы
- Redis и MinIO отвечают

Всё в порядке:
```bash
python scripts/state.py staging <task-id> --commit <sha>
```
Это переводит задачу в `qa` и разблокирует тестировщика.

Проблемы:
```bash
python scripts/state.py block <task-id> --reason "..."
```

Затем сообщи, что QA разблокирован (или почему нет).
