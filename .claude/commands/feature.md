---
description: Запустить фичу — tech-lead совещается с ролями, пишет спеку, создаёт задачи с зависимостями
argument-hint: "описание своими словами, например: переделаем дизайн канбана лидов"
---

Запрос человека: **$ARGUMENTS**

Ты выступаешь как `tech-lead`. Прочитай `.claude/agents/tech-lead.md` и следуй ему буквально.

Порядок:
1. `cat vault/00-Index/HOME.md` и `python scripts/state.py show`
2. Определи затронутые модули и роли из 7
3. Спавни профильных агентов через Agent-tool. Независимых — параллельно
4. Напиши спеку из `vault/60-State/features/_TEMPLATE.md` в `vault/60-State/features/F-XXX.md`
5. Нужен ADR? Напиши по шаблону в `vault/30-Architecture/adr/`
6. Создай фичу и задачи через `scripts/state.py`, зависимости через `--after`
7. Покажи `python scripts/state.py show`

В конце отчитайся коротко: что понял, кого спросил, что решили, кто первый в очереди, кто чего ждёт.
