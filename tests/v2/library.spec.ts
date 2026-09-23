import { test, expect } from "@playwright/test";
test("read-only preview provides independent paths, useful search, and no old controls", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: /A desktop app for.*your learning material/,
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Preview the app" }).click();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Projects", exact: true })
    .click();
  await page
    .getByRole("link")
    .filter({
      has: page.getByRole("heading", {
        name: "Build a relay operator",
        exact: true,
      }),
    })
    .click();
  await expect(page.getByText("Guided project ·")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Workspace", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: /Step 3.*Reconcile/ }).click();
  await expect(page.locator("article")).toContainText(
    "Reconcile desired state",
  );
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Search" })
    .click();
  await page.getByLabel("Search lessons and project briefs").fill("queue");
  await expect(page.locator("main")).toContainText("matching sections");
  await expect(page.locator("main a").first()).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Courses" })
    .click();
  await expect(
    page.getByText("No courses yet.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Browse projects" }),
  ).toBeVisible();
  await expect(page.getByRole("navigation")).not.toContainText(
    /Daily Practice|Analytics/,
  );
  expect(errors).toEqual([]);
  await page.goto("/");
  await page.screenshot({ path: "build/screenshots/home.png", fullPage: true });
});
test("reading navigation remains usable on narrow screens and keyboard focus is visible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
  await expect(
    page.getByRole("heading", {
      name: /A desktop app for.*your learning material/,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "build/screenshots/landing-mobile.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Preview the app" }).click();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Projects", exact: true })
    .click();
  await page
    .getByRole("link")
    .filter({
      has: page.getByRole("heading", {
        name: "Build an ingest relay",
      }),
    })
    .click();
  await expect(page.locator("article")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "build/screenshots/reading-mobile.png",
    fullPage: true,
  });
});
test("preview reads and searches with external network requests blocked", async ({
  page,
}) => {
  await page.route("**/*", (route) =>
    new URL(route.request().url()).hostname === "127.0.0.1"
      ? route.continue()
      : route.abort(),
  );
  await page.goto("/#/search");
  await page.getByLabel("Search lessons and project briefs").fill("shutdown");
  await expect(
    page.getByRole("link", { name: /Stop without losing work/ }),
  ).toBeVisible();
});
