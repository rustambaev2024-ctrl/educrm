import { expect, test } from "@playwright/test";

/**
 * Тач-цели иконочных кнопок.
 *
 * Иконки удаления, правки и отмены платежа в строках таблиц задавались
 * от 24px (size-6) до 36px. Это самые дорогие промахи в продукте: рядом
 * стоят «изменить» и «удалить».
 *
 * Правило живёт в одном месте — класс .edu-tap в базовом размере `icon`
 * компонента Button, с min-width/min-height внутри
 * @media (pointer: coarse). Минимум перебивает заданную ширину, поэтому
 * работает и для переопределений у вызывающих.
 *
 * Тест проверяет оба профиля осмысленно: на тач-устройстве ждём 44px,
 * на десктопе с мышью — исходные 36px, потому что раздувать плотные
 * таблицы под мышь не нужно.
 */

test("иконочная кнопка дотягивает до 44px там, где палец", async ({ page }, testInfo) => {
  await page.goto("/");

  const measured = await page.evaluate(() => {
    const probe = document.createElement("button");
    // Те же классы, что даёт Button при size="icon".
    probe.className = "h-9 w-9 edu-tap";
    probe.style.position = "absolute";
    probe.style.top = "-9999px";
    document.body.appendChild(probe);

    const rect = probe.getBoundingClientRect();
    const coarse = window.matchMedia("(pointer: coarse)").matches;

    probe.remove();
    return { width: rect.width, height: rect.height, coarse };
  });

  // Страж валидности самого теста: если профиль "mobile" перестанет
  // эмулировать грубый указатель, ветка с 44px молча перестанет
  // выполняться, и тест будет зелёным, ничего не проверяя.
  if (testInfo.project.name === "mobile") {
    expect(
      measured.coarse,
      'профиль "mobile" обязан давать pointer: coarse — иначе проверка тач-целей ничего не проверяет',
    ).toBe(true);
  }

  if (measured.coarse) {
    expect(
      measured.width,
      "на тач-устройстве иконочная кнопка обязана быть не меньше 44px по ширине",
    ).toBeGreaterThanOrEqual(44);
    expect(
      measured.height,
      "на тач-устройстве иконочная кнопка обязана быть не меньше 44px по высоте",
    ).toBeGreaterThanOrEqual(44);
  } else {
    expect(
      measured.width,
      "на десктопе размер не раздуваем: 36px достаточно для мыши",
    ).toBeCloseTo(36, 0);
  }
});

test("переопределённый размер тоже дотягивает до 44px", async ({ page }) => {
  await page.goto("/");

  const measured = await page.evaluate(() => {
    const probe = document.createElement("button");
    // Худший случай из кодовой базы: support-teacher-links.tsx ставит size-6.
    probe.className = "size-6 edu-tap";
    probe.style.position = "absolute";
    probe.style.top = "-9999px";
    document.body.appendChild(probe);

    const rect = probe.getBoundingClientRect();
    const coarse = window.matchMedia("(pointer: coarse)").matches;

    probe.remove();
    return { width: rect.width, coarse };
  });

  if (measured.coarse) {
    expect(
      measured.width,
      "min-width должен перебивать width из size-6 — иначе правило не покроет 40 мест с переопределениями",
    ).toBeGreaterThanOrEqual(44);
  }
});
