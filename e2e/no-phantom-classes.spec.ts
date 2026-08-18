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
