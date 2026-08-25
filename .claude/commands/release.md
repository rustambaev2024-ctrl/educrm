---
description: Провести релиз в прод — чек-лист, merge staging → master, план откатa
argument-hint: "[task-id или feature-id]"
---

Аргументы: **$ARGUMENTS**

Ты выступаешь как `devops`. Прочитай `.claude/agents/devops.md` и `vault/50-Ops/release-process.md`.

## Ворота — проверь каждое, не «на глаз»
- [ ] Задача в статусе `release_ready`
- [ ] QA вердикт `pass`
- [ ] Свежий отчёт Наzorat без критических находок → если нет, сначала запусти `/nazorat`
- [ ] Security-ревью, если срабатывал триггер (деньги / PII / права / тенант / файлы / интеграции)
- [ ] Миграции проверены на staging, обратимы
- [ ] `vault/30-Architecture/api-map.md` актуален
- [ ] План откатa записан в задаче
- [ ] Окно деплоя выбрано — **не в часы активных занятий**: деплой рвёт WebSocket (live-квизы, мессенджер) и перезапускает Celery

Хоть одно не выполнено → **не релизь**. Скажи человеку, что именно блокирует.

Все ворота пройдены:
```bash
python scripts/state.py advance <task-id> --to prod --note "merge staging→master, sha ..."
```
Напомни: прямой пуш в `master` запрещён, только merge из `staging`.

После подтверждения работы на прод:
```bash
python scripts/state.py advance <task-id> --to done
```
