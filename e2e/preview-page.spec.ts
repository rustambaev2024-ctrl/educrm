import { expect, test } from "@playwright/test";

/**
 * Публичная витрина /preview — то, что показываем владельцу без входа
 * в систему. Реальные компоненты, образцы данных.
 */

test("витрина отмечает всех и прячет кнопку быстрого пути", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto("/preview");
  await page.waitForLoadState("networkidle");

  const bar = page.getByText(/Отмечено: \d+\/7/);
  await expect(bar).toContainText("0/7");

  const markAll = page.getByRole("button", { name: "Отметить всех пришедшими" });
  await markAll.click();

  await expect(bar).toContainText("7/7");
  await expect(markAll).toBeHidden();
});

test("одиночная отметка и переключение урока работают", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto("/preview");
  await page.waitForLoadState("networkidle");

  await page.locator('button[aria-label="Был"]').first().click();
  await expect(page.getByText(/Отмечено: \d+\/7/)).toContainText("1/7");

  await page.getByRole("button", { name: /14:00/ }).click();
  await expect(page.locator("div.bg-sidebar").first()).toContainText("Математика");
});
