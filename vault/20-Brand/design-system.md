# Дизайн-система EduCRM

> Источник: `DESIGN_SYSTEM.md` в корне репозитория + фактический код `src/`.
> Этот файл — расширенная версия. При расхождении правь **оба** и запусти `/vault-sync`.

## Цвета

| Элемент | Значение |
|---|---|
| Сайдбар | `#1a2332` |
| Акцент (кнопки, ссылки, активные элементы) | `#0077b6` |
| Hover акцента | `#00b4d8` |
| Фон страниц | `#f8fafc` |
| Фон карточек | `bg-card` — **не** `bg-white` |
| Текст основной | `text-foreground` — **не** `text-gray-900` |
| Текст вторичный | `text-muted-foreground` — **не** `text-gray-500` |
| Граница | `border-border` — **не** `border-gray-*` |

**Как писать брендовый цвет.** В этом проекте принято `bg-[#0077b6]` / `hover:bg-[#00b4d8]` — это закреплённая конвенция, а не нарушение. Разрешены **только** 4 цвета выше.
Любой другой hex (`#e0f2fe`, `#64748b`, `#7c3aed` и т.п.) — нарушение. Используй семантические токены.

**Семантика цвета — строго:**
- 🔴 Красный / `bg-destructive` — только опасность и удаление
- 🟢 Зелёный — только успех и активный статус
- 🟡 Жёлтый — только предупреждение
- ⚪ Серый — только неактивное

Никаких `bg-blue-500` «потому что синий».

## Компоненты — обязательные формы записи

| Элемент | Всегда | Никогда |
|---|---|---|
| Карточка | `bg-card rounded-xl border border-border shadow-sm` | `bg-white`, `rounded-lg`, `shadow-md` |
| Кнопка primary | `bg-[#0077b6] text-white rounded-xl hover:bg-[#00b4d8]` | свои цвета |
| Кнопка secondary | `bg-muted text-foreground rounded-xl` | — |
| Кнопка danger | `bg-destructive text-white rounded-xl` | — |
| Таблица | класс `edu-table`; шапка `bg-muted/40 text-xs uppercase font-semibold`; строки `hover:bg-muted/30 border-b border-border` | — |
| Input | `rounded-xl border border-border focus:border-[#0077b6]` | — |
| Заголовок страницы | `text-xl font-bold text-foreground` | хардкод цвета текста |
| Заголовок карточки | `text-sm font-semibold text-foreground` | — |
| Подзаголовок | `text-xs text-muted-foreground` | — |

## Утилиты Tailwind — принятые конвенции
- Отступы между элементами: `gap-*`, **не** `space-y-*`
- Размеры: `size-*`, **не** `w-* h-*`
- Иконки: только `lucide-react`, размер по умолчанию `h-4 w-4`. **Emoji в UI запрещены**

## Библиотеки
- Radix UI + shadcn/ui, стиль `new-york`
- Toast: `sonner`
- Пустые состояния: компонент `Empty`
- Подтверждения: `ConfirmDialog` (`src/components/ui/confirm-dialog.tsx`) — **никогда** `window.confirm`
- Ошибки API: прокидывать детали через `apiErrorMessage`, не голое «Xatolik»

## Тема
Только светлая. Тёмной темы нет — не добавлять без ADR.
