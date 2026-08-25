# Дизайн-система GrowBase

> Источник истины — **`src/styles.css`** (токены) + фактический код `src/`.
> Дублирующий `DESIGN_SYSTEM.md` в корне репозитория — краткая выжимка для людей. При расхождении правь **оба** и запусти `/vault-sync`.
>
> **2026-07-28 — файл переписан по факту кода.** Прежняя редакция описывала синюю палитру (`#0077b6` / `#1a2332`), которой в `src/styles.css` уже нет: продукт переведён на изумрудную. Документ вводил в заблуждение всех агентов, включая автора. Не доверяй памяти — сверяйся с `src/styles.css`.

## Бренд
Продукт называется **GrowBase** (ранее EduCRM). Ребренд идёт итерациями — см. раздел «Состояние ребренда».
Логотипы в `public/brand/` (после T-004 — оптимизированы, 2.6 МБ → 194 КБ):

| Файл | Размер | Где применяется |
|---|---|---|
| `growbase-logo-mark.webp` | 256×256, 10 КБ | марка в интерфейсе — три layout'а, `index.tsx`, `join.tsx` |
| `icon-192.png` / `icon-512.png` | 18 / 78 КБ | favicon и иконки PWA-манифеста (`any` + `maskable`) |
| `apple-touch-icon.png` | 180×180, 16 КБ | iOS «На экран Домой» |
| `growbase-logo-full.webp`, `growbase-logo-full-transparent.webp` | 1024 px по ширине | полный логотип, пока не используется в коде |

Правила: в интерфейсе — **WebP**, в `rel="icon"`/манифесте — **PNG** (WebP как favicon поддержан не везде).
Исходники 1254 px и 1774 px не хранятся в репозитории — марка отдавалась как иконка 30–34 px весом 449 КБ на каждой странице у всех ролей.

## Цвета — только из `src/styles.css`

**Hex в JSX не пишем.** Берём CSS-переменную или семантический класс Tailwind. Это изменение относительно старой редакции: раньше `bg-[#0077b6]` считался «закреплённой конвенцией», теперь это техдолг (см. `baseline.json`).

| Роль | Токен | Значение (light) |
|---|---|---|
| Брендовый акцент | `var(--brand)` / `bg-primary` | `#059669` изумруд |
| Hover акцента | `var(--brand-hover)` | `#10b981` |
| Тёмный акцент | `var(--brand-dark)` | `#047857` |
| Сайдбар фон | `var(--sidebar-bg)` | `#1a2e22` |
| Сайдбар активный пункт | `var(--sidebar-active)` | `#059669` |
| Фон страницы | `var(--page-bg)` | пастельный градиент + `#eef3f0` |
| Фон карточки | `bg-card` / `var(--card-bg)` | **не** `bg-white` |
| Текст основной | `text-foreground` / `var(--text-primary)` | **не** `text-gray-900` |
| Текст вторичный | `text-muted-foreground` / `var(--text-secondary)` | **не** `text-gray-500` |
| Граница | `border-border` / `var(--border-color)` | **не** `border-gray-*` |

**Семантические цвета независимы от бренда и при ребрендинге не меняются:**
`--success` `#16a34a` · `--danger` `#dc2626` · `--warning` `#d97706` · `--info` `#0284c7`.

**Семантика — строго:**
- Красный / `bg-destructive` — только опасность и удаление
- Зелёный `--success` — только успех и активный статус. Осторожно: бренд теперь тоже зелёный, **не подменяй** брендовый акцент успехом и наоборот
- Жёлтый — только предупреждение
- Серый — только неактивное
- Оранжевые часы на просроченном контакте в канбане лидов — существующий язык, не ломать

Любой новый hex в JSX — нарушение. Нужен новый цвет → ADR через tech-lead.

## Компоненты — обязательные формы записи

| Элемент | Всегда | Никогда |
|---|---|---|
| Карточка | `bg-card rounded-xl border border-border shadow-sm` | `bg-white`, `rounded-lg`, `shadow-md` |
| Кнопка primary | `bg-primary text-primary-foreground rounded-xl hover:bg-primary/90` | свой hex |
| Кнопка secondary | `bg-muted text-foreground rounded-xl` | — |
| Кнопка danger | `bg-destructive text-white rounded-xl` | — |
| Таблица | класс `edu-table`; шапка `bg-muted/40 text-xs uppercase font-semibold`; строки `hover:bg-muted/30 border-b border-border` | — |
| Input | `rounded-xl border border-input focus-visible:ring-1 focus-visible:ring-ring` | — |
| Дата | компонент `DateInput` (`src/components/edu/date-input.tsx`) | нативный `<input type="date">` — молча путает цифры при быстром вводе |
| Заголовок страницы | `text-xl font-bold text-foreground` | хардкод цвета текста |
| Заголовок карточки | `text-sm font-semibold text-foreground` | — |
| Подзаголовок | `text-xs text-muted-foreground` | — |

## Утилиты Tailwind — принятые конвенции
- Отступы между элементами: `gap-*`, **не** `space-y-*`
- Размеры: `size-*`, **не** `w-* h-*`
- Иконки: только `lucide-react`, размер по умолчанию `size-4`. **Emoji в UI запрещены**
- Анимации 150–300 мс

## Библиотеки
- Radix UI + shadcn/ui, стиль `new-york`
- Toast: `sonner`
- Пустые состояния: компонент `Empty`
- Подтверждения: `ConfirmDialog` (`src/components/ui/confirm-dialog.tsx`) — **никогда** `window.confirm`
- Ошибки API: прокидывать детали через `apiErrorMessage`, не голое «Xatolik»

## Тема

**Статус: тёмная тема — поддерживаемая возможность продукта.** Принята [[ADR-001-dark-theme]] (accepted, 2026-07-28).
Переключатель `ThemeToggle` в `Topbar`, доступен всем 7 ролям, выбор хранится в `localStorage` под ключом `growbase.theme`.
Токены `.dark` лежат в `src/styles.css` (изумруд в полумраке, приглушённый, без неона) и закоммичены давно.

Правило разработки: **не хардкодь светлые значения** (`bg-white`, `text-gray-*`, `#f8fafc`, `#0f172a`). Пиши через токены — тогда тёмная тема достаётся бесплатно, а светлая ничего не теряет.

Экраны, ломавшиеся в тёмной теме, — **исправлены T-003** (`coins.tsx` `bg-white`→`bg-muted`, пилюля `contacted` в `admin/leads.tsx` и `director/leads.tsx` → `border-border bg-muted text-muted-foreground`).
Остаётся: ~20 вхождений старой синей палитры (`#0077b6` / `#00b4d8` / `#1a2332`) по `src/`, преимущественно в `src/components/edu/*-page.tsx` — техдолг по `baseline.json`, не token-safe в тёмной теме.

`bg-white/10` … `bg-white/20` поверх цветных hero-блоков — **не** ошибка, это полупрозрачный оверлей, читается в обеих темах.

## Состояние ребренда EduCRM → GrowBase

Сделано (в незакоммиченной работе): строки UI `src/lib/i18n.tsx` (UZ+RU парами), метатеги и favicon `src/routes/__root.tsx`, логотипы в трёх layout'ах, backend defaults (`superadmin/models.py`, `core/management/commands/setup_production.py`, `reports/exporters.py`, `config/settings/base.py`) + миграция `superadmin/0004`.

Осознанно **не** трогаем:
- ключи `localStorage` `educrm.lang`, `educrm.auth`, `educrm.tenant_schema` — переименование разлогинит всех пользователей продакшена
- миграция `superadmin/0002` — историческая, правке не подлежит
- `support@educrm.uz` — почтовый домен, меняется только вместе с реальным доменом

Осталось (отдельная задача):
- `public/manifest.webmanifest` — `name` / `short_name` всё ещё EduCRM, иконка ведёт на `/icon.svg`. Видно пользователю при установке PWA — бьёт по `student` и `parent`, у которых mobile-first
- `backend/apps/students/meta_conversions.py:45` — `lead_event_source: "EduCRM"`; смена рвёт непрерывность атрибуции в Meta, решать с продуктом
- логотипы весят ~0.5–1.1 МБ PNG каждый и грузятся в сайдбаре на каждой странице — нужен ресайз/WebP
- корневой `DESIGN_SYSTEM.md` и остальные заметки vault
