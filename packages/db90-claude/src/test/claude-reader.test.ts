import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { findTranscriptFiles, parseTranscriptFile, toDb90Payload } from "../claude-reader.js";
import { type PricingTable } from "../pricing.js";

const TEST_PRICING: PricingTable = {
  "claude-opus-4-5": {
    input_per_mtok: 15.0,
    output_per_mtok: 75.0,
    cache_write_per_mtok: 18.75,
    cache_read_per_mtok: 1.5,
  },
};

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), "db90-claude-reader-test-"));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("findTranscriptFiles", () => {
  it("returns empty array when directories do not exist", () => {
    const files = findTranscriptFiles([join(testDir, "nonexistent")]);
    expect(files).toEqual([]);
  });

  it("finds .jsonl files in nested directories", () => {
    const projectDir = join(testDir, "project-abc");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, "session1.jsonl"), "", "utf-8");
    writeFileSync(join(projectDir, "session2.jsonl"), "", "utf-8");

    const files = findTranscriptFiles([testDir]);
    expect(files).toHaveLength(2);
    expect(files.every((f) => f.endsWith(".jsonl"))).toBe(true);
  });

  it("deduplicates files across base dirs", () => {
    const projectDir = join(testDir, "project-abc");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, "session1.jsonl"), "", "utf-8");

    // Same dir listed twice
    const files = findTranscriptFiles([testDir, testDir]);
    expect(files).toHaveLength(1);
  });
});

describe("parseTranscriptFile", () => {
  it("returns empty map for empty file", async () => {
    const filePath = join(testDir, "empty.jsonl");
    writeFileSync(filePath, "", "utf-8");
    const result = await parseTranscriptFile(filePath);
    expect(result.size).toBe(0);
  });

  it("ignores lines that are neither assistant nor user (system, tool_result, etc.)", async () => {
    const filePath = join(testDir, "session.jsonl");
    const systemLine = { type: "system", sessionId: "sess1", timestamp: "2024-01-01T00:00:00Z", message: { role: "system" } };
    const toolResultLine = { type: "tool_result", sessionId: "sess1", timestamp: "2024-01-01T00:00:00Z", message: { role: "tool" } };
    writeFileSync(filePath, JSON.stringify(systemLine) + "\n" + JSON.stringify(toolResultLine) + "\n", "utf-8");
    const result = await parseTranscriptFile(filePath);
    expect(result.size).toBe(0);
  });

  it("aggregates tokens from a single assistant message", async () => {
    const filePath = join(testDir, "session.jsonl");
    const line = {
      type: "assistant",
      sessionId: "sess1",
      timestamp: "2024-01-01T00:00:00.000Z",
      message: {
        model: "claude-opus-4-5",
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_creation_input_tokens: 10,
          cache_read_input_tokens: 5,
        },
      },
    };
    writeFileSync(filePath, JSON.stringify(line) + "\n", "utf-8");

    const result = await parseTranscriptFile(filePath);
    expect(result.size).toBe(1);

    const agg = result.get("sess1")!;
    // input_tokens + cache_creation + cache_read = 100 + 10 + 5 = 115
    expect(agg.tokensIn).toBe(115);
    expect(agg.tokensOut).toBe(50);
    expect(agg.cacheWriteTokens).toBe(10);
    expect(agg.cacheReadTokens).toBe(5);
    expect(agg.model).toBe("claude-opus-4-5");
    expect(agg.occurredAt).toBe("2024-01-01T00:00:00.000Z");
  });

  it("aggregates tokens across multiple messages in the same session", async () => {
    const filePath = join(testDir, "session.jsonl");
    const makeLine = (ts: string, input: number, output: number) => ({
      type: "assistant",
      sessionId: "sess1",
      timestamp: ts,
      message: {
        model: "claude-sonnet-4-6",
        usage: { input_tokens: input, output_tokens: output },
      },
    });

    writeFileSync(
      filePath,
      [
        JSON.stringify(makeLine("2024-01-01T00:00:00.000Z", 100, 50)),
        JSON.stringify(makeLine("2024-01-01T01:00:00.000Z", 200, 80)),
      ].join("\n") + "\n",
      "utf-8"
    );

    const result = await parseTranscriptFile(filePath);
    const agg = result.get("sess1")!;
    expect(agg.tokensIn).toBe(300);
    expect(agg.tokensOut).toBe(130);
    expect(agg.occurredAt).toBe("2024-01-01T01:00:00.000Z");
  });

  it("handles multiple sessions in one file", async () => {
    const filePath = join(testDir, "session.jsonl");
    const makeSession = (id: string, input: number, output: number) => ({
      type: "assistant",
      sessionId: id,
      timestamp: "2024-01-01T00:00:00.000Z",
      message: { model: "claude-opus-4-5", usage: { input_tokens: input, output_tokens: output } },
    });

    writeFileSync(
      filePath,
      [
        JSON.stringify(makeSession("sess-a", 100, 50)),
        JSON.stringify(makeSession("sess-b", 200, 80)),
      ].join("\n") + "\n",
      "utf-8"
    );

    const result = await parseTranscriptFile(filePath);
    expect(result.size).toBe(2);
    expect(result.get("sess-a")!.tokensIn).toBe(100);
    expect(result.get("sess-b")!.tokensIn).toBe(200);
  });

  it("skips bad JSON lines and continues", async () => {
    const filePath = join(testDir, "session.jsonl");
    const good = {
      type: "assistant",
      sessionId: "sess1",
      timestamp: "2024-01-01T00:00:00.000Z",
      message: { model: "claude-opus-4-5", usage: { input_tokens: 10, output_tokens: 5 } },
    };
    writeFileSync(filePath, "not valid json\n" + JSON.stringify(good) + "\n", "utf-8");

    const result = await parseTranscriptFile(filePath);
    expect(result.size).toBe(1);
  });

  it("skips assistant messages without usage", async () => {
    const filePath = join(testDir, "session.jsonl");
    const line = {
      type: "assistant",
      sessionId: "sess1",
      timestamp: "2024-01-01T00:00:00.000Z",
      message: { model: "claude-opus-4-5" }, // no usage
    };
    writeFileSync(filePath, JSON.stringify(line) + "\n", "utf-8");

    const result = await parseTranscriptFile(filePath);
    expect(result.size).toBe(0);
  });

  it("returns empty map for non-existent file", async () => {
    const result = await parseTranscriptFile(join(testDir, "missing.jsonl"));
    expect(result.size).toBe(0);
  });

  it("scans user-turn text and sets riskLevel: 'high' when GitHub token is present", async () => {
    const filePath = join(testDir, "session.jsonl");
    const githubToken = "ghp_" + "A".repeat(36);
    const userLine = {
      type: "user",
      sessionId: "sess1",
      timestamp: "2024-01-01T00:00:00.000Z",
      message: { content: `Please use token ${githubToken} for auth` },
    };
    const assistantLine = {
      type: "assistant",
      sessionId: "sess1",
      timestamp: "2024-01-01T00:01:00.000Z",
      message: { model: "claude-opus-4-5", usage: { input_tokens: 50, output_tokens: 20 } },
    };
    writeFileSync(
      filePath,
      JSON.stringify(userLine) + "\n" + JSON.stringify(assistantLine) + "\n",
      "utf-8"
    );

    const result = await parseTranscriptFile(filePath);
    const agg = result.get("sess1")!;
    expect(agg.riskLevel).toBe("high");
    expect(agg.riskCategories).toContain("secrets");
  });

  it("defaults to riskLevel: 'low' when only assistant lines are present (no user turns)", async () => {
    const filePath = join(testDir, "session.jsonl");
    const assistantLine = {
      type: "assistant",
      sessionId: "sess1",
      timestamp: "2024-01-01T00:00:00.000Z",
      message: { model: "claude-opus-4-5", usage: { input_tokens: 50, output_tokens: 20 } },
    };
    writeFileSync(filePath, JSON.stringify(assistantLine) + "\n", "utf-8");

    const result = await parseTranscriptFile(filePath);
    const agg = result.get("sess1")!;
    expect(agg.riskLevel).toBe("low");
    expect(agg.riskScore).toBe(0);
    expect(agg.riskCategories).toEqual([]);
  });

  it("scans user-turn text when content is a plain string", async () => {
    const filePath = join(testDir, "session.jsonl");
    const userLine = {
      type: "user",
      sessionId: "sess1",
      timestamp: "2024-01-01T00:00:00.000Z",
      message: { content: "my email is test@example.com" },
    };
    const assistantLine = {
      type: "assistant",
      sessionId: "sess1",
      timestamp: "2024-01-01T00:01:00.000Z",
      message: { model: "claude-opus-4-5", usage: { input_tokens: 20, output_tokens: 10 } },
    };
    writeFileSync(
      filePath,
      JSON.stringify(userLine) + "\n" + JSON.stringify(assistantLine) + "\n",
      "utf-8"
    );

    const result = await parseTranscriptFile(filePath);
    const agg = result.get("sess1")!;
    expect(agg.riskLevel).toBe("medium");
    expect(agg.riskCategories).toContain("pii_standard");
  });

  it("discards user-turn text for sessions with no assistant lines — no aggregate created", async () => {
    const filePath = join(testDir, "session.jsonl");
    const githubToken = "ghp_" + "B".repeat(36);
    const userLine = {
      type: "user",
      sessionId: "user-only-sess",
      timestamp: "2024-01-01T00:00:00.000Z",
      message: { content: `Token: ${githubToken}` },
    };
    writeFileSync(filePath, JSON.stringify(userLine) + "\n", "utf-8");

    const result = await parseTranscriptFile(filePath);
    expect(result.size).toBe(0);
  });

  it("scans user-turn text when content is a content block array", async () => {
    const filePath = join(testDir, "session.jsonl");
    const userLine = {
      type: "user",
      sessionId: "sess1",
      timestamp: "2024-01-01T00:00:00.000Z",
      message: {
        content: [
          { type: "text", text: "my SSN is 123-45-6789" },
          { type: "tool_result", content: "some tool output" },
        ],
      },
    };
    const assistantLine = {
      type: "assistant",
      sessionId: "sess1",
      timestamp: "2024-01-01T00:01:00.000Z",
      message: { model: "claude-opus-4-5", usage: { input_tokens: 20, output_tokens: 10 } },
    };
    writeFileSync(
      filePath,
      JSON.stringify(userLine) + "\n" + JSON.stringify(assistantLine) + "\n",
      "utf-8"
    );

    const result = await parseTranscriptFile(filePath);
    const agg = result.get("sess1")!;
    expect(agg.riskLevel).toBe("high");
    expect(agg.riskCategories).toContain("pii_high");
  });
});

describe("toDb90Payload", () => {
  const baseAgg = {
    sessionId: "sess-abc",
    filePath: "/path/to/file.jsonl",
    fileSize: 1234,
    model: "claude-opus-4-5",
    tokensIn: 100,
    tokensOut: 50,
    cacheWriteTokens: 10,
    cacheReadTokens: 5,
    occurredAt: "2024-01-01T00:00:00.000Z",
    riskLevel: "low" as const,
    riskScore: 0,
    riskCategories: [] as string[],
  };

  it("maps a session aggregate to the expected payload shape", () => {
    const payload = toDb90Payload(baseAgg);
    expect(payload.tool_name).toBe("claude_code");
    expect(payload.event_type).toBe("chat");
    expect(payload.model).toBe("claude-opus-4-5");
    expect(payload.tokens_in).toBe(100);
    expect(payload.tokens_out).toBe(50);
    expect(payload.tokens_total).toBe(150);
    expect(payload.cost_usd).toBeNull(); // no pricing provided
    expect(payload.occurred_at).toBe("2024-01-01T00:00:00.000Z");
    expect(payload.metadata.session_id).toBe("sess-abc");
    expect(payload.metadata.model).toBe("claude-opus-4-5");
    expect(payload.metadata.base_input_tokens).toBe(85); // 100 - 10 - 5
    expect(payload.metadata.output_tokens).toBe(50);
    expect(payload.metadata.cache_write_tokens).toBe(10);
    expect(payload.metadata.cache_read_tokens).toBe(5);
  });

  it("includes risk fields in metadata", () => {
    const agg = {
      ...baseAgg,
      riskLevel: "high" as const,
      riskScore: 3,
      riskCategories: ["secrets"],
    };
    const payload = toDb90Payload(agg);
    expect(payload.metadata.risk_level).toBe("high");
    expect(payload.metadata.risk_score).toBe(3);
    expect(payload.metadata.risk_categories).toEqual(["secrets"]);
    expect(payload.metadata.scannable).toBe(true);
  });

  it("includes risk_level: 'low' and scannable: true for clean sessions", () => {
    const payload = toDb90Payload(baseAgg);
    expect(payload.metadata.risk_level).toBe("low");
    expect(payload.metadata.risk_score).toBe(0);
    expect(payload.metadata.risk_categories).toEqual([]);
    expect(payload.metadata.scannable).toBe(true);
  });

  it("omits zero token fields", () => {
    const agg = {
      ...baseAgg,
      model: null,
      tokensIn: 0,
      tokensOut: 0,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
    };

    const payload = toDb90Payload(agg);
    expect(payload.tokens_in).toBeUndefined();
    expect(payload.tokens_out).toBeUndefined();
    expect(payload.tokens_total).toBeUndefined();
    expect(payload.model).toBeUndefined();
    expect(payload.cost_usd).toBeNull();
    expect(payload.metadata.model).toBeNull();
    expect(payload.metadata.base_input_tokens).toBe(0);
    expect(payload.metadata.output_tokens).toBe(0);
    expect(payload.metadata.cache_write_tokens).toBe(0);
    expect(payload.metadata.cache_read_tokens).toBe(0);
  });

  it("computes cost_usd when pricing is provided and model is known", () => {
    // tokensIn=115 (input=100, cache_write=10, cache_read=5)
    // baseInput = 115 - 10 - 5 = 100
    // cost = (100*15 + 50*75 + 10*18.75 + 5*1.50) / 1_000_000
    //      = (1500 + 3750 + 187.5 + 7.5) / 1_000_000
    //      = 5445 / 1_000_000 = 0.005445
    const agg = { ...baseAgg, tokensIn: 115 };
    const payload = toDb90Payload(agg, { pricing: TEST_PRICING });
    expect(payload.cost_usd).toBe(0.005445);
  });

  it("sets cost_usd to 0 when all tokens are zero but model is known", () => {
    const agg = {
      ...baseAgg,
      tokensIn: 0,
      tokensOut: 0,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
    };
    const payload = toDb90Payload(agg, { pricing: TEST_PRICING });
    expect(payload.cost_usd).toBe(0);
  });

  it("sets cost_usd to null when model is null even with pricing", () => {
    const agg = { ...baseAgg, model: null };
    const payload = toDb90Payload(agg, { pricing: TEST_PRICING });
    expect(payload.cost_usd).toBeNull();
  });

  it("sets cost_usd to null when model is unknown", () => {
    const agg = { ...baseAgg, model: "claude-unknown-model" };
    const payload = toDb90Payload(agg, { pricing: TEST_PRICING });
    expect(payload.cost_usd).toBeNull();
  });

  it("includes projectId in payload when provided via options", () => {
    const payload = toDb90Payload(baseAgg, { projectId: "proj-uuid-123" });
    expect(payload.project_id).toBe("proj-uuid-123");
  });
});
