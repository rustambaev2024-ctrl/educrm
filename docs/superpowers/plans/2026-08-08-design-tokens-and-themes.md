# Токены и две темы — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Свести две параллельные системы CSS-переменных в одну, задать реальные значения тёмной темы и включить рабочее переключение тем — не тронув ни одной страницы.

**Architecture:** Все токены живут в `src/styles.css` в двух блоках: `:root` (светлая) и `.dark` (тёмная). Старые имена переменных (`--page-bg`, `--text-primary`, `--success`…) остаются как **алиасы** на новые — поэтому 27 файлов с хардкодом и legacy-CSS продолжают работать без правок, а их чистка уходит в отдельный план. Тема хранится как `"light" | "dark" | "system"`, применяется классом `dark` на `<html>` блокирующим скриптом до первой отрисовки.

**Tech Stack:** Tailwind v4 (`@theme inline`, `@custom-variant dark`), React 19, TanStack Start, Playwright (единственный тест-раннер в проекте).

---

## Что этот план НЕ делает

- **Не трогает `enterprise-layout.tsx` и `mobile-layout.tsx`.** Они написаны на инлайн-стилях с хардкодом и в тёмной теме не потемнеют. Их переписывание — следующий план (шаг 3 спеки).
- **Не монтирует переключатель темы в интерфейс.** Компонент создаётся и тестируется, но в layout не вставляется: пока чрома светлая, а контент тёмный, включать это пользователю нельзя. Монтирование — в плане шага 3.
- **Не чистит 27 файлов с хексами** (шаг 4 спеки).
- **Не касается искажений чисел** (шаг 4½ спеки).

**Следствие: после этого плана видимых изменений для пользователя нет.** Он безопасен для прода и деплоится в любой момент. Проверяется полностью через Playwright, который переключает тему напрямую.

---

## Палитра — единственный источник истины

Используется дословно во всех задачах ниже. Не переизобретать по ходу.

| Токен | Светлая | Тёмная |
|---|---|---|
| `--background` | `#F4F2ED` | `#080B09` |
| `--foreground` | `#141A17` | `#E7EDE9` |
| `--card` | `#FFFFFF` | `#0F1412` |
| `--card-foreground` | `#141A17` | `#E7EDE9` |
| `--popover` | `#FFFFFF` | `#161D19` |
| `--popover-foreground` | `#141A17` | `#E7EDE9` |
| `--muted` | `#EEEBE3` | `#1D2621` |
| `--muted-foreground` | `#4C564F` | `#9CAAA2` |
| `--accent` | `#E1F0E9` | `#102A20` |
| `--accent-foreground` | `#0B4634` | `#8FE3BF` |
| `--border` | `#E2DFD6` | `#222B26` |
| `--input` | `#E2DFD6` | `#35423B` |
| `--ring` | `#0E7A57` | `#2CC98D` |
| `--primary` | `#0E7A57` | `#2CC98D` |
| `--primary-foreground` | `#FFFFFF` | `#04150E` |
| `--secondary` | `#EEEBE3` | `#1D2621` |
| `--secondary-foreground` | `#141A17` | `#E7EDE9` |
| `--destructive` | `#BC3226` | `#FF6F62` |
| `--destructive-foreground` | `#FFFFFF` | `#2E1613` |
| `--sidebar` | `#0A3527` | `#0A130F` |
| `--sidebar-foreground` | `#FFFFFF` | `#F0F5F2` |
| `--sidebar-primary` | `#0E7A57` | `#2CC98D` |
| `--sidebar-primary-foreground` | `#FFFFFF` | `#04150E` |
| `--sidebar-accent` | `rgba(255,255,255,.08)` | `rgba(240,245,242,.07)` |
| `--sidebar-accent-foreground` | `#FFFFFF` | `#F0F5F2` |
| `--sidebar-border` | `rgba(255,255,255,.10)` | `rgba(240,245,242,.09)` |
| `--sidebar-ring` | `#2CC98D` | `#2CC98D` |
| `--ok` | `#47700F` | `#9BD24F` |
| `--ok-foreground` | `#FFFFFF` | `#14200A` |
| `--ok-soft` | `#EBF2DC` | `#1F2A12` |
| `--warn` | `#8F5509` | `#E7A23C` |
| `--warn-soft` | `#F7EBD7` | `#2C2113` |
| `--bad` | `#BC3226` | `#FF6F62` |
| `--bad-soft` | `#F8E3E0` | `#2E1613` |
| `--info` | `#1C5FBE` | `#5EA1FF` |
| `--info-soft` | `#E0EAF9` | `#111F33` |
| `--chart-1` | `#0E7A57` | `#2CC98D` |
| `--chart-2` | `#1C5FBE` | `#5EA1FF` |
| `--chart-3` | `#8F5509` | `#E7A23C` |
| `--chart-4` | `#BC3226` | `#FF6F62` |
| `--chart-5` | `#61479E` | `#A48CF0` |
| `--chart-6` | `#0F7683` | `#35BACB` |

**Почему `--ok` и `--primary` близки по светлоте и это не дефект.** Контраст между ними ~1.1 : 1, и разведением оттенка это не лечится (проверено в спеке, раздел 7.2). Решение структурное: `--ok` не участвует в шкале измеряемых значений — она `нейтральный → --warn → --bad`. `--ok` появляется только в момент подтверждения действия, где `--primary` рядом не стоит. Тест в задаче 7 намеренно **не** проверяет разделение этих двух — он проверяет контраст каждого к своему фону.

---

## Структура файлов

| Файл | Ответственность |
|---|---|
`src/styles.css` (изменить) | Все токены обеих тем, алиасы старых имён, токенизация собственных 113 хардкод-цветов |
`src/lib/theme.tsx` (переписать) | Провайдер: `"light" \| "dark" \| "system"`, чтение/запись `localStorage`, подписка на системную тему, применение класса `dark` |
`src/routes/__root.tsx` (изменить, строка 68) | Блокирующий скрипт: восстановить сохранённую тему до первой отрисовки вместо снятия класса |
`src/components/edu/theme-toggle.tsx` (создать) | Контрол переключения на три состояния. В layout не монтируется |
`e2e/theme.spec.ts` (создать) | Применение класса, персистентность, системная тема, отсутствие мигания |
`e2e/contrast.spec.ts` (создать) | WCAG AA для ключевых пар в обеих темах |

---

## Task 1: Тест применения класса темы

**Files:**
- Create: `e2e/theme.spec.ts`

- [ ] **Step 1: Написать падающий тест**

Создать `e2e/theme.spec.ts`:

```typescript
import { expect, test } from "@playwright/test";

/**
 * Тесты системы тем. Намеренно работают на странице входа ("/"), потому что
 * она публичная — тесту не нужен тестовый аккаунт или конкретный тенант.
 *
 * Тема применяется классом `dark` на <html> (см. @custom-variant dark
 * в src/styles.css). Предпочтение хранится в localStorage под "educrm.theme"
 * и принимает три значения: "light", "dark", "system".
 */

const KEY = "educrm.theme";

test("сохранённая тёмная тема применяет класс dark", async ({ page }) => {
  await page.addInitScript(
    ([key]) => window.localStorage.setItem(key, "dark"),
    [KEY],
  );
  await page.goto("/");
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
});

test("сохранённая светлая тема не применяет класс dark", async ({ page }) => {
  await page.addInitScript(
    ([key]) => window.localStorage.setItem(key, "light"),
    [KEY],
  );
  await page.goto("/");
  await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
});
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npx playwright test e2e/theme.spec.ts --project=chromium`
Expected: FAIL — первый тест не находит класс `dark`, потому что и `theme.tsx:13`, и скрипт в `__root.tsx:68` его снимают.

- [ ] **Step 3: Коммит теста**

```bash
git add e2e/theme.spec.ts
git commit -m "test(theme): failing spec for dark class application"
```

---

## Task 2: Переписать провайдер темы

**Files:**
- Modify (заменить целиком): `src/lib/theme.tsx`
- Test: `e2e/theme.spec.ts`

- [ ] **Step 1: Заменить содержимое `src/lib/theme.tsx`**

Полное новое содержимое файла:

```tsx
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

/** Что выбрал пользователь. "system" — следовать настройке ОС. */
export type ThemePreference = "light" | "dark" | "system";
/** Что реально показано на экране. */
export type ResolvedTheme = "light" | "dark";

const KEY = "educrm.theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

interface ThemeContextValue {
  /** Выбор пользователя, включая "system". */
  preference: ThemePreference;
  /** Во что этот выбор развернулся здесь и сейчас. */
  resolved: ResolvedTheme;
  setPreference: (next: ThemePreference) => void;
  /** Переключает светлую и тёмную. Из "system" уходит в противоположную текущей. */
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readPreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    // localStorage недоступен (приватный режим) — молча падаем в "system"
  }
  return "system";
}

function systemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

function resolve(preference: ThemePreference): ResolvedTheme {
  return preference === "system" ? systemTheme() : preference;
}

function apply(resolved: ResolvedTheme) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // На сервере значения нет — стартуем с "system" и синхронизируемся в эффекте.
  // Класс на <html> к этому моменту уже выставлен блокирующим скриптом
  // в __root.tsx, поэтому мигания не происходит.
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [resolved, setResolved] = useState<ResolvedTheme>("light");

  useEffect(() => {
    const stored = readPreference();
    setPreferenceState(stored);
    const next = resolve(stored);
    setResolved(next);
    apply(next);
  }, []);

  // Пока выбор — "system", следим за настройкой ОС и реагируем на её смену.
  useEffect(() => {
    if (preference !== "system") return;
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia(DARK_QUERY);
    const onChange = () => {
      const next = systemTheme();
      setResolved(next);
      apply(next);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      // не сохранилось — тема всё равно применится на эту сессию
    }
    const applied = resolve(next);
    setResolved(applied);
    apply(applied);
  }, []);

  const toggle = useCallback(() => {
    setPreference(resolve(readPreference()) === "dark" ? "light" : "dark");
  }, [setPreference]);

  return (
    <ThemeContext.Provider value={{ preference, resolved, setPreference, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
```

- [ ] **Step 2: Проверить, что ничего не сломалось в сборке**

Run: `npm run build`
Expected: сборка проходит. `useTheme()` до этого шага нигде не вызывался
(проверено: только определение в `theme.tsx` и импорт `ThemeProvider`
в `__root.tsx`), поэтому расширение контракта потребителей не ломает.

- [ ] **Step 3: Запустить тесты темы**

Run: `npx playwright test e2e/theme.spec.ts --project=chromium`
Expected: всё ещё FAIL на первом тесте — скрипт в `__root.tsx:68` снимает класс
после того, как провайдер его поставил. Это чинится следующей задачей.

- [ ] **Step 4: Коммит**

```bash
git add src/lib/theme.tsx
git commit -m "feat(theme): provider with light/dark/system and persistence"
```

---

## Task 3: Блокирующий скрипт восстановления темы

**Files:**
- Modify: `src/routes/__root.tsx:66-70`
- Test: `e2e/theme.spec.ts`

- [ ] **Step 1: Заменить скрипт**

Было (`src/routes/__root.tsx`, внутри `<head>`):

```tsx
        <script
          dangerouslySetInnerHTML={{
            __html: `try{document.documentElement.classList.remove('dark');var l=localStorage.getItem('educrm.lang');document.documentElement.lang=(l==='ru'?'ru':'uz');}catch(e){}`,
          }}
        />
```

Стало:

```tsx
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('educrm.theme');var d=(t==='dark')||((t===null||t==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);var l=localStorage.getItem('educrm.lang');document.documentElement.lang=(l==='ru'?'ru':'uz');}catch(e){}`,
          }}
        />
```

Скрипт синхронный и стоит в `<head>` — выполняется до первой отрисовки,
поэтому класс уже на месте, когда браузер красит первый кадр. Логика
дублирует `resolve()` из провайдера намеренно: провайдер загрузится позже,
а мигание надо исключить до него. Обе реализации читают один ключ
`educrm.theme` и одно медиавыражение.

- [ ] **Step 2: Запустить тесты темы**

Run: `npx playwright test e2e/theme.spec.ts --project=chromium`
Expected: PASS — оба теста.

- [ ] **Step 3: Добавить тест системной темы и персистентности**

Дописать в конец `e2e/theme.spec.ts`:

```typescript
test("system следует настройке ОС", async ({ browser }) => {
  const context = await browser.newContext({ colorScheme: "dark" });
  const page = await context.newPage();
  await page.addInitScript(
    ([key]) => window.localStorage.setItem(key, "system"),
    [KEY],
  );
  await page.goto("/");
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  await context.close();
});

test("явный выбор светлой перебивает тёмную систему", async ({ browser }) => {
  const context = await browser.newContext({ colorScheme: "dark" });
  const page = await context.newPage();
  await page.addInitScript(
    ([key]) => window.localStorage.setItem(key, "light"),
    [KEY],
  );
  await page.goto("/");
  await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
  await context.close();
});

test("по умолчанию, без сохранённого выбора, следуем системе", async ({ browser }) => {
  const context = await browser.newContext({ colorScheme: "dark" });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  await context.close();
});

test("класс dark стоит до первой отрисовки, без мигания", async ({ page }) => {
  await page.addInitScript(
    ([key]) => window.localStorage.setItem(key, "dark"),
    [KEY],
  );
  // Не ждём networkidle и гидратации: смотрим состояние сразу после разбора HTML.
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const hasDark = await page.evaluate(() =>
    document.documentElement.classList.contains("dark"),
  );
  expect(
    hasDark,
    "класс dark должен выставляться блокирующим скриптом в <head>, а не после гидратации — иначе первый кадр будет светлым",
  ).toBe(true);
});
```

- [ ] **Step 4: Запустить все тесты темы**

Run: `npx playwright test e2e/theme.spec.ts --project=chromium`
Expected: PASS, 6 тестов.

- [ ] **Step 5: Коммит**

```bash
git add src/routes/__root.tsx e2e/theme.spec.ts
git commit -m "feat(theme): restore saved theme before first paint"
```

---

## Task 4: Токены обеих тем

**Files:**
- Modify: `src/styles.css:43-153` (блоки `:root` и `.dark` заменяются целиком)
- Test: `e2e/theme.spec.ts`

- [ ] **Step 1: Написать падающий тест смены поверхности**

Дописать в `e2e/theme.spec.ts`:

```typescript
test("фон страницы реально меняется между темами", async ({ page }) => {
  const bodyBg = async () =>
    page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  await page.addInitScript(([key]) => window.localStorage.setItem(key, "light"), [KEY]);
  await page.goto("/");
  const light = await bodyBg();

  await page.evaluate(([key]) => window.localStorage.setItem(key, "dark"), [KEY]);
  await page.reload();
  const dark = await bodyBg();

  expect(
    dark,
    "фон в тёмной теме обязан отличаться от светлой — если совпал, блок .dark всё ещё копия :root",
  ).not.toBe(light);
});
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npx playwright test e2e/theme.spec.ts --project=chromium -g "фон страницы"`
Expected: FAIL — цвета совпадают, потому что `.dark` в `styles.css:125-153`
дублирует значения `:root`.

- [ ] **Step 3: Заменить блоки токенов**

В `src/styles.css` заменить всё от `:root {` (строка 43) до закрывающей скобки
блока `.dark` (строка 153) на:

```css
:root {
  --radius: 0.625rem;

  /* ── Поверхности ── */
  --background: #F4F2ED;
  --foreground: #141A17;
  --card: #FFFFFF;
  --card-foreground: #141A17;
  --popover: #FFFFFF;
  --popover-foreground: #141A17;
  --muted: #EEEBE3;
  --muted-foreground: #4C564F;
  --accent: #E1F0E9;
  --accent-foreground: #0B4634;
  --border: #E2DFD6;
  --input: #E2DFD6;
  --ring: #0E7A57;

  /* ── Бренд ── */
  --primary: #0E7A57;
  --primary-foreground: #FFFFFF;
  --secondary: #EEEBE3;
  --secondary-foreground: #141A17;
  --destructive: #BC3226;
  --destructive-foreground: #FFFFFF;

  /* ── Навигация ── */
  --sidebar: #0A3527;
  --sidebar-foreground: #FFFFFF;
  --sidebar-primary: #0E7A57;
  --sidebar-primary-foreground: #FFFFFF;
  --sidebar-accent: rgba(255, 255, 255, 0.08);
  --sidebar-accent-foreground: #FFFFFF;
  --sidebar-border: rgba(255, 255, 255, 0.10);
  --sidebar-ring: #2CC98D;

  /* ── Смысловые ──
     Шкала измеряемых значений: нейтральный → --warn → --bad.
     --ok только для подтверждения действия, не для оценки показателя. */
  --ok: #47700F;
  --ok-foreground: #FFFFFF;
  --ok-soft: #EBF2DC;
  --warn: #8F5509;
  --warn-soft: #F7EBD7;
  --bad: #BC3226;
  --bad-soft: #F8E3E0;
  --info: #1C5FBE;
  --info-soft: #E0EAF9;

  /* ── Графики: доход всегда 1, расход всегда 4 ── */
  --chart-1: #0E7A57;
  --chart-2: #1C5FBE;
  --chart-3: #8F5509;
  --chart-4: #BC3226;
  --chart-5: #61479E;
  --chart-6: #0F7683;

  /* ── Глубина: в светлой теме — тень ── */
  --shadow-1: 0 1px 2px rgba(20, 26, 23, 0.06), 0 1px 3px rgba(20, 26, 23, 0.04);
  --shadow-2: 0 2px 4px rgba(20, 26, 23, 0.05), 0 8px 20px rgba(20, 26, 23, 0.07);
}

.dark {
  /* ── Поверхности: глубина задаётся более светлым фоном, а не тенью ── */
  --background: #080B09;
  --foreground: #E7EDE9;
  --card: #0F1412;
  --card-foreground: #E7EDE9;
  --popover: #161D19;
  --popover-foreground: #E7EDE9;
  --muted: #1D2621;
  --muted-foreground: #9CAAA2;
  --accent: #102A20;
  --accent-foreground: #8FE3BF;
  --border: #222B26;
  --input: #35423B;
  --ring: #2CC98D;

  /* ── Бренд ── */
  --primary: #2CC98D;
  --primary-foreground: #04150E;
  --secondary: #1D2621;
  --secondary-foreground: #E7EDE9;
  --destructive: #FF6F62;
  --destructive-foreground: #2E1613;

  /* ── Навигация ── */
  --sidebar: #0A130F;
  --sidebar-foreground: #F0F5F2;
  --sidebar-primary: #2CC98D;
  --sidebar-primary-foreground: #04150E;
  --sidebar-accent: rgba(240, 245, 242, 0.07);
  --sidebar-accent-foreground: #F0F5F2;
  --sidebar-border: rgba(240, 245, 242, 0.09);
  --sidebar-ring: #2CC98D;

  /* ── Смысловые ── */
  --ok: #9BD24F;
  --ok-foreground: #14200A;
  --ok-soft: #1F2A12;
  --warn: #E7A23C;
  --warn-soft: #2C2113;
  --bad: #FF6F62;
  --bad-soft: #2E1613;
  --info: #5EA1FF;
  --info-soft: #111F33;

  /* ── Графики ── */
  --chart-1: #2CC98D;
  --chart-2: #5EA1FF;
  --chart-3: #E7A23C;
  --chart-4: #FF6F62;
  --chart-5: #A48CF0;
  --chart-6: #35BACB;

  /* ── Глубина: тень на почти-чёрном не видна, поэтому почти нулевая;
         слой задаётся парой --card / --popover плюс --border ── */
  --shadow-1: 0 1px 2px rgba(0, 0, 0, 0.50);
  --shadow-2: 0 2px 6px rgba(0, 0, 0, 0.55), 0 12px 28px rgba(0, 0, 0, 0.40);
}
```

- [ ] **Step 4: Привязать `body` к токенам темы**

В `src/styles.css`, блок `@layer base`, заменить:

```css
  body {
    background: var(--page-bg);
    color: var(--text-primary);
  }
```

на:

```css
  body {
    background: var(--background);
    color: var(--foreground);
  }
```

- [ ] **Step 5: Запустить тест**

Run: `npx playwright test e2e/theme.spec.ts --project=chromium`
Expected: PASS, 7 тестов. Сборка тоже должна пройти: `npm run build`.

- [ ] **Step 6: Коммит**

```bash
git add src/styles.css
git commit -m "feat(tokens): real dark palette, one token set for both themes"
```

---

## Task 5: Алиасы старых имён

**Files:**
- Modify: `src/styles.css` (дописать в конец блоков `:root` и `.dark`)

Без этой задачи 27 файлов с `var(--page-bg)`, `var(--text-primary)`,
`var(--success)` и legacy-классы получат неопределённые переменные и
отрисуются с прозрачным фоном. Алиасы делают план неломающим; удаление
самих обращений — отдельный план (шаг 4 спеки).

- [ ] **Step 1: Написать падающий тест на алиас**

Дописать в `e2e/theme.spec.ts`:

```typescript
test("старые имена переменных разрешаются и следуют теме", async ({ page }) => {
  const legacy = async () =>
    page.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      return {
        pageBg: s.getPropertyValue("--page-bg").trim(),
        textPrimary: s.getPropertyValue("--text-primary").trim(),
        success: s.getPropertyValue("--success").trim(),
      };
    });

  await page.addInitScript(([key]) => window.localStorage.setItem(key, "light"), [KEY]);
  await page.goto("/");
  const light = await legacy();
  expect(light.pageBg, "--page-bg должен быть определён как алиас").not.toBe("");
  expect(light.textPrimary).not.toBe("");
  expect(light.success).not.toBe("");

  await page.evaluate(([key]) => window.localStorage.setItem(key, "dark"), [KEY]);
  await page.reload();
  const dark = await legacy();
  expect(
    dark.pageBg,
    "алиас обязан следовать теме, иначе legacy-код останется светлым на тёмном фоне",
  ).not.toBe(light.pageBg);
});
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npx playwright test e2e/theme.spec.ts --project=chromium -g "старые имена"`
Expected: FAIL — переменные пустые, задача 4 их удалила.

- [ ] **Step 3: Дописать алиасы в `:root`**

В конец блока `:root` в `src/styles.css` добавить:

```css
  /* ══ Алиасы старых имён ══
     Оставлены сознательно: на них ссылаются 27 файлов и legacy-CSS ниже
     в этом же файле. Удаляются вместе с обращениями в отдельном плане
     (шаг 4 спеки редизайна), не раньше. */
  --brand: var(--primary);
  --brand-hover: var(--ring);
  --brand-light: var(--accent);
  --brand-pale: var(--ok-soft);

  --sidebar-bg: var(--sidebar);
  --sidebar-hover: var(--sidebar-accent);
  --sidebar-active: var(--sidebar-primary);
  --sidebar-text: var(--sidebar-accent-foreground);
  --sidebar-text-active: var(--sidebar-primary-foreground);

  --page-bg: var(--background);
  --card-bg: var(--card);
  --card-border: var(--border);
  --card-shadow: var(--shadow-1);

  --text-primary: var(--foreground);
  --text-secondary: var(--muted-foreground);
  --text-muted: var(--muted-foreground);

  --border-color: var(--border);
  --border-light: var(--border);

  --success: var(--ok);
  --success-bg: var(--ok-soft);
  --success-light: var(--ok-soft);
  --danger: var(--bad);
  --danger-bg: var(--bad-soft);
  --warning: var(--warn);
  --warning-bg: var(--warn-soft);
  --info-bg: var(--info-soft);
```

- [ ] **Step 4: Убедиться, что дублировать алиасы в `.dark` не нужно**

Блок алиасов объявляется **только в `:root`**. Дублировать его в `.dark`
не надо, и это не экономия, а требование: и `:root`, и `.dark` матчат один
и тот же элемент `<html>`, поэтому `--page-bg: var(--background)`,
вычисленный на `<html>`, подставит уже переопределённое тёмное значение
`--background`. Копия в `.dark` не добавила бы ничего и стала бы вторым
местом, где значения могут разойтись.

Run: `npx playwright test e2e/theme.spec.ts --project=chromium -g "старые имена"`
Expected: PASS. Тест проверяет ровно это: `--page-bg` в тёмной теме
обязан отличаться от светлой, хотя объявлен один раз.

- [ ] **Step 5: Прогнать весь набор**

Run: `npx playwright test --project=chromium`
Expected: PASS — 8 тестов темы плюс 2 существующих теста страницы входа.

- [ ] **Step 6: Коммит**

```bash
git add src/styles.css e2e/theme.spec.ts
git commit -m "feat(tokens): alias legacy variable names onto the new set"
```

---

## Task 6: Токенизировать собственные цвета `styles.css`

**Files:**
- Modify: `src/styles.css` (всё ниже блоков токенов)

В файле 113 обращений к цветам; ~46 были в блоках токенов, остальные ~67
в классах компонентов. Пока они хардкод, тёмная тема протекает: например
`.shadow-elegant` ставит `background: #fff !important`, и карточка остаётся
белой на почти-чёрном фоне.

- [ ] **Step 1: Написать падающий тест на протечку**

Дописать в `e2e/theme.spec.ts`:

```typescript
test("ни один элемент не остаётся светлым в тёмной теме", async ({ page }) => {
  await page.addInitScript(([key]) => window.localStorage.setItem(key, "dark"), [KEY]);
  await page.goto("/");

  const offenders = await page.evaluate(() => {
    const isNearWhite = (color: string) => {
      const m = color.match(/rgba?\(([^)]+)\)/);
      if (!m) return false;
      const [r, g, b, a = "1"] = m[1].split(",").map((v) => parseFloat(v));
      if (a === 0) return false;
      return r > 235 && g > 235 && b > 235;
    };
    const found: string[] = [];
    for (const el of Array.from(document.querySelectorAll("*"))) {
      const bg = getComputedStyle(el).backgroundColor;
      if (isNearWhite(bg)) {
        found.push(`${el.tagName.toLowerCase()}.${(el.className || "").toString().slice(0, 60)}`);
      }
    }
    return found;
  });

  expect(
    offenders,
    `в тёмной теме найдены элементы с почти белым фоном: ${offenders.join(", ")}`,
  ).toEqual([]);
});
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npx playwright test e2e/theme.spec.ts --project=chromium -g "светлым в тёмной"`
Expected: FAIL со списком элементов — как минимум те, что попадают под
`.shadow-elegant` / `.card-elevated`.

- [ ] **Step 3: Заменить legacy-переопределения на токены**

В `src/styles.css` заменить блок (около строки 196):

```css
.shadow-elegant,
.card-elevated {
  background: #fff !important;
  border-radius: 10px !important;
  border: 1px solid #f1f5f9 !important;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06) !important;
```

на:

```css
.shadow-elegant,
.card-elevated {
  background: var(--card) !important;
  border-radius: var(--radius) !important;
  border: 1px solid var(--border) !important;
  box-shadow: var(--shadow-1) !important;
```

- [ ] **Step 4: Заменить статусные классы на смысловые токены**

Заменить хардкод в парах «фон + текст» (строки около 246–320) по таблице:

| Класс, было | Стало |
|---|---|
| `background: #dcfce7; color: #15803d;` | `background: var(--ok-soft); color: var(--ok);` |
| `background: #fee2e2; color: #dc2626;` | `background: var(--bad-soft); color: var(--bad);` |
| `background: #fef3c7; color: #92400e;` | `background: var(--warn-soft); color: var(--warn);` |
| `background: #e0f2fe; color: #0077b6;` | `background: var(--info-soft); color: var(--info);` |
| `background: #eff6ff; color: #1d4ed8;` | `background: var(--info-soft); color: var(--info);` |
| `background: #f1f5f9; color: #475569;` | `background: var(--muted); color: var(--muted-foreground);` |

- [ ] **Step 5: Перевести аватарные классы на палитру графиков**

Заменить блоки `.ava-0`…`.ava-4` и `.avatar-*` (строки около 324–336) на:

```css
/* Цвет аватара детерминирован по имени; ряды берутся из палитры графиков,
   поэтому автоматически различимы в обеих темах. */
.ava-0, .avatar-indigo, .avatar-blue { background: color-mix(in srgb, var(--chart-2) 18%, transparent); color: var(--chart-2); }
.ava-1, .avatar-green                { background: color-mix(in srgb, var(--chart-1) 18%, transparent); color: var(--chart-1); }
.ava-2                               { background: color-mix(in srgb, var(--chart-5) 18%, transparent); color: var(--chart-5); }
.ava-3, .avatar-amber                { background: color-mix(in srgb, var(--chart-3) 18%, transparent); color: var(--chart-3); }
.ava-4, .avatar-violet               { background: color-mix(in srgb, var(--chart-5) 18%, transparent); color: var(--chart-5); }
.avatar-red                          { background: color-mix(in srgb, var(--chart-4) 18%, transparent); color: var(--chart-4); }
.avatar-cyan                         { background: color-mix(in srgb, var(--chart-6) 18%, transparent); color: var(--chart-6); }
```

- [ ] **Step 6: Перевести кнопку и фокус на токены**

Заменить (строки около 342–370):

| Было | Стало |
|---|---|
| `outline: 2px solid #0077b6 !important;` | `outline: 2px solid var(--ring) !important;` |
| `border-color: #0077b6 !important;` | `border-color: var(--ring) !important;` |
| `.btn-primary { background: #0077b6; color: #fff; }` | `.btn-primary { background: var(--primary); color: var(--primary-foreground); }` |
| `.btn-primary:hover:not(:disabled) { background: #00b4d8; }` | `.btn-primary:hover:not(:disabled) { background: color-mix(in srgb, var(--primary) 86%, #000); }` |
| `background: linear-gradient(135deg, #0077b6, #00b4d8) !important;` | `background: linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--primary) 70%, var(--chart-6))) !important;` |
| `.text-primary-foreground { color: #fff !important; }` | `.text-primary-foreground { color: var(--primary-foreground) !important; }` |

- [ ] **Step 7: Публичные экраны — перебрендировать, но оставить тёмными**

Строки примерно 376–580 — это два публичных экрана: вход (`/`) и форма
заявки (`/apply`, классы `.apply-*`). Оба **намеренно тёмные в обеих темах**,
и это остаётся: они видны до входа, тему пользователь ещё не выбирал.
Токенизировать их под переключение не нужно — нужно снять с них **старый
синий бренд**, иначе после ребрендинга первый экран продукта останется
в прежних цветах.

Добавить в конец блока `:root` (и **не** добавлять в `.dark` — эти значения
намеренно не переключаются):

```css
  /* ── Публичные экраны (вход, заявка) ──
     Намеренно тёмные в обеих темах: пользователь ещё не выбирал тему.
     Поэтому у них свои фиксированные значения бренда, не зависящие
     от --primary. Это не «забытый хардкод». */
  --public-bg: #070D0A;
  --public-brand: #2CC98D;
  --public-brand-2: #35BACB;
  --public-ink: #F0F5F2;
```

Дальше заменить по таблице во всём диапазоне 376–580:

| Было | Стало |
|---|---|
| `#0a0e1a` (строка 380) | `var(--public-bg)` |
| `#0077b6` (368, 418, 530) | `var(--public-brand)` |
| `#00b4d8` (368, 418, 530) | `var(--public-brand-2)` |
| `#90e0ef` (438, 477) | `var(--public-brand-2)` |
| `#caf0f8`, `#e0f2fe` (438) | `var(--public-ink)` |
| `rgba(0, 119, 182, X)` (387, 423, 535, 541) | `color-mix(in srgb, var(--public-brand) calc(X * 100%), transparent)` |
| `rgba(0, 180, 216, X)` (388, 466, 506, 507, 508) | `color-mix(in srgb, var(--public-brand-2) calc(X * 100%), transparent)` |
| `rgba(144, 224, 239, X)` (389, 487) | `color-mix(in srgb, var(--public-brand-2) calc(X * 100%), transparent)` |
| `#f87171` (488, 513) | `var(--bad)` |
| `rgba(248, 113, 113, X)` (514, 515) | `color-mix(in srgb, var(--bad) calc(X * 100%), transparent)` |
| `#22c55e` (573) | `var(--public-brand)` |
| `rgba(34, 197, 94, X)` (569) | `color-mix(in srgb, var(--public-brand) calc(X * 100%), transparent)` |

`rgba(255, 255, 255, X)` в диапазоне 445–580 **оставить как есть**: это
прозрачный белый поверх намеренно тёмного фона, он корректен в обеих темах.

- [ ] **Step 8: Проверить, что незакрытого хардкода не осталось**

Run: `grep -n -E '#[0-9a-fA-F]{3,8}' src/styles.css`
Expected: совпадения только внутри блоков `:root` и `.dark` (объявления
самих токенов, включая `--public-*`). Ни одного ниже блока `.dark`.

Run: `grep -n -E 'rgba\(' src/styles.css | grep -v 'rgba\(255, 255, 255' | grep -v 'rgba\(0, 0, 0' | grep -v 'rgba\(240, 245, 242'`
Expected: пусто. Остаются только прозрачный белый на публичных экранах,
чёрный в тенях и светлый в токенах навигации тёмной темы.

- [ ] **Step 9: Запустить всё**

Run: `npx playwright test --project=chromium && npx playwright test --project=mobile && npm run build`
Expected: все тесты PASS, сборка проходит.

Отдельно глазами: открыть `/` и `/apply` и убедиться, что они остались
тёмными и читаемыми, но в зелёном бренде, а не в синем. Это единственные
два экрана в плане, которые проверяются визуально — у остальных нет
видимых изменений по построению.

- [ ] **Step 10: Коммит**

```bash
git add src/styles.css
git commit -m "refactor(styles): tokenize stylesheet colours, rebrand public screens"
```

---

## Task 7: Тест контраста WCAG AA

**Files:**
- Create: `e2e/contrast.spec.ts`

- [ ] **Step 1: Написать тест**

Создать `e2e/contrast.spec.ts`:

```typescript
import { expect, test } from "@playwright/test";

/**
 * Автоматическая проверка читаемости палитры. Ловит класс ошибок, который
 * глазами не отлавливается: токен подобран «на глаз» в одной теме и
 * оказывается нечитаемым в другой.
 *
 * Проверяются пары «текст на своём фоне», а не токены друг против друга.
 * Разделение --primary и --ok здесь намеренно НЕ проверяется: они близки
 * по светлоте, и это допустимо, потому что --ok не участвует в шкале
 * измеряемых значений (спека, раздел 7.2). Их не-соседство обеспечивается
 * правилом на ревью, а не контрастом.
 */

const KEY = "educrm.theme";
const AA_NORMAL = 4.5;

const PAIRS: Array<[fg: string, bg: string, label: string]> = [
  ["--foreground", "--background", "основной текст на фоне"],
  ["--muted-foreground", "--background", "второстепенный текст на фоне"],
  ["--card-foreground", "--card", "текст на карточке"],
  ["--muted-foreground", "--card", "второстепенный текст на карточке"],
  ["--primary-foreground", "--primary", "текст на кнопке"],
  ["--destructive-foreground", "--destructive", "текст на опасной кнопке"],
  ["--ok", "--ok-soft", "плашка подтверждения"],
  ["--warn", "--warn-soft", "плашка внимания"],
  ["--bad", "--bad-soft", "плашка опасности"],
  ["--info", "--info-soft", "плашка информации"],
  ["--warn", "--background", "предупреждение текстом на фоне"],
  ["--bad", "--background", "опасность текстом на фоне"],
  ["--info", "--background", "информация текстом на фоне"],
  ["--sidebar-foreground", "--sidebar", "текст в навигации"],
];

for (const theme of ["light", "dark"] as const) {
  test(`контраст AA в теме ${theme}`, async ({ page }) => {
    await page.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      [KEY, theme],
    );
    await page.goto("/");

    const results = await page.evaluate((pairs) => {
      const channel = (c: number) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      const luminance = (color: string) => {
        const probe = document.createElement("div");
        probe.style.color = color;
        document.body.appendChild(probe);
        const resolved = getComputedStyle(probe).color;
        probe.remove();
        const m = resolved.match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const [r, g, b] = m[1].split(",").map((v) => parseFloat(v));
        return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
      };
      const root = getComputedStyle(document.documentElement);

      return pairs.map(([fgVar, bgVar, label]) => {
        const lf = luminance(root.getPropertyValue(fgVar).trim());
        const lb = luminance(root.getPropertyValue(bgVar).trim());
        if (lf === null || lb === null) return { label, ratio: 0, resolved: false };
        const hi = Math.max(lf, lb);
        const lo = Math.min(lf, lb);
        return { label, ratio: (hi + 0.05) / (lo + 0.05), resolved: true };
      });
    }, PAIRS);

    for (const r of results) {
      expect(r.resolved, `пара «${r.label}» не разрешилась в цвет`).toBe(true);
      expect(
        Math.round(r.ratio * 100) / 100,
        `пара «${r.label}» в теме ${theme}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });
}
```

- [ ] **Step 2: Запустить**

Run: `npx playwright test e2e/contrast.spec.ts --project=chromium`
Expected: PASS для обеих тем. Если какая-то пара не дотягивает — исправлять
**значение токена** в `styles.css`, а не порог в тесте, и обновлять таблицу
палитры в этом плане, чтобы она не расходилась с кодом.

- [ ] **Step 3: Коммит**

```bash
git add e2e/contrast.spec.ts
git commit -m "test(tokens): WCAG AA contrast check for both themes"
```

---

## Task 8: Компонент переключателя

**Files:**
- Create: `src/components/edu/theme-toggle.tsx`

Компонент создаётся, но **в layout не монтируется**: до переписывания
`enterprise-layout.tsx` чрома в тёмной теме останется светлой, и включать
переключатель пользователю нельзя. Монтирование — в плане шага 3.

- [ ] **Step 1: Создать компонент**

Создать `src/components/edu/theme-toggle.tsx`:

```tsx
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme, type ThemePreference } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";

/**
 * Три состояния, а не два: «системная» — это отдельный выбор, а не отсутствие
 * выбора. Иконка показывает то, что применено сейчас, чтобы состояние читалось
 * без открытия меню.
 */
export function ThemeToggle() {
  const { preference, resolved, setPreference } = useTheme();
  const { lang } = useI18n();
  const tr = (uz: string, ru: string) => (lang === "uz" ? uz : ru);

  const options: Array<{ value: ThemePreference; label: string; Icon: typeof Sun }> = [
    { value: "light", label: tr("Yorug'", "Светлая"), Icon: Sun },
    { value: "dark", label: tr("Qorong'i", "Тёмная"), Icon: Moon },
    { value: "system", label: tr("Tizim bo'yicha", "Как в системе"), Icon: Monitor },
  ];

  const CurrentIcon = resolved === "dark" ? Moon : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={tr("Mavzuni almashtirish", "Сменить тему")}
        >
          <CurrentIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {options.map(({ value, label, Icon }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => setPreference(value)}
            data-active={preference === value ? "true" : undefined}
            className="data-[active=true]:bg-accent data-[active=true]:text-accent-foreground"
          >
            <Icon className="mr-2 size-4" />
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: Проверить сборку**

Run: `npm run build`
Expected: сборка проходит. Компонент пока не импортируется — это ожидаемо.

- [ ] **Step 3: Коммит**

```bash
git add src/components/edu/theme-toggle.tsx
git commit -m "feat(theme): theme toggle component (not yet mounted)"
```

---

## Task 9: Финальная проверка и запись в CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`
- Modify: `DESIGN_SYSTEM.md`

- [ ] **Step 1: Прогнать всё**

```bash
npm run build
npx playwright test --project=chromium
npx playwright test --project=mobile
cd backend && python manage.py check && cd ..
```
Expected: сборка проходит, все Playwright-тесты PASS, `check` даёт 0 issues.

- [ ] **Step 2: Исправить `DESIGN_SYSTEM.md`**

Файл сейчас утверждает обратное тому, что стало правдой. Заменить раздел:

```markdown
## Темная тема
- УДАЛЕНА — только светлая тема
- НИКОГДА: dark: классы
```

на:

```markdown
## Темы
- Две темы: светлая и тёмная, плюс «как в системе» (три состояния выбора)
- Тема применяется классом `dark` на `<html>`; предпочтение в localStorage
  под ключом `educrm.theme`
- ВСЕГДА: семантические токены (`bg-card`, `text-muted-foreground`, `var(--warn)`)
- НИКОГДА: хардкод цвета в разметке или инлайн-стилем — он не переключается
- Глубина в тёмной теме задаётся слоем фона (`--background` → `--card` →
  `--popover`) плюс `--border`, а не тенью: тень на почти-чёрном не видна
- Шкала измеряемых значений: нейтральный → `--warn` → `--bad`.
  Норма не окрашивается. `--ok` — только подтверждение действия,
  не оценка показателя
- Единственное исключение с намеренным хардкодом — фон экрана входа
```

- [ ] **Step 3: Дописать в `CLAUDE.md`**

В раздел «ТЕКУЩИЙ СТАТУС И ОТКРЫТЫЕ ЗАДАЧИ» добавить:

```markdown
### Влито: токены и две темы (шаги 1-2 редизайна)
Спека: `docs/superpowers/specs/2026-08-08-director-portal-redesign-design.md`
План: `docs/superpowers/plans/2026-08-08-design-tokens-and-themes.md`

- Две параллельные системы CSS-переменных сведены в одну. Старые имена
  (`--page-bg`, `--text-primary`, `--success`…) оставлены **алиасами** —
  27 файлов с хардкодом ещё на них ссылаются, их чистка в следующем плане.
- `.dark` больше не копия светлой темы; у всех токенов, включая смысловые
  и палитру графиков, есть значения для обеих тем.
- `theme.tsx` переписан: три состояния (`light`/`dark`/`system`), подписка
  на системную тему, персистентность. Блокирующий скрипт в `__root.tsx`
  восстанавливает тему до первой отрисовки — раньше он её снимал.
- `styles.css` токенизирован целиком (было 113 хардкод-цветов). Исключение
  с намеренным хардкодом одно: фон экрана входа.
- Тесты: `e2e/theme.spec.ts` (9 тестов), `e2e/contrast.spec.ts`
  (WCAG AA по 14 парам в обеих темах).

**Переключатель темы создан, но НЕ смонтирован в интерфейс.** Пока
`enterprise-layout.tsx` и `mobile-layout.tsx` написаны на инлайн-стилях
с хардкодом, чрома в тёмной теме останется светлой. Монтирование — в плане
шага 3 (переписывание layout).
```

- [ ] **Step 4: Коммит**

```bash
git add CLAUDE.md DESIGN_SYSTEM.md
git commit -m "docs: record tokens and dual-theme support"
```

---

## Проверка плана против спеки

| Требование спеки | Задача |
|---|---|
| Шаг 1: один набор токенов, обе темы | 4, 5, 6 |
| Шаг 2: переключатель, персистентность, системная тема, без мигания | 2, 3, 8 |
| §7.1 глубина слоем, а не тенью в тёмной | 4 (комментарий и значения `--shadow-*`) |
| §7.1 палитра графиков в обеих темах | 4 |
| §7.2 зелёный вне шкалы значений | 4 (комментарий), 7 (тест намеренно не проверяет пару) |
| §7.6 локализация контрола | 8 (`tr()` на всех подписях) |
| Критерий приёмки 1: темы без мигания | 3 (тест `domcontentloaded`) |
| Критерий приёмки 2: нет хардкода | 6 (шаг 8, два `grep`) |
| Критерий приёмки 10: build и check проходят | 9 |
| §11 вопрос 2: ребрендинг, логотипы клиентов не трогаем | 6 (шаг 7 — перебрендированы только собственные цвета публичных экранов; загруженные логотипы организаций не участвуют) |

**Вне объёма этого плана, по спеке:** шаг 3 (layout), шаг 4 (27 файлов),
шаг 4½ (искажения чисел), шаги 5–7. Каждый — отдельный план.
