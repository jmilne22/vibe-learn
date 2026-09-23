import { test, expect } from "@playwright/test";
import { fixtureCourse } from "./fixtures/course";
test("course activities are optional, hints and cards work in preview, and mobile layout stays usable", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/catalog.json", (route) =>
    route.fulfill({ json: { formatVersion: 2, items: [fixtureCourse] } }),
  );
  await page.goto("/#/read/course%3Afixture/intro");
  await page.getByRole("link", { name: "Exercises (2) →" }).click();
  await expect(
    page.getByRole("heading", { name: "Fix addition", exact: true }),
  ).toBeVisible();
  await page.getByText("Hint 1", { exact: true }).click();
  await expect(page.getByText("Use the addition operator.")).toBeVisible();
  await page
    .getByRole("navigation", { name: "Exercises" })
    .getByRole("link", { name: "Fix Rust addition" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Fix Rust addition", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Run checks" })).toHaveCount(0);
  await page.getByRole("link", { name: "← Test-only course" }).click();
  await page.getByRole("link", { name: /Another lesson/ }).click();
  await expect(page.locator("article")).toContainText("Another lesson");
  await page.getByRole("link", { name: "Flashcards (2) →" }).click();
  await expect(page.getByText("What is 2 + 3?")).toBeVisible();
  await expect(page.getByText("Five.", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Reveal answer" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Five.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next card" }).click();
  await expect(page.getByText("What is -1 + 1?")).toBeVisible();
  await expect(page.getByText("Zero.", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Review available/ }),
  ).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "build/screenshots/flashcards-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
