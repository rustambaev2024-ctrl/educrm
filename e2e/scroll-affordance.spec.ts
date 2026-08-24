import { expect, test } from "@playwright/test";

/**
 * Страж аффорданса прокрутки.
 *
 * В проекте скроллбары были скрыты глобально (`scrollbar-width: none` плюс
 * `::-webkit-scrollbar { display: none }` в src/styles.css). Одновременно
 * 16 экранов с таблицами прокручиваются горизонтально внутри
 * `overflow-x-auto`, и ни один из них не превращается в карточки на узком
 * экране. Связка давала худший из возможных результатов: часть колонок
 * за краем экрана и ноль признаков, что она там есть.
 *
 * Тест не проверяет внешний вид полосы — только то, что она не спрятана.
 * Если её снова скроют «чтобы было чище», тест упадёт и объяснит почему.
 */

test("прокрутка не скрыта глобально", async ({ page }) => {
  await page.goto("/");

  const scrollbar = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.cssText = "width:60px;height:60px;overflow:auto;position:absolute;top:-9999px";
    const filler = document.createElement("div");
    filler.style.cssText = "width:400px;height:400px";
    probe.appendChild(filler);
    document.body.appendChild(probe);

    const style = getComputedStyle(probe);
    const width = style.getPropertyValue("scrollbar-width").trim();
    const color = style.getPropertyValue("scrollbar-color").trim();

    probe.remove();
    return { width, color };
  });

  expect(
    scrollbar.width,
    "scrollbar-width: none прячет единственный признак того, что контент прокручивается — таблицы уезжают вбок молча",
  ).not.toBe("none");

  // Второй признак: полоса не просто не спрятана, а осознанно оформлена.
  // Значение по умолчанию — "auto"; наше — пара цветов из токенов.
  // Занимаемое полосой место здесь намеренно НЕ проверяется: в headless
  // браузер рисует оверлейные полосы поверх контента, и такая проверка
  // мерила бы политику браузера, а не наш CSS.
  expect(
    scrollbar.color,
    "scrollbar-color должен приходить из токенов — если сброшен в auto, оформление полосы потеряно",
  ).not.toBe("auto");
});
