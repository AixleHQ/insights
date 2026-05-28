import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  credentialStateFilePath,
  migrateLegacyState,
  readState,
  stateKey,
  writeState,
} from "../state.js";

describe("stateKey", () => {
  it("derives hostname and token hash from a URL host", () => {
    expect(stateKey("https://app.db90.io", "my-token")).toMatch(/^state-app\.db90\.io-[a-f0-9]{12}$/);
  });

  it("sanitises invalid URL hosts", () => {
    expect(stateKey("not-a-url", "tok")).toMatch(/^state-not-a-url-[a-f0-9]{12}$/);
  });

  it("uses different keys for different tokens on the same host", () => {
    const a = stateKey("http://localhost:3000", "token-a");
    const b = stateKey("http://localhost:3000", "token-b");
    expect(a).not.toBe(b);
  });

  it("uses different keys for different hosts with the same token", () => {
    const local = stateKey("http://localhost:3000", "same-token");
    const staging = stateKey("https://insights.example.com", "same-token");
    expect(local).not.toBe(staging);
  });
});

describe("readState", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "db90-cursor-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns null lastProcessedAt when state file does not exist", () => {
    const state = readState(tempDir, "http://localhost:3000", "tok");
    expect(state.lastProcessedAt).toBeNull();
  });

  it("returns null when state file is empty/invalid JSON", () => {
    writeFileSync(join(tempDir, "state-localhost-00000000.json"), "not-json");
    const state = readState(tempDir);
    expect(state.lastProcessedAt).toBeNull();
  });

  it("reads a credential-scoped state file", () => {
    const host = "http://localhost:3000";
    const token = "test-token";
    const ts = "2024-01-15T12:00:00.000Z";
    writeFileSync(
      credentialStateFilePath(tempDir, host, token),
      JSON.stringify({ lastProcessedAt: ts })
    );
    const state = readState(tempDir, host, token);
    expect(state.lastProcessedAt).toBe(ts);
  });

  it("reads lastRecentCommitAt when present", () => {
    const host = "https://app.db90.io";
    const token = "tok";
    writeFileSync(
      credentialStateFilePath(tempDir, host, token),
      JSON.stringify({
        lastProcessedAt: "2024-01-15T00:00:00.000Z",
        lastRecentCommitAt: "2024-01-15T14:22:00.000Z",
      })
    );
    const state = readState(tempDir, host, token);
    expect(state.lastRecentCommitAt).toBe("2024-01-15T14:22:00.000Z");
  });

  it("falls back to legacy state.json when host/token omitted", () => {
    writeFileSync(
      join(tempDir, "state.json"),
      JSON.stringify({ lastProcessedAt: "2024-06-01T00:00:00.000Z" })
    );
    const state = readState(tempDir);
    expect(state.lastProcessedAt).toBe("2024-06-01T00:00:00.000Z");
  });
});

describe("writeState", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "db90-cursor-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("writes a credential-scoped state file", () => {
    const host = "http://localhost:3000";
    const token = "test-token";
    const ts = "2024-06-01T00:00:00.000Z";
    writeState({ lastProcessedAt: ts }, tempDir, host, token);

    const filePath = credentialStateFilePath(tempDir, host, token);
    expect(existsSync(filePath)).toBe(true);

    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as { lastProcessedAt: string };
    expect(parsed.lastProcessedAt).toBe(ts);
  });

  it("creates the directory if it does not exist", () => {
    const nestedDir = join(tempDir, "nested", "db90-cursor");
    writeState({ lastProcessedAt: null }, nestedDir, "http://localhost:3000", "tok");

    expect(
      existsSync(credentialStateFilePath(nestedDir, "http://localhost:3000", "tok"))
    ).toBe(true);
  });

  it("round-trips state correctly per credential", () => {
    const host = "https://insights.example.com";
    const token = "staging-token";
    const original = { lastProcessedAt: "2024-12-31T23:59:59.999Z" };
    writeState(original, tempDir, host, token);
    const read = readState(tempDir, host, token);
    expect(read.lastProcessedAt).toBe(original.lastProcessedAt);
  });

  it("keeps separate state per host", () => {
    const token = "shared-token";
    writeState({ lastProcessedAt: "2024-01-01T00:00:00.000Z" }, tempDir, "http://localhost:3000", token);
    writeState(
      { lastProcessedAt: "2024-06-15T10:30:00.000Z" },
      tempDir,
      "https://insights.example.com",
      token
    );

    expect(readState(tempDir, "http://localhost:3000", token).lastProcessedAt).toBe(
      "2024-01-01T00:00:00.000Z"
    );
    expect(
      readState(tempDir, "https://insights.example.com", token).lastProcessedAt
    ).toBe("2024-06-15T10:30:00.000Z");
  });
});

describe("migrateLegacyState", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "db90-cursor-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("renames legacy state.json to the credential-scoped file", () => {
    const host = "http://localhost:3000";
    const token = "my-token";
    const legacy = { lastProcessedAt: "2024-03-01T00:00:00.000Z", lastRecentCommitAt: null };
    writeFileSync(join(tempDir, "state.json"), JSON.stringify(legacy));

    migrateLegacyState(tempDir, host, token);

    expect(existsSync(join(tempDir, "state.json"))).toBe(false);
    const migrated = readState(tempDir, host, token);
    expect(migrated.lastProcessedAt).toBe("2024-03-01T00:00:00.000Z");
  });

  it("does not overwrite an existing credential-scoped file", () => {
    const host = "http://localhost:3000";
    const token = "my-token";
    writeFileSync(join(tempDir, "state.json"), JSON.stringify({ lastProcessedAt: "2024-01-01T00:00:00.000Z" }));
    writeState({ lastProcessedAt: "2024-06-01T00:00:00.000Z" }, tempDir, host, token);

    migrateLegacyState(tempDir, host, token);

    expect(readState(tempDir, host, token).lastProcessedAt).toBe("2024-06-01T00:00:00.000Z");
  });
});
