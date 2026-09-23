import { test, expect } from "@playwright/test";

test("the authored Go course reads offline, exposes independent activities, and renders lab sources", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) =>
    new URL(route.request().url()).hostname === "127.0.0.1"
      ? route.continue()
      : route.abort(),
  );
  await page.goto("/#/courses");
  await page
    .getByRole("link")
    .filter({
      has: page.getByRole("heading", {
        name: "Go and Infrastructure Engineering",
        exact: true,
      }),
    })
    .click();
  await expect(page.locator("article")).toContainText(
    "Start with one decision",
  );
  await expect(page.locator("article")).toContainText("func ValidPort");
  await page.screenshot({ path: "build/screenshots/go-course-reading.png" });
  await page.getByRole("link", { name: "Exercises (12) →" }).click();
  await page
    .getByRole("navigation", { name: "Exercises" })
    .getByRole("link", { name: "Check one endpoint" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Check one endpoint", exact: true }),
  ).toBeVisible();
  await page.getByText("Hint 1", { exact: true }).click();
  await expect(
    page.getByText("Build the request with http.NewRequestWithContext."),
  ).toBeVisible();
  await page.screenshot({ path: "build/screenshots/go-course-exercise.png" });
  await page.goto(
    "/#/read/course%3Ago-infrastructure/modulekubernetes-03-lab-files",
  );
  await page
    .getByText("kubernetes/chart/templates/workload.yaml", { exact: true })
    .click();
  await expect(page.locator("article")).toContainText(
    "terminationGracePeriodSeconds: 15",
  );
  await page.goto(
    "/#/read/course%3Ago-infrastructure/modulekubernetes-02-break-and-repair-a-rollout",
  );
  await expect(page.locator("article")).toContainText("stalled rollout");
  await page.screenshot({ path: "build/screenshots/go-course-lab.png" });
  await page.getByRole("link", { name: "Flashcards (20) →" }).click();
  await page.getByRole("button", { name: "Reveal answer" }).click();
  await expect(
    page.getByText(/They test the inclusive boundaries/),
  ).toBeVisible();
  await page.screenshot({ path: "build/screenshots/go-course-flashcards.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    "/#/read/course%3Ago-infrastructure/modulestarting-01-start-with-a-decision",
  );
  await expect(page.locator("article")).toContainText(
    "Start with one decision",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
