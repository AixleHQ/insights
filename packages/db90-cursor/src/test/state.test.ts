import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readState, writeState } from "../state.js";

describe("readState", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "db90-cursor-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns null lastProcessedAt when state file does not exist", () => {
    const state = readState(tempDir);
    expect(state.lastProcessedAt).toBeNull();
  });

  it("returns null when state file is empty/invalid JSON", () => {
    const { writeFileSync } = require("node:fs");
    writeFileSync(join(tempDir, "state.json"), "not-json");
    const state = readState(tempDir);
    expect(state.lastProcessedAt).toBeNull();
  });

  it("reads a valid state file", () => {
    const { writeFileSync } = require("node:fs");
    const ts = "2024-01-15T12:00:00.000Z";
    writeFileSync(
      join(tempDir, "state.json"),
      JSON.stringify({ lastProcessedAt: ts })
    );
    const state = readState(tempDir);
    expect(state.lastProcessedAt).toBe(ts);
  });

  it("handles state file with null lastProcessedAt", () => {
    const { writeFileSync } = require("node:fs");
    writeFileSync(
      join(tempDir, "state.json"),
      JSON.stringify({ lastProcessedAt: null })
    );
    const state = readState(tempDir);
    expect(state.lastProcessedAt).toBeNull();
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

  it("writes a state file", () => {
    const ts = "2024-06-01T00:00:00.000Z";
    writeState({ lastProcessedAt: ts }, tempDir);

    const filePath = join(tempDir, "state.json");
    expect(existsSync(filePath)).toBe(true);

    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as { lastProcessedAt: string };
    expect(parsed.lastProcessedAt).toBe(ts);
  });

  it("creates the directory if it does not exist", () => {
    const nestedDir = join(tempDir, "nested", "db90-cursor");
    writeState({ lastProcessedAt: null }, nestedDir);

    expect(existsSync(join(nestedDir, "state.json"))).toBe(true);
  });

  it("round-trips state correctly", () => {
    const original = { lastProcessedAt: "2024-12-31T23:59:59.999Z" };
    writeState(original, tempDir);
    const read = readState(tempDir);
    expect(read.lastProcessedAt).toBe(original.lastProcessedAt);
  });

  it("overwrites existing state", () => {
    writeState({ lastProcessedAt: "2024-01-01T00:00:00.000Z" }, tempDir);
    const updated = "2024-06-15T10:30:00.000Z";
    writeState({ lastProcessedAt: updated }, tempDir);
    const read = readState(tempDir);
    expect(read.lastProcessedAt).toBe(updated);
  });
});
