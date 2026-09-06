import { expect, test } from "@playwright/test";

/**
 * Вкладка «Финансы» живёт за авторизацией, поэтому здесь проверяется не
 * реальный экран, а представительная разметка теми же классами
 * (`grid grid-cols-1 lg:grid-cols-3`, `TabsList` с двумя вкладками) —
 * тот же приём, что и в table-cards.spec.ts. Риск, который ловит этот
 * тест: базовый `grid-cols-1` перед `lg:grid-cols-3` (без него — тот самый
 * blowout-паттерн из PR #17), и что шапка с переключателем периода +
 * двумя кнопками экспорта не вылезает за 375px.
 */

const FINANCE_TAB_HTML = `
<div id="probe" style="width:100%">
  <div class="flex h-9 items-center gap-1 rounded-lg bg-muted p-1" role="tablist">
    <button role="tab">Обзор</button>
    <button role="tab" aria-selected="true">Финансы</button>
  </div>
  <div class="flex flex-wrap items-center justify-between gap-3 mt-4">
    <div style="width:180px" class="h-9 rounded-md border"></div>
    <div class="flex gap-2">
      <button class="h-9 px-3 rounded-md border">Экспорт в Excel</button>
      <button class="h-9 px-3 rounded-md border">Экспорт в PDF</button>
    </div>
  </div>
  <div class="grid grid-cols-1 gap-6 lg:grid-cols-3 mt-6">
    <div style="min-height:120px" class="rounded-lg border p-3">По филиалам</div>
    <div style="min-height:120px" class="rounded-lg border p-3">По курсам</div>
    <div style="min-height:120px" class="rounded-lg border p-3">По учителям</div>
  </div>
</div>`;

async function mount(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.evaluate((html) => {
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:0;top:0;width:100%;z-index:99999";
    host.innerHTML = html;
    document.body.appendChild(host);
  }, FINANCE_TAB_HTML);
}

test("вкладки и шапка с экспортом не вызывают горизонтальную прокрутку", async ({ page }) => {
  await mount(page);

  const docOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );

  expect(
    docOverflow,
    "страница не должна получать горизонтальную прокрутку от TabsList/шапки экспорта",
  ).toBeLessThanOrEqual(0);
});

test("сетка разрезов схлопывается в одну колонку на узком экране", async ({ page }, testInfo) => {
  await mount(page);

  const result = await page.evaluate(() => {
    const grid = document.querySelector("#probe > .grid") as HTMLElement;
    const style = getComputedStyle(grid);
    return {
      narrow: window.matchMedia("(max-width: 1023px)").matches,
      columnCount: style.gridTemplateColumns.split(" ").length,
    };
  });

  if (testInfo.project.name === "mobile") {
    expect(result.narrow, 'профиль "mobile" обязан попадать в max-width: 1023px (lg breakpoint)').toBe(true);
  }

  if (result.narrow) {
    expect(result.columnCount, "на телефоне сетка разрезов должна быть в одну колонку").toBe(1);
  } else {
    expect(result.columnCount, "на десктопе — три колонки разрезов рядом").toBe(3);
  }
});
