import { existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// In-memory keytar fake. Declared via vi.hoisted so the hoisted vi.mock factory can reference it.
const keytarState = vi.hoisted(() => ({
  store: new Map<string, string>(),
  throws: false,
}));

vi.mock("keytar", () => ({
  default: {
    getPassword: async (service: string, account: string) => {
      if (keytarState.throws) throw new Error("keytar unavailable");
      return keytarState.store.get(`${service}:${account}`) ?? null;
    },
    setPassword: async (service: string, account: string, password: string) => {
      if (keytarState.throws) throw new Error("keytar unavailable");
      keytarState.store.set(`${service}:${account}`, password);
    },
    deletePassword: async (service: string, account: string) => {
      if (keytarState.throws) throw new Error("keytar unavailable");
      return keytarState.store.delete(`${service}:${account}`);
    },
  },
}));

import {
  KEYTAR_SERVICE,
  clearCredentials,
  loadCredentials,
  saveCredentials,
} from "../../auth/credentials.js";
import { mcpLog } from "../../log.js";

// Pins the private keychain storage key (KEYTAR_ACCOUNT is intentionally not exported).
const KEYTAR_ACCOUNT = "aixle-insights-ingest-credential";

function seedKeytar(host: string, token: string): void {
  keytarState.store.set(
    `${KEYTAR_SERVICE}:${KEYTAR_ACCOUNT}`,
    JSON.stringify({ version: 2, host, accounts: { claude_code: token } }),
  );
}

describe("auth/credentials — keychain priority", () => {
  let home: string;

  beforeEach(() => {
    home = join(tmpdir(), `db90-mcp-prio-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    mkdirSync(home, { recursive: true });
    process.env.AIXLE_INSIGHTS_HOME = home;
    delete process.env.AIXLE_INSIGHTS_MCP_DISABLE_KEYTAR; // keytar enabled (mocked) by default
    keytarState.store.clear();
    keytarState.throws = false;
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    delete process.env.AIXLE_INSIGHTS_MCP_DISABLE_KEYTAR;
    keytarState.throws = false;
    await clearCredentials(home);
    keytarState.store.clear();
    delete process.env.AIXLE_INSIGHTS_HOME;
  });

  it("prefers the keychain over a present credentials.json and warns about drift", async () => {
    // Stale file written while keytar was disabled (the pre-fix shadowing scenario).
    process.env.AIXLE_INSIGHTS_MCP_DISABLE_KEYTAR = "true";
    await saveCredentials("file_token", "http://localhost:3000", home);
    delete process.env.AIXLE_INSIGHTS_MCP_DISABLE_KEYTAR;
    expect(existsSync(join(home, "credentials.json"))).toBe(true);

    seedKeytar("http://localhost:3000", "keychain_token"); // authoritative, different value

    const warnSpy = vi.spyOn(mcpLog, "warn");
    const creds = await loadCredentials(home);

    expect(creds?.accounts.claude_code).toBe("keychain_token");
    expect(warnSpy).toHaveBeenCalledWith(
      "credentials_file_shadowed_by_keychain",
      expect.objectContaining({ keytarService: KEYTAR_SERVICE }),
      false,
    );
    expect(existsSync(join(home, "credentials.json"))).toBe(true); // warn-only: file kept
  });

  it("returns the keychain credential without warning when no file exists", async () => {
    seedKeytar("http://localhost:3000", "keychain_token");
    const warnSpy = vi.spyOn(mcpLog, "warn");

    const creds = await loadCredentials(home);

    expect(creds?.accounts.claude_code).toBe("keychain_token");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("falls back to the file when keytar is disabled", async () => {
    process.env.AIXLE_INSIGHTS_MCP_DISABLE_KEYTAR = "true";
    await saveCredentials("file_token", "http://localhost:3000", home);

    const creds = await loadCredentials(home);
    expect(creds?.accounts.claude_code).toBe("file_token");
  });

  it("falls back to the file when disabled via the deprecated DB90_MCP_DISABLE_KEYTAR name", async () => {
    process.env.DB90_MCP_DISABLE_KEYTAR = "true";
    await saveCredentials("file_token", "http://localhost:3000", home);

    const creds = await loadCredentials(home);
    expect(creds?.accounts.claude_code).toBe("file_token");
    delete process.env.DB90_MCP_DISABLE_KEYTAR;
  });

  it("falls back to the file when keytar is unavailable (throws)", async () => {
    process.env.AIXLE_INSIGHTS_MCP_DISABLE_KEYTAR = "true";
    await saveCredentials("file_token", "http://localhost:3000", home);
    delete process.env.AIXLE_INSIGHTS_MCP_DISABLE_KEYTAR;
    keytarState.throws = true;

    const creds = await loadCredentials(home);
    expect(creds?.accounts.claude_code).toBe("file_token");
  });

  it("falls back to the file when the keychain is empty", async () => {
    process.env.AIXLE_INSIGHTS_MCP_DISABLE_KEYTAR = "true";
    await saveCredentials("file_token", "http://localhost:3000", home);
    delete process.env.AIXLE_INSIGHTS_MCP_DISABLE_KEYTAR;
    // keytarState.store left empty

    const creds = await loadCredentials(home);
    expect(creds?.accounts.claude_code).toBe("file_token");
  });

  it("returns null when neither keychain nor file has credentials", async () => {
    const creds = await loadCredentials(home);
    expect(creds).toBeNull();
  });
});
