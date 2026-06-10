import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readCursorActiveModel } from "../cursor-settings.js";

describe("readCursorActiveModel", () => {
  it("reads cursor.aiModel key", () => {
    const dir = mkdtempSync(join(tmpdir(), "db90-cursor-settings-"));
    writeFileSync(
      join(dir, "settings.json"),
      JSON.stringify({ "cursor.aiModel": "claude-4-sonnet" }),
      "utf-8"
    );
    expect(readCursorActiveModel(dir)).toBe("claude-4-sonnet");
  });

  it("falls back to aiModel key", () => {
    const dir = mkdtempSync(join(tmpdir(), "db90-cursor-settings-"));
    writeFileSync(join(dir, "settings.json"), JSON.stringify({ aiModel: "gpt-4o" }), "utf-8");
    expect(readCursorActiveModel(dir)).toBe("gpt-4o");
  });

  it("falls back to cursor.general.preferredModel key", () => {
    const dir = mkdtempSync(join(tmpdir(), "db90-cursor-settings-"));
    writeFileSync(
      join(dir, "settings.json"),
      JSON.stringify({ "cursor.general.preferredModel": "o3-mini" }),
      "utf-8"
    );
    expect(readCursorActiveModel(dir)).toBe("o3-mini");
  });

  it("falls back to model key", () => {
    const dir = mkdtempSync(join(tmpdir(), "db90-cursor-settings-"));
    writeFileSync(join(dir, "settings.json"), JSON.stringify({ model: "gemini-2.5-pro" }), "utf-8");
    expect(readCursorActiveModel(dir)).toBe("gemini-2.5-pro");
  });

  it("prefers earlier keys in priority order", () => {
    const dir = mkdtempSync(join(tmpdir(), "db90-cursor-settings-"));
    writeFileSync(
      join(dir, "settings.json"),
      JSON.stringify({
        "cursor.aiModel": "primary-model",
        aiModel: "secondary-model",
        model: "tertiary-model",
      }),
      "utf-8"
    );
    expect(readCursorActiveModel(dir)).toBe("primary-model");
  });

  it("returns null when no key matches", () => {
    const dir = mkdtempSync(join(tmpdir(), "db90-cursor-settings-"));
    writeFileSync(join(dir, "settings.json"), JSON.stringify({ theme: "dark" }), "utf-8");
    expect(readCursorActiveModel(dir)).toBeNull();
  });

  it("returns null when file is absent", () => {
    const dir = mkdtempSync(join(tmpdir(), "db90-cursor-settings-"));
    expect(readCursorActiveModel(dir)).toBeNull();
  });

  it("returns null when JSON is malformed", () => {
    const dir = mkdtempSync(join(tmpdir(), "db90-cursor-settings-"));
    writeFileSync(join(dir, "settings.json"), "{ not valid json", "utf-8");
    expect(readCursorActiveModel(dir)).toBeNull();
  });

  it("returns null when value is not a string", () => {
    const dir = mkdtempSync(join(tmpdir(), "db90-cursor-settings-"));
    writeFileSync(
      join(dir, "settings.json"),
      JSON.stringify({ "cursor.aiModel": 42 }),
      "utf-8"
    );
    expect(readCursorActiveModel(dir)).toBeNull();
  });

  it("returns null when value is empty or whitespace", () => {
    const dir = mkdtempSync(join(tmpdir(), "db90-cursor-settings-"));
    writeFileSync(
      join(dir, "settings.json"),
      JSON.stringify({ "cursor.aiModel": "   " }),
      "utf-8"
    );
    expect(readCursorActiveModel(dir)).toBeNull();
  });

  it("trims whitespace from model name", () => {
    const dir = mkdtempSync(join(tmpdir(), "db90-cursor-settings-"));
    writeFileSync(
      join(dir, "settings.json"),
      JSON.stringify({ "cursor.aiModel": "  claude-4-sonnet  " }),
      "utf-8"
    );
    expect(readCursorActiveModel(dir)).toBe("claude-4-sonnet");
  });
});
