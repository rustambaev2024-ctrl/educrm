# EduCRM Design System

## Цвета
- Sidebar: #1a2332
- Акцент (кнопки, ссылки, активные элементы): #0077b6
- Hover акцента: #00b4d8
- Фон страниц: #f8fafc
- Фон карточек: bg-card (НЕ bg-white)
- Текст основной: text-foreground (НЕ text-gray-900)
- Текст второстепенный: text-muted-foreground (НЕ text-gray-500)
- Граница: border-border (НЕ border-gray-*)

## Карточки
- ВСЕГДА: bg-card rounded-xl border border-border shadow-sm
- НИКОГДА: bg-white, rounded-lg, shadow-md

## Кнопки
- Primary: bg-[#0077b6] text-white rounded-xl hover:bg-[#00b4d8]
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
- Размер по умолчанию: h-4 w-4

## Формы
- Input: rounded-xl border border-border focus:border-[#0077b6]
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
- Подтверждение удаления: ВСЕГДА window.confirm или AlertDialog

## Запрещено
- Хардкод #0077b6 в JSX (используй bg-primary или className)
- Любые темные bg-slate-*, bg-gray-* на контенте страниц
- border-gray-*, text-gray-* (используй border-border, text-muted-foreground)
- console.log в продакшн коде
