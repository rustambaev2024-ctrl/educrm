import { expect, test } from "@playwright/test";

const PALETTE = {
  "--palette-coral": "#EE6352",
  "--palette-sky": "#08B2E3",
  "--palette-mist": "#EFE9F4",
  "--palette-green": "#57A773",
  "--palette-grape": "#484D6D",
};

const normalizeHex = (value: string) => value.toLowerCase();

test("app visual system uses the approved palette and restrained surfaces", async ({ page }) => {
  await page.goto("/");

  const result = await page.evaluate((palette) => {
    const root = getComputedStyle(document.documentElement);
    const bodyBefore = getComputedStyle(document.body, "::before");

    const cardProbe = document.createElement("div");
    cardProbe.className = "edu-card";
    cardProbe.textContent = "Surface probe";
    document.body.appendChild(cardProbe);
    const card = getComputedStyle(cardProbe);

    const primaryProbe = document.createElement("div");
    primaryProbe.className = "bg-gradient-primary";
    primaryProbe.textContent = "Primary probe";
    document.body.appendChild(primaryProbe);
    const primary = getComputedStyle(primaryProbe);

    const values = Object.fromEntries(
      Object.keys(palette).map((name) => [name, root.getPropertyValue(name).trim()]),
    );

    const cardBackground = card.backgroundColor;
    const primaryBackground =
      primary.backgroundImage === "none" ? primary.backgroundColor : primary.backgroundImage;
    const blur = card.backdropFilter || card.webkitBackdropFilter || "";
    const borderColor = card.borderTopColor;
    const radius = card.borderTopLeftRadius;
    cardProbe.remove();
    primaryProbe.remove();

    return {
      values,
      primary: root.getPropertyValue("--primary").trim(),
      sidebar: root.getPropertyValue("--sidebar").trim(),
      sidebarPrimary: root.getPropertyValue("--sidebar-primary").trim(),
      chart1: root.getPropertyValue("--chart-1").trim(),
      chart2: root.getPropertyValue("--chart-2").trim(),
      chart3: root.getPropertyValue("--chart-3").trim(),
      chart4: root.getPropertyValue("--chart-4").trim(),
      bodyBeforeContent: bodyBefore.content,
      bodyBeforeImage: bodyBefore.backgroundImage,
      bodyBeforeOpacity: bodyBefore.opacity,
      cardBackground,
      primaryBackground,
      blur,
      borderColor,
      radius,
    };
  }, PALETTE);

  expect(
    Object.fromEntries(
      Object.entries(result.values).map(([key, value]) => [key, normalizeHex(value)]),
    ),
  ).toEqual(
    Object.fromEntries(Object.entries(PALETTE).map(([key, value]) => [key, normalizeHex(value)])),
  );
  expect(normalizeHex(result.primary)).toBe(normalizeHex(PALETTE["--palette-grape"]));
  expect(normalizeHex(result.sidebar)).toBe(normalizeHex(PALETTE["--palette-grape"]));
  expect(normalizeHex(result.sidebarPrimary)).toBe(normalizeHex(PALETTE["--palette-sky"]));
  expect(normalizeHex(result.chart1)).toBe(normalizeHex(PALETTE["--palette-sky"]));
  expect(normalizeHex(result.chart2)).toBe(normalizeHex(PALETTE["--palette-green"]));
  expect(normalizeHex(result.chart3)).toBe(normalizeHex(PALETTE["--palette-coral"]));
  expect(normalizeHex(result.chart4)).toBe(normalizeHex(PALETTE["--palette-grape"]));

  expect(result.bodyBeforeContent).not.toBe("none");
  expect(result.bodyBeforeImage).toContain("crm-dashboard-bg.svg");
  expect(Number(result.bodyBeforeOpacity)).toBeGreaterThanOrEqual(0.45);
  expect(Number(result.bodyBeforeOpacity)).toBeLessThanOrEqual(0.85);

  expect(result.cardBackground).toMatch(/rgba\(255,\s*255,\s*255,\s*0\.9[0-9]\)/);
  expect(result.blur).toContain("blur(10px)");
  expect(result.borderColor).not.toBe("rgba(0, 0, 0, 0)");
  expect(result.radius).toBe("8px");
  expect(result.primaryBackground).not.toContain("linear-gradient");
});
