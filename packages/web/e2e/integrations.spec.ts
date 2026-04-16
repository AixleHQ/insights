import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const authFile = "./e2e/.auth/user.json";

async function restoreSessionStorage(page: import("@playwright/test").Page) {
  const authPath = path.resolve(authFile);
  if (!fs.existsSync(authPath)) {
    throw new Error("Auth file not found. Run npm run test:e2e:setup first.");
  }

  const authData = JSON.parse(fs.readFileSync(authPath, "utf-8"));

  await page.goto("/");

  const origin = authData.origins?.find(
    (o: { origin: string }) => o.origin === "http://localhost:5173",
  );
  if (origin?.sessionStorage) {
    for (const item of origin.sessionStorage) {
      await page.evaluate(
        ({ key, value }) => {
          sessionStorage.setItem(key, value);
        },
        { key: item.name, value: item.value },
      );
    }
    await page.reload();
  }

  await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible({ timeout: 20000 });
}

const sidebarIntegrations = '[data-sidebar="menu-button"]:has-text("Integrations")';

test.describe("Integrations page — URL-driven tabs", () => {
  test.beforeEach(async ({ page }) => {
    await restoreSessionStorage(page);
  });

  test("/integrations redirects to /integrations/connected", async ({ page }) => {
    await page.locator(sidebarIntegrations).click();
    await expect(page).toHaveURL(/\/integrations\/connected/, { timeout: 10000 });
  });

  test("/integrations/connected activates the Connected tab", async ({ page }) => {
    await page.locator(sidebarIntegrations).click();
    await expect(page).toHaveURL(/\/integrations\/connected/);
    const connectedTab = page.getByRole("tab", { name: /connected/i });
    await expect(connectedTab).toBeVisible({ timeout: 10000 });
    await expect(connectedTab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tab", { name: /available/i })).toHaveAttribute("aria-selected", "false");
  });

  test("/integrations/available activates the Available tab", async ({ page }) => {
    await page.locator(sidebarIntegrations).click();
    await expect(page).toHaveURL(/\/integrations\/connected/);
    await page.getByRole("tab", { name: /available/i }).click();
    await expect(page).toHaveURL(/\/integrations\/available/);
    const availableTab = page.getByRole("tab", { name: /available/i });
    await expect(availableTab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tab", { name: /connected/i })).toHaveAttribute("aria-selected", "false");
  });

  test("clicking Available tab updates URL to /integrations/available", async ({ page }) => {
    await page.locator(sidebarIntegrations).click();
    await expect(page.getByRole("tab", { name: /connected/i })).toBeVisible({ timeout: 10000 });
    await page.getByRole("tab", { name: /available/i }).click();
    await expect(page).toHaveURL(/\/integrations\/available/);
    await expect(page.getByRole("tab", { name: /available/i })).toHaveAttribute("aria-selected", "true");
  });

  test("clicking Connected tab from Available updates URL to /integrations/connected", async ({ page }) => {
    await page.locator(sidebarIntegrations).click();
    await expect(page.getByRole("tab", { name: /connected/i })).toBeVisible({ timeout: 10000 });
    await page.getByRole("tab", { name: /available/i }).click();
    await expect(page).toHaveURL(/\/integrations\/available/);
    await page.getByRole("tab", { name: /connected/i }).click();
    await expect(page).toHaveURL(/\/integrations\/connected/);
    await expect(page.getByRole("tab", { name: /connected/i })).toHaveAttribute("aria-selected", "true");
  });

  test("sidebar Integrations link is active on /integrations/connected", async ({ page }) => {
    await page.locator(sidebarIntegrations).click();
    await expect(page.getByRole("tab", { name: /connected/i })).toBeVisible({ timeout: 10000 });
    const sidebarLink = page.locator('[data-sidebar="menu-button"][data-active="true"]', {
      hasText: "Integrations",
    });
    await expect(sidebarLink).toBeVisible();
  });

  test("sidebar Integrations link is active on /integrations/available", async ({ page }) => {
    await page.locator(sidebarIntegrations).click();
    await expect(page.getByRole("tab", { name: /connected/i })).toBeVisible({ timeout: 10000 });
    await page.getByRole("tab", { name: /available/i }).click();
    await expect(page).toHaveURL(/\/integrations\/available/);
    const sidebarLink = page.locator('[data-sidebar="menu-button"][data-active="true"]', {
      hasText: "Integrations",
    });
    await expect(sidebarLink).toBeVisible();
  });
});

test.describe("Integrations page — content", () => {
  test.beforeEach(async ({ page }) => {
    await restoreSessionStorage(page);
    await page.locator(sidebarIntegrations).click();
    await expect(page.getByRole("tab", { name: /connected/i })).toBeVisible({ timeout: 10000 });
  });

  test("Connected tab shows the seeded GitHub connector", async ({ page }) => {
    await expect(page.getByText(/github/i).first()).toBeVisible({ timeout: 10000 });
  });

  test("Available tab shows provider category headings", async ({ page }) => {
    await page.getByRole("tab", { name: /available/i }).click();
    await expect(page).toHaveURL(/\/integrations\/available/);
    await expect(page.getByText("AI Tools")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Code Hosting")).toBeVisible({ timeout: 10000 });
  });

  test("GitHub is not shown in Available tab (already connected)", async ({ page }) => {
    await page.getByRole("tab", { name: /available/i }).click();
    await expect(page).toHaveURL(/\/integrations\/available/);
    await expect(
      page.locator('[data-testid="integration-card"]', { hasText: "GitHub" }).or(
        page.locator(".integration-card", { hasText: "GitHub" }),
      ),
    ).toHaveCount(0);
  });
});
