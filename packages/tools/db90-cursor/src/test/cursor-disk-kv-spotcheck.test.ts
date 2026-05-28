import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import {
  DISK_KV_TABLE,
  redactBubbleSample,
  redactComposerSample,
  spotCheckCursorDiskKv,
  validateBlobShape,
  validateBubbleObserved,
  validateComposerObserved,
} from "../cursor-disk-kv-spotcheck.js";

function createDiskKvDb(
  dbPath: string,
  rows: Array<{ key: string; value: string }>
): void {
  mkdirSync(join(dbPath, ".."), { recursive: true });
  const db = new Database(dbPath);
  db.exec(`CREATE TABLE ${DISK_KV_TABLE} (key TEXT PRIMARY KEY, value TEXT)`);
  const insert = db.prepare(`INSERT INTO ${DISK_KV_TABLE} (key, value) VALUES (?, ?)`);
  for (const row of rows) insert.run(row.key, row.value);
  db.close();
}

describe("validateBlobShape", () => {
  it("accepts DATA-CURSOR §2.2 composer and bubble shapes", () => {
    const composer = validateBlobShape(
      {
        composerId: "cmp_abc",
        version: 3,
        createdAt: 1716195600000,
        mode: "agent",
        ruleCount: 2,
        latestConversationSummary: "secret",
      },
      [
        { name: "composerId", types: ["string"] },
        { name: "version", types: ["number"] },
        { name: "createdAt", types: ["number"] },
        { name: "mode", types: ["string"] },
      ]
    );
    expect(composer.matches).toBe(true);

    const bubble = validateBlobShape(
      {
        bubbleId: "bub_xyz",
        composerId: "cmp_abc",
        type: 2,
        createdAt: 1716195612345,
        text: "hello",
        codeBlocks: [{ language: "ts", lineCount: 14 }],
        toolFormerData: [{ tool: "edit_file", filePath: "src/mapper.ts" }],
        thinking: null,
      },
      [
        { name: "bubbleId", types: ["string"] },
        { name: "type", types: ["number"] },
        { name: "toolFormerData", types: ["object"] },
      ]
    );
    expect(bubble.matches).toBe(true);
  });
});

describe("validateComposerObserved", () => {
  it("accepts unifiedMode + _v layout from current Cursor", () => {
    const result = validateComposerObserved("composerData:uuid-1", {
      composerId: "uuid-1",
      _v: 16,
      unifiedMode: "agent",
      createdAt: 1779897787971,
    });
    expect(result.matches).toBe(true);
    expect(result.resolved.unifiedMode).toBe("agent");
  });
});

describe("validateBubbleObserved", () => {
  it("accepts composerId from key and ISO createdAt", () => {
    const result = validateBubbleObserved("bubbleId:uuid-1:bub-1", {
      bubbleId: "bub-1",
      type: 2,
      createdAt: "2026-05-27T20:19:41.929Z",
      toolFormerData: { tool: 15, name: "run_terminal_command_v2" },
    });
    expect(result.matches).toBe(true);
    expect(result.resolved.composerId).toBe("uuid-1");
  });
});

describe("redact samples", () => {
  it("does not leak prompt text in redacted output", () => {
    const c = redactComposerSample({
      latestConversationSummary: "super secret plan",
    });
    expect(String(c.latestConversationSummary)).not.toContain("super secret");

    const b = redactBubbleSample({
      text: "user prompt here",
      toolFormerData: [{ tool: "edit_file", filePath: "/Users/x/proj/src/foo.ts" }],
    });
    expect(String(b.text)).not.toContain("user prompt");
    expect(JSON.stringify(b.toolFormerData)).not.toContain("/Users/x");
  });
});

describe("spotCheckCursorDiskKv", () => {
  it("samples composerData and bubbleId from a test database", () => {
    const root = mkdtempSync(join(tmpdir(), "db90-v12-"));
    const dbPath = join(root, "globalStorage", "state.vscdb");
    const composerPayload = {
      composerId: "cmp_test123",
      version: 3,
      createdAt: 2000,
      mode: "agent",
      ruleCount: 1,
      latestConversationSummary: "refactor pricing",
    };
    const bubblePayload = {
      bubbleId: "bub_1",
      composerId: "cmp_test123",
      type: 2,
      createdAt: 2001,
      text: "assistant reply",
      codeBlocks: [{ language: "ts", lineCount: 3 }],
      toolFormerData: [{ tool: "edit_file", filePath: "src/a.ts" }],
      thinking: null,
    };

    createDiskKvDb(dbPath, [
      { key: "composerData:cmp_test123", value: JSON.stringify(composerPayload) },
      { key: "bubbleId:cmp_test123:bub_1", value: JSON.stringify(bubblePayload) },
      { key: "mcp:server1", value: "{}" },
    ]);

    const report = spotCheckCursorDiskKv(root);
    expect(report.table_exists).toBe(true);
    expect(report.key_counts).toMatchObject({
      composer_data: 1,
      bubble_id: 1,
      mcp: 1,
    });
    expect(report.sample_composer?.shape.matches_observed).toBe(true);
    expect(report.sample_bubble?.shape.matches_observed).toBe(true);
    expect(report.shape_matches_observed).toBe(true);
    expect(report.sample_composer?.shape.matches_doc_example).toBe(true);
    expect(report.sample_bubble?.shape.matches_doc_example).toBe(true);
    expect(report.ingest_scope_note).toContain("cursor-5");
  });
});
