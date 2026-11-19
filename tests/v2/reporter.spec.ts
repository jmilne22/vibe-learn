import { test, expect } from "@playwright/test";

test("cloud reporter opens independently and navigates stages offline", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) =>
    new URL(route.request().url()).hostname === "127.0.0.1"
      ? route.continue()
      : route.abort(),
  );
  await page.goto("/#/projects");
  await page
    .getByRole("link")
    .filter({
      has: page.getByRole("heading", {
        name: "Cloud Resource Reporter",
        exact: true,
      }),
    })
    .click();
  await expect(page.locator("article")).toContainText("cloudreport repos");
  await page.screenshot({ path: "build/screenshots/cloud-reporter.png" });
  await page
    .getByRole("link", { name: /Fetch the remaining pages/ })
    .click();
  await expect(page).toHaveURL(/project%3Acloud-reporter\/pagination$/);
  await expect(page.locator("article")).toContainText('rel="next"');
  await page
    .getByRole("link", { name: /Write table, JSON, and CSV output/ })
    .click();
  await expect(page.locator("article")).toContainText('"total_repos": 3');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/read/project%3Acloud-reporter/formats");
  await expect(page.locator("article")).toContainText("API, workers");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
