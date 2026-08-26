import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fsControl = vi.hoisted(() => ({ unlinkThrows: false }));
const keytarState = vi.hoisted(() => ({
  store: new Map<string, string>(),
  deleteThrows: false,
}));

vi.mock("node:fs", async (importActual) => {
  const actual = await importActual<typeof import("node:fs")>();
  return {
    ...actual,
    unlinkSync: (path: Parameters<typeof actual.unlinkSync>[0]) => {
      if (fsControl.unlinkThrows) throw new Error("EACCES: permission denied");
      return actual.unlinkSync(path);
    },
  };
});

vi.mock("keytar", () => ({
  default: {
    getPassword: async (s: string, a: string) => keytarState.store.get(`${s}:${a}`) ?? null,
    setPassword: async (s: string, a: string, p: string) => {
      keytarState.store.set(`${s}:${a}`, p);
    },
    deletePassword: async (s: string, a: string) => {
      if (keytarState.deleteThrows) throw new Error("keychain locked");
      return keytarState.store.delete(`${s}:${a}`);
    },
  },
}));

import { mkdirSync } from "node:fs";
import { clearCredentials, saveCredentials, saveStoredCredentials } from "../../auth/credentials.js";
import { mcpLog } from "../../log.js";

describe("auth/credentials — cleanup failure logging", () => {
  let home: string;

  beforeEach(() => {
    home = join(tmpdir(), `db90-mcp-cleanup-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    mkdirSync(home, { recursive: true });
    process.env.AIXLE_INSIGHTS_HOME = home;
    keytarState.store.clear();
    keytarState.deleteThrows = false;
    fsControl.unlinkThrows = false;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    delete process.env.AIXLE_INSIGHTS_HOME;
    delete process.env.AIXLE_INSIGHTS_MCP_DISABLE_KEYTAR;
    keytarState.store.clear();
    keytarState.deleteThrows = false;
    fsControl.unlinkThrows = false;
  });

  it("logs when removing a shadowed credentials.json fails after a keychain write", async () => {
    // Seed a file (keytar disabled), then enable keytar and force unlink to fail during save.
    process.env.AIXLE_INSIGHTS_MCP_DISABLE_KEYTAR = "true";
    await saveCredentials("file_token", "http://localhost:3000", home);
    delete process.env.AIXLE_INSIGHTS_MCP_DISABLE_KEYTAR;

    fsControl.unlinkThrows = true;
    const warnSpy = vi.spyOn(mcpLog, "warn");

    // keytar write succeeds -> removeFileCredential runs -> unlink throws -> warn
    await saveStoredCredentials(
      { host: "http://localhost:3000", accounts: { claude_code: "keychain_token" } },
      home,
    );

    expect(warnSpy).toHaveBeenCalledWith(
      "credentials_file_remove_failed",
      expect.objectContaining({ path: expect.stringContaining("credentials.json") }),
      false,
    );
  });

  it("logs when deleting the keychain entry fails", async () => {
    keytarState.deleteThrows = true;
    const warnSpy = vi.spyOn(mcpLog, "warn");

    await clearCredentials(home); // calls tryKeytarDelete -> throws -> warn

    expect(warnSpy).toHaveBeenCalledWith(
      "keytar_delete_failed",
      expect.objectContaining({ keytarService: expect.any(String) }),
      false,
    );
  });
});
