import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for DB90 e2e tests.
 *
 * These tests verify that the seeded development data is correctly
 * linked to users after they log in via Keycloak/Google OAuth.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",

  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    // Setup project to save authentication state (run with --headed for manual OAuth)
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
    },
    // Chromium tests with setup dependency (requires manual OAuth each run)
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Use saved auth state from setup
        storageState: "./e2e/.auth/user.json",
      },
      dependencies: ["setup"],
    },
    // Chromium tests without setup - use when auth file already exists
    // Run with: npx playwright test --project=chromium-no-setup
    {
      name: "chromium-no-setup",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "./e2e/.auth/user.json",
      },
      testMatch: /.*\.spec\.ts/,
    },
  ],

  // Run local dev servers before tests
  webServer: [
    {
      command: "cd ../api && bundle exec rails server -p 3000",
      url: "http://localhost:3000/health",
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    },
    {
      command: "npm run dev",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    },
  ],
});
