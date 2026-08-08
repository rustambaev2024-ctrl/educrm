import { expect, test } from "@playwright/test";

/**
 * Golden-path smoke test for the login page — deliberately does not depend
 * on any specific test account/tenant, so it stays valid regardless of what
 * data exists in the local dev DB. Two things it directly guards against:
 *
 * 1. The page rendering at all (catches build/route-level breakage).
 * 2. Horizontal overflow on a narrow viewport — this project's most
 *    frequently recurring bug class (CSS grid/flex "blowout on mobile",
 *    see .claude/skills/design-system/SKILL.md and PR #16/#17). The
 *    "mobile" project in playwright.config.ts runs this same spec at a
 *    375px-class viewport (Pixel 7), which is exactly the width where
 *    that bug shipped to production before.
 */

test("login page renders with phone/password fields", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#phone")).toBeVisible();
  await expect(page.locator("#password")).toBeVisible();
});

test("login page has no horizontal overflow", async ({ page }) => {
  await page.goto("/");
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, "document.documentElement.scrollWidth should not exceed clientWidth (horizontal overflow)").toBeLessThanOrEqual(
    clientWidth,
  );
});
