import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { readCursorActiveModel } from "../cursor-settings.js";

function makeSettingsDir(): string {
  return mkdtempSync(join(tmpdir(), "db90-cursor-settings-"));
}

/** Builds a fixture cursorDiskKV table with one composerData row per entry, in insertion order (later entries get higher rowid = "more recently touched", matching real Cursor's UNIQUE ON CONFLICT REPLACE behavior). */
function makeStateDbWithComposers(dir: string, composerValues: Array<Record<string, unknown>>): void {
  const globalStorageDir = join(dir, "globalStorage");
  mkdirSync(globalStorageDir, { recursive: true });
  const db = new Database(join(globalStorageDir, "state.vscdb"));
  db.exec("CREATE TABLE cursorDiskKV (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB)");
  composerValues.forEach((value, i) => {
    db.prepare("INSERT INTO cursorDiskKV VALUES (?, ?)").run(
      `composerData:composer-${i}`,
      JSON.stringify(value)
    );
  });
  db.close();
}

describe("readCursorActiveModel", () => {
  it("reads cursor.aiModel key from settings.json", () => {
    const dir = makeSettingsDir();
    writeFileSync(
      join(dir, "settings.json"),
      JSON.stringify({ "cursor.aiModel": "claude-4-sonnet" }),
      "utf-8"
    );
    expect(readCursorActiveModel(dir)).toEqual({
      model: "claude-4-sonnet",
      source: "settings_json",
    });
  });

  it("falls back to aiModel key", () => {
    const dir = makeSettingsDir();
    writeFileSync(join(dir, "settings.json"), JSON.stringify({ aiModel: "gpt-4o" }), "utf-8");
    expect(readCursorActiveModel(dir)).toEqual({ model: "gpt-4o", source: "settings_json" });
  });

  it("falls back to cursor.general.preferredModel key", () => {
    const dir = makeSettingsDir();
    writeFileSync(
      join(dir, "settings.json"),
      JSON.stringify({ "cursor.general.preferredModel": "o3-mini" }),
      "utf-8"
    );
    expect(readCursorActiveModel(dir)).toEqual({ model: "o3-mini", source: "settings_json" });
  });

  it("falls back to model key", () => {
    const dir = makeSettingsDir();
    writeFileSync(join(dir, "settings.json"), JSON.stringify({ model: "gemini-2.5-pro" }), "utf-8");
    expect(readCursorActiveModel(dir)).toEqual({
      model: "gemini-2.5-pro",
      source: "settings_json",
    });
  });

  it("prefers earlier settings.json keys in priority order", () => {
    const dir = makeSettingsDir();
    writeFileSync(
      join(dir, "settings.json"),
      JSON.stringify({
        "cursor.aiModel": "primary-model",
        aiModel: "secondary-model",
        model: "tertiary-model",
      }),
      "utf-8"
    );
    expect(readCursorActiveModel(dir)).toEqual({ model: "primary-model", source: "settings_json" });
  });

  it("trims whitespace from settings.json model name", () => {
    const dir = makeSettingsDir();
    writeFileSync(
      join(dir, "settings.json"),
      JSON.stringify({ "cursor.aiModel": "  claude-4-sonnet  " }),
      "utf-8"
    );
    expect(readCursorActiveModel(dir)).toEqual({
      model: "claude-4-sonnet",
      source: "settings_json",
    });
  });

  it("falls back to state.vscdb cursorDiskKV composerData modelConfig.modelName when settings.json has no model", () => {
    const dir = makeSettingsDir();
    writeFileSync(join(dir, "settings.json"), JSON.stringify({ theme: "dark" }), "utf-8");
    makeStateDbWithComposers(dir, [
      { modelConfig: { modelName: "gpt-5.5-high", selectedModels: [{ modelId: "gpt-5.5" }] } },
    ]);
    expect(readCursorActiveModel(dir)).toEqual({ model: "gpt-5.5-high", source: "state_vscdb" });
  });

  it("falls back to modelConfig.selectedModels[0].modelId when modelName is absent", () => {
    const dir = makeSettingsDir();
    makeStateDbWithComposers(dir, [
      { modelConfig: { selectedModels: [{ modelId: "gpt-5.5" }] } },
    ]);
    expect(readCursorActiveModel(dir)).toEqual({ model: "gpt-5.5", source: "state_vscdb" });
  });

  it("prefers settings.json over state.vscdb when both have a model", () => {
    const dir = makeSettingsDir();
    writeFileSync(
      join(dir, "settings.json"),
      JSON.stringify({ "cursor.aiModel": "from-settings" }),
      "utf-8"
    );
    makeStateDbWithComposers(dir, [
      { modelConfig: { modelName: "from-state-db" } },
    ]);
    expect(readCursorActiveModel(dir)).toEqual({ model: "from-settings", source: "settings_json" });
  });

  it("prefers the most recently touched composer (highest rowid) when multiple exist", () => {
    const dir = makeSettingsDir();
    makeStateDbWithComposers(dir, [
      { modelConfig: { modelName: "older-composer-model" } },
      { modelConfig: { modelName: "newest-composer-model" } },
    ]);
    expect(readCursorActiveModel(dir)).toEqual({
      model: "newest-composer-model",
      source: "state_vscdb",
    });
  });

  it("returns unresolved when neither settings.json nor state.vscdb has a model", () => {
    const dir = makeSettingsDir();
    writeFileSync(join(dir, "settings.json"), JSON.stringify({ theme: "dark" }), "utf-8");
    makeStateDbWithComposers(dir, [{ modelConfig: {} }]);
    expect(readCursorActiveModel(dir)).toEqual({ model: null, source: "unresolved" });
  });

  it("returns unresolved when state.vscdb has no cursorDiskKV table", () => {
    const dir = makeSettingsDir();
    mkdirSync(join(dir, "globalStorage"), { recursive: true });
    const db = new Database(join(dir, "globalStorage", "state.vscdb"));
    db.exec("CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value TEXT)");
    db.close();
    expect(readCursorActiveModel(dir)).toEqual({ model: null, source: "unresolved" });
  });

  it("returns unresolved when settings.json is absent and state.vscdb is absent", () => {
    const dir = makeSettingsDir();
    expect(readCursorActiveModel(dir)).toEqual({ model: null, source: "unresolved" });
  });

  it("returns unresolved when settings.json JSON is malformed and state.vscdb is absent", () => {
    const dir = makeSettingsDir();
    writeFileSync(join(dir, "settings.json"), "{ not valid json", "utf-8");
    expect(readCursorActiveModel(dir)).toEqual({ model: null, source: "unresolved" });
  });

  it("returns unresolved when settings.json value is not a string and state.vscdb is absent", () => {
    const dir = makeSettingsDir();
    writeFileSync(join(dir, "settings.json"), JSON.stringify({ "cursor.aiModel": 42 }), "utf-8");
    expect(readCursorActiveModel(dir)).toEqual({ model: null, source: "unresolved" });
  });

  it("returns unresolved when settings.json value is empty/whitespace and state.vscdb is absent", () => {
    const dir = makeSettingsDir();
    writeFileSync(join(dir, "settings.json"), JSON.stringify({ "cursor.aiModel": "   " }), "utf-8");
    expect(readCursorActiveModel(dir)).toEqual({ model: null, source: "unresolved" });
  });

  it("trims whitespace from state.vscdb modelName", () => {
    const dir = makeSettingsDir();
    makeStateDbWithComposers(dir, [
      { modelConfig: { modelName: "  claude-4-sonnet  " } },
    ]);
    expect(readCursorActiveModel(dir)).toEqual({
      model: "claude-4-sonnet",
      source: "state_vscdb",
    });
  });
});
