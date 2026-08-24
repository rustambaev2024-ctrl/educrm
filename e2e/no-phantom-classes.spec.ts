import { expect, test } from "@playwright/test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Страж бесцветных классов.
 *
 * Найдено 2026-08-15: `bg-success`, `text-success`, `bg-warning`,
 * `text-warning`, `border-success` и родня использовались в 29 файлах
 * и не выпускали НИ ОДНОГО правила CSS — таких цветов не было объявлено
 * ни в одном наборе токенов, и Tailwind молча отбрасывал их как
 * неизвестные утилиты.
 *
 * Последствие: все статусные плашки, плитки показателей и уведомления,
 * задуманные зелёными и жёлтыми, были бесцветными. Кнопки отметки
 * посещаемости — самый нажимаемый элемент учителя — отличались только
 * иконкой. Полтора года никто не заметил, потому что отказ молчаливый:
 * класс в разметке есть, правила нет, ошибки нет.
 *
 * Тест берёт семантические классы прямо из исходников и проверяет, что
 * каждый реально красит. Придумать новое имя цвета и не объявить его
 * больше нельзя.
 */

/** Корни имён, за которые отвечает дизайн-система. Палитра Tailwind — не наша забота. */
const SEMANTIC_ROOTS = [
  "success",
  "warning",
  "danger",
  "info",
  "brand",
  "ok",
  "warn",
  "bad",
  "reward",
  "primary",
  "secondary",
  "destructive",
  "accent",
  "muted",
  "card",
  "popover",
  "sidebar",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith(".tsx") || full.endsWith(".ts")) out.push(full);
  }
  return out;
}

/** Собирает бесхитростные (без hover:/md: и без /50) семантические утилиты из исходников. */
function usedSemanticClasses(): string[] {
  const found = new Set<string>();
  const pattern = /(?<![\w:/-])(bg|text|border)-([a-z]+(?:-[a-z]+)*)(?![\w/-])/g;
  for (const file of walk("src")) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(pattern)) {
      const [, prefix, name] = match;
      if (!SEMANTIC_ROOTS.includes(name.split("-")[0])) continue;
      found.add(`${prefix}-${name}`);
    }
  }
  return [...found].sort();
}

test("каждый семантический класс цвета реально красит", async ({ page }) => {
  const classes = usedSemanticClasses();

  expect(
    classes.length,
    "не нашлось ни одного семантического класса — сломан разбор исходников, а не стили",
  ).toBeGreaterThan(10);

  await page.goto("/");

  const dead = await page.evaluate((list: string[]) => {
    // Маркер — заведомо чужой цвет. Пробник наследует его от обёртки,
    // поэтому «класс сработал» = «цвет перестал быть маркером».
    //
    // Сравнивать с цветом body нельзя: --card-foreground совпадает
    // с --foreground по значению, и рабочий класс выглядел бы мёртвым.
    // Маркер снимает эту неоднозначность — совпасть с ним не может
    // ни один цвет палитры.
    const SENTINEL = "rgb(1, 2, 3)";

    const host = document.createElement("div");
    host.style.position = "fixed";
    host.style.left = "-9999px";
    host.style.color = SENTINEL;
    host.style.borderColor = SENTINEL;

    const probe = document.createElement("div");
    probe.textContent = "x";
    host.appendChild(probe);
    document.body.appendChild(host);

    const result: string[] = [];
    for (const cls of list) {
      probe.className = cls;
      const style = getComputedStyle(probe);
      const prefix = cls.split("-")[0];

      let painted: boolean;
      if (prefix === "bg") {
        const bg = style.backgroundColor;
        painted = bg !== "" && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent";
      } else if (prefix === "text") {
        painted = style.color !== SENTINEL;
      } else {
        painted = style.borderTopColor !== SENTINEL;
      }

      if (!painted) result.push(cls);
    }

    host.remove();
    return result;
  }, classes);

  expect(
    dead,
    `Эти классы стоят в разметке, но не дают ни одного правила CSS — элементы с ними бесцветны:\n` +
      `${dead.join("\n")}\n\n` +
      `Объявите цвет в блоке @theme в src/styles.css либо замените класс на существующий.`,
  ).toEqual([]);
});

/** Светлые поверхности палитры — на них белый текст не читается. */
const LIGHT_SURFACES = [
  "bg-muted",
  "bg-background",
  "bg-card",
  "bg-popover",
  "bg-secondary",
  "bg-accent",
  "bg-ok-soft",
  "bg-warn-soft",
  "bg-bad-soft",
  "bg-info-soft",
  "bg-reward-soft",
  "bg-white",
];

test("белый текст не стоит на светлом фоне", () => {
  /**
   * Найдено 2026-08-15 по скриншоту, а не по коду.
   *
   * При переводе цвета на токены тёмный фон игровых экранов викторины
   * (bg-slate-900) отобразился в светлый bg-muted, а весь текст на них
   * белый. Экран входа по коду стал белым по кремовому — не читался
   * вообще. Сборка при этом проходила, типы были чисты, тесты зелены.
   *
   * Проверка статическая: ищет элементы, у которых в одном и том же
   * наборе классов и text-white, и светлая поверхность.
   */
  const offenders: string[] = [];

  for (const file of walk("src")) {
    const text = readFileSync(file, "utf8");
    const lines = text.split("\n");
    for (const match of text.matchAll(/className="([^"]*)"/g)) {
      const value = match[1];
      if (!value.includes("text-white")) continue;
      // Только непрозрачные поверхности. `bg-white/5` — это плёнка поверх
      // тёмного фона (так сделаны поля ввода на игровых экранах), она белый
      // текст не портит; запрет на неё был бы ложной тревогой.
      const surfaces = LIGHT_SURFACES.filter((s) =>
        new RegExp(`(?<![\\w-])${s}(?![\\w-/])`).test(value),
      );
      if (surfaces.length === 0) continue;
      const line = text.slice(0, match.index).split("\n").length;
      offenders.push(
        `${file.replace(/\\/g, "/")}:${line} — ${surfaces.join(", ")}\n    ${lines[line - 1]?.trim().slice(0, 100)}`,
      );
    }
  }

  expect(
    offenders,
    `Белый текст на светлой поверхности — такой текст не виден:\n${offenders.join("\n")}\n\n` +
      `Либо фон должен быть тёмным (--sidebar, --quiz-bg, --public-bg, bg-primary),\n` +
      `либо текст — не белым (text-foreground, text-muted-foreground).`,
  ).toEqual([]);
});
