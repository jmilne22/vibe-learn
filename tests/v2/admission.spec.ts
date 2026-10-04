import { test, expect } from "@playwright/test";

test("admission illustrations work offline and remain readable on narrow screens", async ({ page }) => {
  await page.route("**/*", (route) =>
    new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort(),
  );
  await page.goto("/#/read/project%3Akubernetes-admission-lab/overview");
  await expect(page.locator("article h2").first()).toHaveText("Step 0 — Read the assigned article");
  for (const stage of ["first-pod", "admission"]) {
    await page.goto(`/#/read/project%3Akubernetes-admission-lab/${stage}`);
    const picture = page.locator("article .motion-animated");
    await expect(picture).toBeVisible();
    await expect.poll(() => picture.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(340);
    const start = await picture.screenshot({ path: `build/screenshots/${stage}-animation-start.png`, animations: "allow" });
    // Real elapsed frames verify the embedded image animation, not a renderer mock.
    await page.waitForTimeout(1500);
    const middle = await picture.screenshot({ path: `build/screenshots/${stage}-animation-middle.png`, animations: "allow" });
    expect(middle.equals(start)).toBe(false);
    await page.waitForTimeout(3600);
    const end = await picture.screenshot({ path: `build/screenshots/${stage}-animation-end.png`, animations: "allow" });
    await page.waitForTimeout(500);
    expect((await picture.screenshot({ animations: "allow" })).equals(end)).toBe(true);
  }
  await page.getByAltText(/^Admission Lab architecture:/).screenshot({ path: "build/screenshots/admission-architecture.png" });
  await page.goto("/#/read/project%3Akubernetes-admission-lab/first-pod");
  const picture = page.locator("article .motion-animated");
  await page.setViewportSize({ width: 390, height: 844 });
  await picture.scrollIntoViewIfNeeded();
  await picture.screenshot({ path: "build/screenshots/admission-mobile.png" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto("/#/read/project%3Akubernetes-admission-lab/admission");
  await page.getByAltText(/^Admission Lab architecture:/).screenshot({ path: "build/screenshots/admission-architecture-mobile.png" });
  await expect(page.locator("article img").last()).toBeVisible();
  await page.locator("article img").last().screenshot({ path: "build/screenshots/admission-tls.png" });
});

test("reduced motion leaves the full admission illustration static", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#/read/project%3Akubernetes-admission-lab/admission");
  await expect(page.locator("article .motion-animated")).toBeHidden();
  const picture = page.locator("article .motion-static");
  await expect(picture).toBeVisible();
  const start = await picture.screenshot({ path: "build/screenshots/admission-reduced-motion.png", animations: "allow" });
  await page.waitForTimeout(1500);
  expect((await picture.screenshot({ animations: "allow" })).equals(start)).toBe(true);
});
