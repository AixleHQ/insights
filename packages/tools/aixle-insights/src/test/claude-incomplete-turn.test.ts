/**
 * Regression-guard for mid-flight Claude transcript capture.
 *
 * Background — observed 2026-06-09 after PR #246 made Claude Code events
 * actually flow to staging: rows landed on the Events page with
 * `model: null`, `tokens_out: 0`, `cost: $0.00` but real `prompt_text`.
 * Root cause: `parseTranscriptFile`'s `flushCurrentTurn` persisted any
 * turn that had a user prompt, even if the assistant had not yet
 * responded. When `run --once` was triggered mid-stream, the reader
 * snapshotted user-only turns and they were checkpointed before the
 * assistant ever finished writing.
 *
 * Fix: an `isIncompleteTranscriptTurn` predicate that returns true when
 * the turn has no assistant activity (no text, no model, no output
 * tokens). Such turns are skipped during flush; the next sync cycle
 * re-parses the JSONL and persists the now-complete turn.
 */

import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isIncompleteTranscriptTurn,
  parseTranscriptFile,
  type ClaudeTranscriptTurn,
} from "../readers/claude.js";

function makeTurn(overrides: Partial<ClaudeTranscriptTurn> = {}): ClaudeTranscriptTurn {
  return {
    sessionId: "session-test",
    turnId: "session-test:1",
    filePath: "/tmp/session.jsonl",
    fileSize: 0,
    model: null,
    tokensIn: 0,
    tokensOut: 0,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    occurredAt: "2026-06-09T17:00:00.000Z",
    promptText: "",
    assistantText: "",
    riskLevel: "low",
    riskScore: 0,
    riskCategories: [],
    toolUses: [],
    navToolCalls: 0,
    totalToolCalls: 0,
    contentHash: "",
    ...overrides,
  };
}

describe("isIncompleteTranscriptTurn", () => {
  it("returns true for a user-only turn (mid-flight snapshot)", () => {
    const turn = makeTurn({
      promptText: "first verify claude code has no regression",
      model: null,
      assistantText: "",
      tokensOut: 0,
    });
    expect(isIncompleteTranscriptTurn(turn)).toBe(true);
  });

  it("returns false when the assistant has written text", () => {
    const turn = makeTurn({
      promptText: "done",
      assistantText: "Acknowledged.",
      model: null,
      tokensOut: 0,
    });
    expect(isIncompleteTranscriptTurn(turn)).toBe(false);
  });

  it("returns false when the assistant has model+tokens (even if assistantText is empty)", () => {
    const turn = makeTurn({
      promptText: "do a tool use",
      model: "claude-opus-4-7",
      tokensOut: 100,
      assistantText: "",
    });
    expect(isIncompleteTranscriptTurn(turn)).toBe(false);
  });

  it("returns true for the '[Request interrupted by user for tool use]' placeholder", () => {
    const turn = makeTurn({
      promptText: "[Request interrupted by user for tool use]",
      model: null,
      assistantText: "",
      tokensOut: 0,
    });
    // Interruption placeholders are dropped — same code path as mid-flight.
    expect(isIncompleteTranscriptTurn(turn)).toBe(true);
  });

  it("returns false when tokensOut > 0 even with model null (defensive: data inconsistency)", () => {
    const turn = makeTurn({
      promptText: "edge case",
      model: null,
      assistantText: "",
      tokensOut: 50,
    });
    expect(isIncompleteTranscriptTurn(turn)).toBe(false);
  });
});

describe("parseTranscriptFile integration — mid-flight transcript", () => {
  function makeUserLine(sessionId: string, text: string, ts: string): string {
    return (
      JSON.stringify({
        type: "user",
        sessionId,
        timestamp: ts,
        message: { content: [{ type: "text", text }] },
      }) + "\n"
    );
  }

  function makeAssistantLine(
    sessionId: string,
    model: string,
    inputTokens: number,
    outputTokens: number,
    ts: string,
    assistantText: string
  ): string {
    return (
      JSON.stringify({
        type: "assistant",
        sessionId,
        timestamp: ts,
        message: {
          model,
          usage: { input_tokens: inputTokens, output_tokens: outputTokens },
          content: [{ type: "text", text: assistantText }],
        },
      }) + "\n"
    );
  }

  it("returns zero turns when the JSONL has only a user line (assistant hasn't written yet)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "claude-incomplete-"));
    const filePath = join(dir, "session-A.jsonl");
    writeFileSync(filePath, makeUserLine("session-A", "first verify claude code has no regression", "2026-06-09T17:00:00.000Z"));

    const turns = await parseTranscriptFile(filePath);
    expect(turns).toHaveLength(0);
  });

  it("returns one complete turn after the assistant line is appended (next sync picks it up)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "claude-incomplete-"));
    const filePath = join(dir, "session-B.jsonl");
    writeFileSync(filePath, makeUserLine("session-B", "done", "2026-06-09T17:00:00.000Z"));

    let turns = await parseTranscriptFile(filePath);
    expect(turns).toHaveLength(0);

    appendFileSync(
      filePath,
      makeAssistantLine("session-B", "claude-opus-4-7", 1, 510, "2026-06-09T17:00:05.000Z", "OK.")
    );

    turns = await parseTranscriptFile(filePath);
    expect(turns).toHaveLength(1);
    expect(turns[0].model).toBe("claude-opus-4-7");
    expect(turns[0].tokensOut).toBe(510);
    expect(turns[0].assistantText).toBe("OK.");
  });
});
