---
description: Разбудить агента конкретной роли — он возьмёт свои незаблокированные задачи
argument-hint: "роль: designer | ux-writer | backend | frontend | db | qa | devops | security"
---

Роль: **$ARGUMENTS**

1. `python scripts/state.py mine $ARGUMENTS`
2. Если задач нет — **остановись** и сообщи человеку, что роль свободна и чего она ждёт. Не выдумывай работу
3. Если задачи есть — спавни соответствующего агента через Agent-tool. Маппинг:

| Роль | Агент |
|---|---|
| designer | `designer` |
| ux-writer | `ux-writer` |
| backend | `backend-dev` |
| frontend | `frontend-dev` |
| db | `db-engineer` |
| qa | `qa-engineer` |
| devops | `devops` |
| security | `security-reviewer` |

В промпте агенту передай: id задачи, путь к спеке фичи. Содержимое vault не пересказывай — агент прочитает сам.

4. Покажи, куда задача сдвинулась после работы агента.
