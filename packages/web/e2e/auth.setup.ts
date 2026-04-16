import { test as setup, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const authFile = "./e2e/.auth/user.json";

// Test credentials - these match the seeded user
// Note: Requires the user to exist in Keycloak with password enabled
const TEST_EMAIL = "ada.lovelace@example.com";
const TEST_PASSWORD = "password123";

// Keycloak configuration (must match frontend config)
const KEYCLOAK_URL = "http://localhost:8080";
const KEYCLOAK_REALM = "db90";
const KEYCLOAK_CLIENT_ID = "db90-web";

/**
 * Authentication setup for e2e tests.
 *
 * This setup handles login via Keycloak's token endpoint directly,
 * bypassing the UI for automated testing.
 */
setup("authenticate", async ({ page, request }) => {
  // Check if auth file already exists and was modified recently (within 30 mins)
  const authPath = path.resolve(authFile);
  if (fs.existsSync(authPath)) {
    try {
      const stats = fs.statSync(authPath);
      const ageMs = Date.now() - stats.mtimeMs;
      const thirtyMinsMs = 30 * 60 * 1000;

      if (ageMs < thirtyMinsMs) {
        const authData = JSON.parse(fs.readFileSync(authPath, "utf-8"));
        if (authData.cookies && authData.cookies.length > 0) {
          console.log(`Using existing auth state (${Math.round(ageMs / 60000)} minutes old)...`);
          return;
        }
      }
    } catch {
      console.log("Could not read existing auth file, will authenticate...");
    }
  }

  // Set timeout
  setup.setTimeout(60000);

  // Get tokens directly from Keycloak using Resource Owner Password Grant
  console.log("Authenticating via Keycloak token endpoint...");

  const tokenUrl = `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`;

  const tokenResponse = await request.post(tokenUrl, {
    form: {
      grant_type: "password",
      client_id: KEYCLOAK_CLIENT_ID,
      username: TEST_EMAIL,
      password: TEST_PASSWORD,
      scope: "openid profile email",
    },
  });

  if (!tokenResponse.ok()) {
    const errorData = await tokenResponse.json().catch(() => ({}));
    console.error("Token request failed:", errorData);
    throw new Error(`Authentication failed: ${errorData.error_description || errorData.error || "Unknown error"}`);
  }

  const tokens = await tokenResponse.json();
  console.log("Got tokens from Keycloak");

  // Parse the ID token to get user info
  const idTokenParts = tokens.id_token.split(".");
  const idTokenPayload = JSON.parse(Buffer.from(idTokenParts[1], "base64").toString());

  // Build the OIDC user object that oidc-client-ts expects
  const authority = `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}`;
  const storageKey = `oidc.user:${authority}:${KEYCLOAK_CLIENT_ID}`;

  const oidcUser = {
    access_token: tokens.access_token,
    token_type: tokens.token_type || "Bearer",
    id_token: tokens.id_token,
    refresh_token: tokens.refresh_token,
    profile: {
      sub: idTokenPayload.sub,
      iss: idTokenPayload.iss,
      aud: idTokenPayload.aud,
      exp: idTokenPayload.exp,
      iat: idTokenPayload.iat,
      email: idTokenPayload.email,
      name: idTokenPayload.name,
      preferred_username: idTokenPayload.preferred_username,
      email_verified: idTokenPayload.email_verified,
    },
    expires_at: Math.floor(Date.now() / 1000) + tokens.expires_in,
    scope: tokens.scope,
    session_state: tokens.session_state,
  };

  // Navigate to the app and inject the auth state
  await page.goto("/");

  // Store the OIDC user in sessionStorage (where oidc-client-ts stores it)
  await page.evaluate(({ key, value }) => {
    sessionStorage.setItem(key, JSON.stringify(value));
  }, { key: storageKey, value: oidcUser });

  console.log("Injected auth tokens into sessionStorage");

  // Reload to pick up the auth state
  await page.reload();

  // Wait for dashboard to load
  await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible({ timeout: 15000 });

  console.log("Login successful!");

  // Save the storage state (cookies + localStorage + we'll add sessionStorage manually)
  const storageState = await page.context().storageState();

  // Add sessionStorage to origins
  const sessionStorageData = await page.evaluate(() => {
    const data: { name: string; value: string }[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key) {
        data.push({ name: key, value: sessionStorage.getItem(key) || "" });
      }
    }
    return data;
  });

  // Find or create the origin entry for localhost:5173
  const originIndex = storageState.origins.findIndex(o => o.origin === "http://localhost:5173");
  if (originIndex >= 0) {
    // @ts-expect-error - adding sessionStorage which isn't in the type but we'll handle it
    storageState.origins[originIndex].sessionStorage = sessionStorageData;
  } else {
    storageState.origins.push({
      origin: "http://localhost:5173",
      localStorage: [],
      // @ts-expect-error - adding sessionStorage which isn't in the type but we'll handle it
      sessionStorage: sessionStorageData,
    });
  }

  // Save to file
  fs.writeFileSync(authPath, JSON.stringify(storageState, null, 2));
  console.log("Authentication state saved!");
});
