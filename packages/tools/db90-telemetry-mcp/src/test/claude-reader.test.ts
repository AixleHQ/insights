import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { parseTranscriptFile, mapTranscriptTurn } from "../readers/claude.js";
import { DEFAULT_PRICING } from "../pricing.js";

describe("Claude transcript reader", () => {
  it("splits a Claude transcript into individual turns with text", async () => {
    const dir = mkdtempSync(join(tmpdir(), "db90-claude-reader-"));
    mkdirSync(join(dir, "proj"), { recursive: true });
    const filePath = join(dir, "proj", "session.jsonl");

    const lines = [
      JSON.stringify({
        type: "user",
        sessionId: "claude-session-1",
        timestamp: "2026-05-21T09:00:00.000Z",
        message: { content: [{ type: "text", text: "First question" }] },
      }),
      JSON.stringify({
        type: "assistant",
        sessionId: "claude-session-1",
        timestamp: "2026-05-21T09:00:05.000Z",
        message: {
          model: "claude-sonnet-4-6",
          usage: { input_tokens: 10, output_tokens: 4 },
          content: [{ type: "text", text: "First answer" }],
        },
      }),
      JSON.stringify({
        type: "user",
        sessionId: "claude-session-1",
        timestamp: "2026-05-21T09:01:00.000Z",
        message: { content: [{ type: "text", text: "Second question" }] },
      }),
      JSON.stringify({
        type: "assistant",
        sessionId: "claude-session-1",
        timestamp: "2026-05-21T09:01:05.000Z",
        message: {
          model: "claude-sonnet-4-6",
          usage: { input_tokens: 11, output_tokens: 5, cache_read_input_tokens: 3 },
          content: [{ type: "text", text: "Second answer" }],
        },
      }),
    ].join("\n");

    writeFileSync(filePath, `${lines}\n`, "utf-8");

    const turns = await parseTranscriptFile(filePath);

    expect(turns).toHaveLength(2);
    expect(turns[0]).toMatchObject({
      sessionId: "claude-session-1",
      turnId: "claude-session-1:1",
      promptText: "First question",
      assistantText: "First answer",
      tokensIn: 10,
      tokensOut: 4,
    });
    expect(turns[1]).toMatchObject({
      sessionId: "claude-session-1",
      turnId: "claude-session-1:2",
      promptText: "Second question",
      assistantText: "Second answer",
      tokensIn: 14,
      tokensOut: 5,
      cacheReadTokens: 3,
    });
  });

  it("maps a Claude transcript turn into a scannable payload with prompt text", () => {
    const payload = mapTranscriptTurn(
      {
        sessionId: "claude-session-1",
        turnId: "claude-session-1:2",
        filePath: "/tmp/session.jsonl",
        fileSize: 123,
        model: "claude-sonnet-4-6",
        tokensIn: 14,
        tokensOut: 5,
        cacheWriteTokens: 0,
        cacheReadTokens: 3,
        occurredAt: "2026-05-21T09:01:05.000Z",
        promptText: "Second question",
        assistantText: "Second answer",
        riskLevel: "low",
        riskScore: 0,
        riskCategories: [],
      },
      { pricing: DEFAULT_PRICING }
    );

    expect(payload).toMatchObject({
      tool_name: "claude_code",
      event_type: "chat",
      model: "claude-sonnet-4-6",
      metadata: {
        session_id: "claude-session-1:2",
        claude_session_id: "claude-session-1",
        transcript_source: "claude_jsonl",
        prompt_text: "Second question",
        assistant_text: "Second answer",
        scannable: true,
      },
    });
  });

  it("keeps tool_result follow-ups attached to the last real prompt via promptId", async () => {
    const dir = mkdtempSync(join(tmpdir(), "db90-claude-reader-followup-"));
    mkdirSync(join(dir, "proj"), { recursive: true });
    const filePath = join(dir, "proj", "session.jsonl");

    const lines = [
      JSON.stringify({
        type: "user",
        promptId: "prompt-1",
        sessionId: "claude-session-2",
        timestamp: "2026-05-21T10:00:00.000Z",
        message: { content: [{ type: "text", text: "Please update this service" }] },
      }),
      JSON.stringify({
        type: "assistant",
        sessionId: "claude-session-2",
        timestamp: "2026-05-21T10:00:02.000Z",
        message: {
          model: "claude-sonnet-4-6",
          usage: { input_tokens: 2, output_tokens: 20 },
          content: [{ type: "tool_use", name: "Read", input: { file_path: "/tmp/demo.rb" } }],
        },
      }),
      JSON.stringify({
        type: "user",
        promptId: "prompt-1",
        sessionId: "claude-session-2",
        timestamp: "2026-05-21T10:00:03.000Z",
        message: { content: [{ type: "tool_result", content: "file contents here" }] },
      }),
      JSON.stringify({
        type: "assistant",
        sessionId: "claude-session-2",
        timestamp: "2026-05-21T10:00:04.000Z",
        message: {
          model: "claude-sonnet-4-6",
          usage: { input_tokens: 1, output_tokens: 12 },
          content: [{ type: "text", text: "Now we should add a test." }],
        },
      }),
    ].join("\n");

    writeFileSync(filePath, `${lines}\n`, "utf-8");

    const turns = await parseTranscriptFile(filePath);

    expect(turns).toHaveLength(1);
    expect(turns[0]).toMatchObject({
      sessionId: "claude-session-2",
      turnId: "claude-session-2:1",
      promptId: "prompt-1",
      promptText: "Please update this service",
      assistantText: "Now we should add a test.",
      tokensIn: 3,
      tokensOut: 32,
    });
  });
});
