import { expect, test } from "@playwright/test";

/**
 * Читаемость палитры, проверенная арифметикой, а не глазами.
 *
 * Ловит класс ошибок, который на глаз не отлавливается: цвет подобран
 * так, что «выглядит нормально» на мониторе разработчика, и оказывается
 * нечитаемым на дешёвом телефоне при солнце. Порог — WCAG AA.
 *
 * Проверяются пары «текст на своём фоне». Токены друг против друга
 * НЕ проверяются, и в одном месте это принципиально: --ok и --primary
 * близки по светлоте (контраст между ними ~1.1:1), развести их оттенком
 * нельзя. Решение структурное — --ok не участвует в шкале оценки
 * показателя и не встаёт рядом с --primary. Это правило ревью, а не
 * свойство цвета, поэтому тест его и не стережёт.
 *
 * Страница входа выбрана намеренно: она публичная, тесту не нужен
 * ни аккаунт, ни конкретная организация.
 */

const AA_NORMAL = 4.5;
/** Крупный текст и элементы управления — по WCAG достаточно 3:1. */
const AA_LARGE = 3;

const PAIRS: Array<[fg: string, bg: string, min: number, label: string]> = [
  ["--foreground", "--background", AA_NORMAL, "основной текст на холсте"],
  ["--muted-foreground", "--background", AA_NORMAL, "второстепенный текст на холсте"],
  ["--card-foreground", "--card", AA_NORMAL, "текст на карточке"],
  ["--muted-foreground", "--card", AA_NORMAL, "второстепенный текст на карточке"],
  ["--primary-foreground", "--primary", AA_NORMAL, "текст на кнопке действия"],
  ["--destructive-foreground", "--destructive", AA_NORMAL, "текст на опасной кнопке"],
  ["--accent-foreground", "--accent", AA_NORMAL, "текст на подсветке"],

  ["--ok", "--ok-soft", AA_NORMAL, "плашка подтверждения"],
  ["--warn", "--warn-soft", AA_NORMAL, "плашка внимания"],
  ["--bad", "--bad-soft", AA_NORMAL, "плашка опасности"],
  ["--info", "--info-soft", AA_NORMAL, "плашка информации"],
  ["--reward", "--reward-soft", AA_NORMAL, "плашка награды"],

  ["--warn", "--background", AA_NORMAL, "предупреждение текстом на холсте"],
  ["--bad", "--background", AA_NORMAL, "опасность текстом на холсте"],
  ["--info", "--background", AA_NORMAL, "информация текстом на холсте"],
  ["--reward", "--card", AA_NORMAL, "награда текстом на карточке"],

  ["--sidebar-foreground", "--sidebar", AA_NORMAL, "текст в боковом меню"],
  ["--sidebar-primary", "--sidebar", AA_LARGE, "активный пункт меню"],
  ["--reward-bright", "--sidebar", AA_LARGE, "золото на тёмной оправе"],

  ["--primary", "--background", AA_LARGE, "ссылка на холсте"],
  ["--primary", "--card", AA_LARGE, "ссылка на карточке"],
];

/**
 * Считает контраст всех пар в текущей теме страницы. Вынесено, чтобы
 * светлая и тёмная проверялись ОДНИМ набором правил: тема со своим,
 * более мягким списком перестаёт быть проверенной.
 */
async function measure(page: import("@playwright/test").Page) {
  return page.evaluate((pairs) => {
    const channel = (c: number) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    /** Разрешает любое CSS-значение цвета в яркость через браузер. */
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

    return pairs.map(([fgVar, bgVar, min, label]) => {
      const lf = luminance(root.getPropertyValue(fgVar as string).trim());
      const lb = luminance(root.getPropertyValue(bgVar as string).trim());
      if (lf === null || lb === null) {
        return { label, min, ratio: 0, resolved: false };
      }
      const hi = Math.max(lf, lb);
      const lo = Math.min(lf, lb);
      return { label, min, ratio: (hi + 0.05) / (lo + 0.05), resolved: true };
    });
  }, PAIRS);
}

function failuresOf(results: Awaited<ReturnType<typeof measure>>) {
  const failures: string[] = [];
  for (const r of results) {
    if (!r.resolved) {
      failures.push(`«${r.label}» — токен не разрешился в цвет`);
      continue;
    }
    const ratio = Math.round(r.ratio * 100) / 100;
    if (ratio < (r.min as number)) {
      failures.push(`«${r.label}» — ${ratio}:1, нужно ${r.min}:1`);
    }
  }
  return failures;
}

test("палитра проходит WCAG AA", async ({ page }) => {
  await page.goto("/");
  const failures = failuresOf(await measure(page));
  expect(
    failures,
    `Нечитаемые пары. Чинить ЗНАЧЕНИЕ токена в src/styles.css, не порог здесь:\n${failures.join("\n")}`,
  ).toEqual([]);
});

/**
 * Та же арифметика для тёмной темы.
 *
 * Тёмная тема появилась 2026-09-20 и до этого теста не проверялась
 * ничем: светлая была единственной, и гейт про неё ничего не знал.
 * Осветлять смысловые цвета на глаз особенно опасно: тёмный зелёный
 * успеха на почти чёрном фоне даёт 1.9:1 и невидим.
 */
test("тёмная тема проходит WCAG AA", async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("educrm.theme", "dark");
    } catch {
      /* приватное окно — проверка класса ниже это поймает */
    }
  });
  await page.goto("/");

  // Класс ставит блокирующий скрипт в <head>. Если он сломается, тема
  // молча останется светлой и проверка пройдёт впустую.
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);

  const failures = failuresOf(await measure(page));
  expect(
    failures,
    `Нечитаемые пары в тёмной теме. Чинить ЗНАЧЕНИЕ токена в блоке .dark:\n${failures.join("\n")}`,
  ).toEqual([]);
});

test("плотность compact реально сжимает шкалу отступов", async ({ page }) => {
  await page.goto("/");

  const spacing = await page.evaluate(() => {
    const read = (el: Element) =>
      getComputedStyle(el).getPropertyValue("--spacing").trim();

    const host = document.createElement("div");
    host.setAttribute("data-density", "compact");
    document.body.appendChild(host);
    const compact = read(host);
    host.remove();

    return { comfortable: read(document.documentElement), compact };
  });

  expect(
    spacing.comfortable,
    "--spacing обязан быть определён: на нём держится вся шкала отступов Tailwind v4",
  ).not.toBe("");
  expect(
    spacing.compact,
    "data-density=compact обязан переопределять --spacing — иначе плотность по ролям не работает",
  ).not.toBe(spacing.comfortable);
});
