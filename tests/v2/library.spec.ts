import { test, expect } from "@playwright/test";

test("minimal landing page, projects list, inline workspace/notes panels, zip export, and new project page", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Vibe Learn" })).toBeVisible();
  await expect(page.getByText("npx skills add jmilne22/vibe-learn")).toBeVisible();
  await expect(page.getByLabel("Workspace layout")).toContainText("MENTOR-NOTES.md");
  await expect(page.getByRole("navigation")).not.toContainText(
    /Search|Courses|Flashcards|Daily Practice/,
  );
  await page.screenshot({ path: "build/screenshots/home.png", fullPage: true });

  // Browse projects
  await page.getByRole("link", { name: /Browse \d+ projects/ }).click();
  await expect(page.getByRole("heading", { name: /^Projects \(/ })).toBeVisible();
  await page.screenshot({
    path: "build/screenshots/projects.png",
    fullPage: true,
  });

  // Open Relay Operator
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

  // Save bookmark and note in browser localStorage
  await page.getByRole("button", { name: /Save$/ }).click();
  await expect(page.getByRole("button", { name: /Saved/ })).toBeVisible();

  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await page
    .getByRole("textbox", { name: /Notes/ })
    .fill("Check reconciliation loop idempotency.");
  await page.getByRole("button", { name: "Save notes" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  // Open inline Workspace panel and download .zip
  await page.getByRole("button", { name: "Workspace", exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download workspace (.zip)" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("relay-operator.zip");

  // Reload and confirm bookmark persists
  await page.reload();
  await expect(page.getByRole("button", { name: /Saved/ })).toBeVisible();

  // Navigate step link
  await page.getByRole("link", { name: /Step 3.*Reconcile/ }).click();
  await expect(page.locator("article")).toContainText(
    "Reconcile desired state",
  );

  // Visit New project page
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "New", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "New project" }),
  ).toBeVisible();
  await page
    .getByLabel("What do you want to build?")
    .fill("Build a TCP load balancer with health checks");
  await expect(page.locator("main")).toContainText(
    "npx skills add jmilne22/vibe-learn",
  );
  await expect(page.locator("main")).toContainText(
    "Build a TCP load balancer with health checks",
  );
  await page.screenshot({
    path: "build/screenshots/new-project.png",
    fullPage: true,
  });

  expect(errors).toEqual([]);
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
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "build/screenshots/landing-mobile.png",
    fullPage: true,
  });

  await page.getByRole("link", { name: /Browse \d+ projects/ }).click();
  await page
    .getByRole("link")
    .filter({
      has: page.getByRole("heading", { name: "Build an ingest relay" }),
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

test("web app reads project briefs with external network requests blocked", async ({
  page,
}) => {
  await page.route("**/*", (route) =>
    new URL(route.request().url()).hostname === "127.0.0.1"
      ? route.continue()
      : route.abort(),
  );
  await page.goto("/#/read/project%3Aingest-relay/overview");
  await expect(page.locator("article")).toContainText("Build an ingest relay");
});
