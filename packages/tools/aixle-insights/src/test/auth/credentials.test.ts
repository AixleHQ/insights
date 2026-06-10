import { mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearCredentials, loadCredentials, loadCredentialsFromFileOnly, saveCredentials } from "../../auth/credentials.js";

describe("auth/credentials", () => {
  let home: string;

  beforeEach(() => {
    home = join(tmpdir(), `db90-mcp-cred-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    mkdirSync(home, { recursive: true });
    process.env.DB90_MCP_HOME = home;
    process.env.DB90_MCP_DISABLE_KEYTAR = "true";
  });

  afterEach(async () => {
    await clearCredentials(home);
    delete process.env.DB90_MCP_HOME;
    delete process.env.DB90_MCP_DISABLE_KEYTAR;
  });

  it("saveCredentials writes a credentials file with restrictive mode on POSIX", async () => {
    await saveCredentials("db90_testtoken", "http://localhost:3000", home);
    const st = statSync(join(home, "credentials.json"));
    if (process.platform !== "win32") {
      expect((st.mode & 0o777) === 0o600).toBe(true);
    }
    const creds = await loadCredentials(home);
    expect(creds?.accounts.claude_code).toBe("db90_testtoken");
    expect(creds?.host).toBe("http://localhost:3000");
  });

  it("loadCredentialsFromFileOnly returns null for missing file", () => {
    expect(loadCredentialsFromFileOnly(home)).toBeNull();
  });

  it("clearCredentials removes the credentials file", async () => {
    await saveCredentials("db90_a", "http://localhost:3000", home);
    await clearCredentials(home);
    expect(loadCredentialsFromFileOnly(home)).toBeNull();
  });

  it("falls back to the credentials file when keytar is disabled or unavailable", async () => {
    await saveCredentials("db90_fallback", "http://localhost:3000", home);

    expect(loadCredentialsFromFileOnly(home)).toEqual({
      accounts: { claude_code: "db90_fallback" },
      host: "http://localhost:3000",
    });
    await expect(loadCredentials(home)).resolves.toEqual({
      accounts: { claude_code: "db90_fallback" },
      host: "http://localhost:3000",
    });
  });
});
