# Ключевые модели и инварианты

| Модель | Инвариант |
|---|---|
| `Institution` | Тенант. Создание → авто-создание схемы PostgreSQL + bootstrap (директор, филиал, ролевые пользователи) |
| `GroupMembership` | Уникальность: один ученик не может быть дважды **активным** членом одной группы. Выход фиксирует `left_at` |
| `Lesson` | Генерируется по расписанию группы. `rescheduled_to` — ссылка на новый урок. `is_substitute` + `original_teacher` для замен |
| `Attendance` | `present`/`absent`/`late`/`excused`. `is_charged` защищает от двойного списания. Бэкдейтинг ≤ 14 дней для teacher/support_teacher |
| `TeacherAttendance` | Check-in учителя: время, статус, опоздание |
| `Wallet` | Баланс ученика. `Wallet.student` — `CASCADE`, но удалить кошелёк с платежами нельзя (см. `Payment`) |
| `Payment` | **Обязательно** `balance_before` + `balance_after`. Аудит-тропа неприкосновенна. `Payment.wallet` — **`PROTECT`** (T-011, `finance/0008`): удаление `Wallet`/`Student`/`User` с платежами поднимает `ProtectedError`. `Payment.student` — `SET_NULL` |
| `CoinTransaction` | Аудит-тропа монет, `balance_after` в каждой записи, ссылки на студента нет. `CoinTransaction.wallet` — **`PROTECT`** (T-011, `coins/0003`) |
| `CoinSetting` | Все значения геймификации. Хардкод монет в коде запрещён |
| `Grade` | Шкала 0–100, 8 типов |
| `Exam` / `ExamResult` | Балл + `passed`/`failed` |
| `Homework` | `overdue` выставляется Celery-задачей |
| `StaffPenalty` / `StaffBonus` | Отдельно от зарплаты |

## Правила миграций
1. Каждая миграция **обратима** (есть reverse) либо в PR явно обосновано почему нет.
2. Изменения `Payment`, `Wallet`, `Attendance` → обязательное ревью `db-engineer` **и** `security-reviewer`.
3. Данные и схема — **разными** миграциями.
4. Никаких `RunPython` без `reverse_code` (можно `migrations.RunPython.noop`).
5. Миграция сначала проходит на staging, потом на prod. Всегда.
6. `on_delete=CASCADE` на финансовых записях (`Payment`, `CoinTransaction`) **запрещён** —
   удаление субъекта не должно уничтожать аудит-тропу. Только `PROTECT`/`SET_NULL`.
7. Смена `on_delete` — операция уровня Django, не PostgreSQL: `sqlmigrate` показывает
   `(no-op)`, DDL не выполняется, блокировок нет, откат мгновенный. Проверяй
   `sqlmigrate` перед тем, как пугать команду «миграцией на финансовой таблице».
