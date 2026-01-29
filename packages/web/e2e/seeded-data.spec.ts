import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const authFile = './e2e/.auth/user.json';

/**
 * E2E tests to verify seeded development data is correctly linked
 * to the authenticated user after login via Keycloak.
 *
 * These tests ensure that:
 * 1. The user sees their organization after login
 * 2. The user sees their seeded events and data
 * 3. The UserSyncService correctly links OAuth users to seeded data
 */

// Helper to restore sessionStorage from auth file
async function restoreSessionStorage(page: import('@playwright/test').Page) {
  const authPath = path.resolve(authFile);
  if (!fs.existsSync(authPath)) {
    throw new Error('Auth file not found. Run npm run test:e2e:setup first.');
  }

  const authData = JSON.parse(fs.readFileSync(authPath, 'utf-8'));

  // Navigate to page first
  await page.goto('/');

  // Find sessionStorage data for localhost:5173
  const origin = authData.origins?.find((o: { origin: string }) => o.origin === 'http://localhost:5173');
  if (origin?.sessionStorage) {
    for (const item of origin.sessionStorage) {
      await page.evaluate(({ key, value }) => {
        sessionStorage.setItem(key, value);
      }, { key: item.name, value: item.value });
    }
    // Reload to pick up the auth state
    await page.reload();
  }
}

test.describe('Seeded Data Verification', () => {
  test.beforeEach(async ({ page }) => {
    await restoreSessionStorage(page);
  });

  test('user can see their organization', async ({ page }) => {
    // Wait for dashboard to load
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible({ timeout: 15000 });

    // Check that organization name is visible in sidebar or header
    // The seeded org is "Acme Corp"
    await expect(page.getByText(/dual boot partners/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('dashboard shows seeded event data', async ({ page }) => {
    // Wait for dashboard to load
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible({ timeout: 15000 });

    // Check for metric cards with non-zero values
    // The seed creates ~41,000 events for the org
    // Wait for data to load (should show a number, not 0)
    await expect(page.getByText(/[1-9][0-9,]+/).first()).toBeVisible({ timeout: 15000 });
  });

  test('user can access events page with data', async ({ page }) => {
    await page.goto('/events');

    // Wait for events table to load
    await expect(page.getByRole('table')).toBeVisible({ timeout: 15000 });

    // Should have event rows (seeded user has 1500 events)
    const rows = page.locator('tbody tr');
    await expect(rows.first()).toBeVisible();

    // Verify some events are displayed
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);
  });

  test('user can access team page', async ({ page }) => {
    await page.goto('/team');

    // Should see team members list
    await expect(page.getByRole('heading', { name: /team/i })).toBeVisible({ timeout: 15000 });

    // The seed creates 101 users (1 owner + 100 engineers)
    // At minimum, we should see the logged-in user
    await expect(page.getByText(/billy\.boozer@dualbootpartners\.com/i)).toBeVisible({ timeout: 10000 });
  });

  test('user profile shows their stats', async ({ page }) => {
    await page.goto('/profile');

    // Should redirect to member profile page and show stats
    // Wait for profile to load
    await expect(page.getByText(/total events/i)).toBeVisible({ timeout: 15000 });

    // The seeded user has 1500 events - verify non-zero stats
    await expect(page.getByText(/[1-9][0-9,]*/).first()).toBeVisible();
  });

  test('user can see projects', async ({ page }) => {
    await page.goto('/projects');

    // Should see projects list
    await expect(page.getByRole('heading', { name: /projects/i })).toBeVisible({ timeout: 15000 });

    // The seed creates 7 projects
    // Wait for projects to load
    await page.waitForTimeout(2000);

    // Should have at least one project visible
    await expect(page.getByRole('link', { name: /view|details/i }).or(page.locator('a[href^="/projects/"]')).first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe('API Integration', () => {
  test.beforeEach(async ({ page }) => {
    await restoreSessionStorage(page);
  });

  test('organizations endpoint returns user orgs', async ({ page, request }) => {
    // Wait for dashboard to load (confirms auth is working)
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible({ timeout: 15000 });

    // Get the auth token from sessionStorage
    const token = await page.evaluate(() => {
      const storageKey = Object.keys(sessionStorage).find(k => k.includes('oidc'));
      if (storageKey) {
        const data = JSON.parse(sessionStorage.getItem(storageKey) || '{}');
        return data.access_token;
      }
      return null;
    });

    // Make API request
    const response = await request.get('/api/v1/users/me/organizations', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    // Should have at least one organization
    expect(data.data).toBeDefined();
    expect(data.data.length).toBeGreaterThan(0);

    // First org should be Acme Corp
    expect(data.data[0].name).toBe('Acme Corp');
  });

  test('user me endpoint returns correct user', async ({ page, request }) => {
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible({ timeout: 15000 });

    const token = await page.evaluate(() => {
      const storageKey = Object.keys(sessionStorage).find(k => k.includes('oidc'));
      if (storageKey) {
        const data = JSON.parse(sessionStorage.getItem(storageKey) || '{}');
        return data.access_token;
      }
      return null;
    });

    const response = await request.get('/api/v1/users/me', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    // User should be ada.lovelace
    expect(data.data.email).toBe('ada.lovelace@example.com');

    // Debug info should show events count (in development)
    if (data.data._debug) {
      expect(data.data._debug.total_events).toBeGreaterThan(0);
    }
  });
});
