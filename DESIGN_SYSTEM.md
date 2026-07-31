# GrowBase Design System

> Выжимка. Полная версия — `vault/20-Brand/design-system.md`. Источник значений — `src/styles.css`.

## Цвета
Hex в JSX не пишем — только токен или семантический класс.
- Акцент (кнопки, ссылки, активные элементы): var(--brand) = #059669, класс bg-primary
- Hover акцента: var(--brand-hover) = #10b981
- Sidebar: var(--sidebar-bg) = #1a2e22, активный пункт var(--sidebar-active) = #059669
- Фон страниц: var(--page-bg)
- Синяя палитра #0077b6 / #00b4d8 / #1a2332 — УСТАРЕЛА, остатки в коде это техдолг

## Тема
Светлая и тёмная — обе поддерживаются (ADR-001). Токены `.dark` в `src/styles.css`,
тоггл в `Topbar`, ключ `growbase.theme`. Не хардкодь светлые значения — пиши через токены.

## Бренд-ассеты
`public/brand/`: `growbase-logo-mark.webp` (интерфейс), `icon-192.png` / `icon-512.png`
(favicon + PWA-манифест), `apple-touch-icon.png`, `growbase-logo-full*.webp`.
В интерфейсе — WebP, в `rel="icon"` и манифесте — PNG.
- Фон карточек: bg-card (НЕ bg-white)
- Текст основной: text-foreground (НЕ text-gray-900)
- Текст второстепенный: text-muted-foreground (НЕ text-gray-500)
- Граница: border-border (НЕ border-gray-*)

## Карточки
- ВСЕГДА: bg-card rounded-xl border border-border shadow-sm
- НИКОГДА: bg-white, rounded-lg, shadow-md

## Кнопки
- Primary: bg-primary text-primary-foreground rounded-xl hover:bg-primary/90
- Secondary: bg-muted text-foreground rounded-xl
- Danger: bg-destructive text-white rounded-xl
- НИКОГДА: свои цвета вне этой системы

## Таблицы
- ВСЕГДА класс: edu-table
- Шапка: bg-muted/40, text-xs uppercase font-semibold
- Строки: hover:bg-muted/30, border-b border-border

## Типографика
- Заголовок страницы: text-xl font-bold text-foreground
- Заголовок карточки: text-sm font-semibold text-foreground
- Подзаголовок: text-xs text-muted-foreground
- НИКОГДА: хардкод цветов на текст

## Иконки
- ТОЛЬКО lucide-react
- НИКОГДА: emoji в UI
- Размер по умолчанию: size-4 (конвенция size-*, не w-* h-*)

## Формы
- Input: rounded-xl border border-input focus-visible:ring-1 focus-visible:ring-ring
- Label: text-xs font-medium text-muted-foreground uppercase
- autoComplete="off" на все поля с данными

## Мобильные страницы (student/parent)
- Карточки: bg-card rounded-xl border border-border
- Отступы: p-4, gap-3
- НИКОГДА: PageShell (это desktop компонент)

## Темная тема
- УДАЛЕНА — только светлая тема
- НИКОГДА: dark: классы

## Локализация
- ВСЕГДА: uz + ru для каждого текста
- НИКОГДА: английский текст в UI
- НИКОГДА: узбекский без русского варианта
- Формат: lang === "uz" ? "узбекский" : "русский"

## Даты
- ВСЕГДА: getLocalDateString() из @/lib/format
- НИКОГДА: new Date().toISOString().slice(0,10)
- НИКОГДА: toISOString() для дат записи

## Компоненты
- Страницы admin/director/teacher: ВСЕГДА PageShell
- Страницы student/parent: БЕЗ PageShell
- KPI карточки: ВСЕГДА KpiCard компонент
- Подтверждение опасного действия: ВСЕГДА ConfirmDialog (src/components/ui/confirm-dialog.tsx). НИКОГДА window.confirm

## Запрещено
- Хардкод любого hex в JSX (используй bg-primary / токен var(--brand))
- Любые темные bg-slate-*, bg-gray-* на контенте страниц
- border-gray-*, text-gray-* (используй border-border, text-muted-foreground)
- console.log в продакшн коде
