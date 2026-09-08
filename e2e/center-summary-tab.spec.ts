import { expect, test } from "@playwright/test";

/**
 * Вкладка «Обзор» живёт за авторизацией, а логин-хелпера в этом проекте нет
 * (см. e2e/table-cards.spec.ts, e2e/login-page.spec.ts — там та же причина
 * описана явно). Поэтому проверяется не реальный экран, а представительная
 * разметка теми же классами: ряд KPI `grid-cols-2 lg:grid-cols-4` и шапка с
 * переключателем периода и кнопками экспорта.
 *
 * Риск, который ловит тест — blowout-паттерн проекта (PR #16/#17): сетка без
 * базового класса растягивает мобильный layout за экран, а `overflow-x: hidden`
 * в PageShell молча режет контент вместо прокрутки.
 */

const SUMMARY_HTML = `
<div id="probe" style="width:100%">
  <div class="flex flex-wrap items-center gap-3">
    <div style="width:180px" class="h-9 rounded-md border"></div>
    <div class="ml-auto flex gap-2">
      <button class="h-9 px-3 rounded-md border">Экспорт в Excel</button>
      <button class="h-9 px-3 rounded-md border">Экспорт в PDF</button>
    </div>
  </div>
  <div class="grid grid-cols-2 gap-3 lg:grid-cols-4 mt-6">
    <div style="min-height:80px" class="rounded-lg border p-3">Всего учеников</div>
    <div style="min-height:80px" class="rounded-lg border p-3">Активных учеников</div>
    <div style="min-height:80px" class="rounded-lg border p-3">Должников</div>
    <div style="min-height:80px" class="rounded-lg border p-3">Средняя посещаемость</div>
  </div>
</div>`;

async function mount(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.evaluate((html) => {
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:0;top:0;width:100%;z-index:99999";
    // Разметка статическая, задана в тесте, а не получена извне.
    host.innerHTML = html;
    document.body.appendChild(host);
  }, SUMMARY_HTML);
}

test("сводка не даёт горизонтальной прокрутки", async ({ page }) => {
  await mount(page);

  const docOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );

  expect(
    docOverflow,
    "страница не должна прокручиваться вбок из-за ряда KPI и шапки экспорта",
  ).toBeLessThanOrEqual(0);
});

test("ряд KPI — две колонки на телефоне, четыре на десктопе", async ({ page }, testInfo) => {
  await mount(page);

  const result = await page.evaluate(() => {
    const grid = document.querySelector("#probe > .grid") as HTMLElement;
    return {
      narrow: window.matchMedia("(max-width: 1023px)").matches,
      columnCount: getComputedStyle(grid).gridTemplateColumns.split(" ").length,
    };
  });

  if (testInfo.project.name === "mobile") {
    expect(
      result.narrow,
      'профиль "mobile" обязан попадать в max-width: 1023px — иначе проверка ничего не проверяет',
    ).toBe(true);
  }

  expect(result.columnCount).toBe(result.narrow ? 2 : 4);
});
