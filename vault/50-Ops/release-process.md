# Процесс релиза

## Путь задачи (state machine)
```
backlog → design → design_review → dev → code_review
        → staging → qa → (fix → dev) → release_ready → prod → done
```
Каждый переход меняет владельца. Переходы выполняются **только** через `scripts/state.py`.

| Статус | Владелец | Условие выхода |
|---|---|---|
| `backlog` | tech-lead | Есть спека фичи |
| `design` | designer + ux-writer | DoD Design |
| `design_review` | tech-lead | Спека утверждена |
| `dev` | backend / frontend / db | DoD Dev, код в ветке |
| `code_review` | tech-lead (+ security при триггере) | DoD Code review |
| `staging` | devops | Деплой прошёл, `staging_commit` записан |
| `qa` | qa | DoD QA, вердикт |
| `fix` | dev-роль | Баги закрыты → назад в `dev` |
| `release_ready` | tech-lead | QA pass + Наzorat pass |
| `prod` | devops | Merge в `master`, деплой прошёл |
| `done` | — | Проверено на прод |

## Чек-лист перед merge в master
- [ ] QA вердикт `pass` или `pass with minors`
- [ ] Наzorat: нет критических нарушений стандартов
- [ ] Security-ревью, если срабатывал триггер
- [ ] Миграции проверены на staging
- [ ] `api-map.md` актуален
- [ ] План откатa зафиксирован в задаче
- [ ] Окно деплоя выбрано (не в часы активных занятий)

## Откат
1. Revert merge-коммита в `master` → автодеплой Railway
2. Если была миграция — reverse-миграция (поэтому обратимость обязательна)
3. Инцидент фиксируется в `80-Reports/`
