import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  parseTranscriptFile,
  mapTranscriptTurn,
  isClaudeNoiseTranscriptTurn,
  isClaudeLocalCommandNoisePrompt,
  classifyToolUse,
  summarizeToolUse,
  scrubBashCommand,
} from "../readers/claude.js";
import { DEFAULT_PRICING } from "../pricing.js";

describe("Claude transcript reader", () => {
  it("splits a Claude transcript into individual turns with text", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aixle-claude-reader-"));
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
    const [payload] = mapTranscriptTurn(
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
        toolUses: [],
        navToolCalls: 0,
        totalToolCalls: 0,
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

  it.each([
    {
      name: "edit",
      block: { type: "tool_use", id: "write-1", name: "Write", input: { file_path: "/tmp/demo.rb" } },
      expectedEventType: "edit",
    },
    {
      name: "commit",
      block: { type: "tool_use", id: "commit-1", name: "Bash", input: { command: "git commit -m test" } },
      expectedEventType: "commit",
    },
    {
      name: "test",
      block: { type: "tool_use", id: "test-1", name: "Bash", input: { command: "npx vitest run" } },
      expectedEventType: "test",
    },
  ])("collects a $name tool use and maps a derivative payload", async ({ block, expectedEventType }) => {
    const dir = mkdtempSync(join(tmpdir(), "aixle-claude-tool-use-"));
    const filePath = join(dir, "session.jsonl");
    const lines = [
      JSON.stringify({
        type: "user",
        sessionId: "claude-session-tools",
        timestamp: "2026-05-21T09:00:00.000Z",
        message: { content: [{ type: "text", text: "Make a change" }] },
      }),
      JSON.stringify({
        type: "assistant",
        sessionId: "claude-session-tools",
        timestamp: "2026-05-21T09:00:05.000Z",
        message: {
          model: "claude-sonnet-4-6",
          usage: { input_tokens: 10, output_tokens: 4 },
          content: [block],
        },
      }),
    ].join("\n");
    writeFileSync(filePath, `${lines}\n`, "utf-8");

    const [turn] = await parseTranscriptFile(filePath);
    expect(turn?.toolUses).toMatchObject([{ id: block.id, eventType: expectedEventType }]);
    expect(mapTranscriptTurn(turn!)).toMatchObject([
      { event_type: "chat" },
      { event_type: expectedEventType },
    ]);
  });

  it("maps non-navigation tools in encounter order and counts navigation tools on the chat", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aixle-claude-multi-tool-"));
    const filePath = join(dir, "session.jsonl");
    const lines = [
      JSON.stringify({
        type: "user",
        sessionId: "claude-session-multi",
        timestamp: "2026-05-21T09:00:00.000Z",
        message: { content: [{ type: "text", text: "Update and commit" }] },
      }),
      JSON.stringify({
        type: "assistant",
        sessionId: "claude-session-multi",
        timestamp: "2026-05-21T09:00:05.000Z",
        message: {
          model: "claude-sonnet-4-6",
          usage: { input_tokens: 10, output_tokens: 4 },
          content: [
            { type: "tool_use", id: "edit-1", name: "Edit", input: { file_path: "/tmp/demo.rb" } },
            { type: "tool_use", id: "commit-1", name: "Bash", input: { command: "git commit -m test" } },
            { type: "tool_use", id: "read-1", name: "Read", input: { file_path: "/tmp/demo.rb" } },
          ],
        },
      }),
    ].join("\n");
    writeFileSync(filePath, `${lines}\n`, "utf-8");

    const [turn] = await parseTranscriptFile(filePath);
    expect(turn).toMatchObject({
      navToolCalls: 1,
      totalToolCalls: 3,
      toolUses: [
        { id: "edit-1", eventType: "edit" },
        { id: "commit-1", eventType: "commit" },
      ],
    });
    expect(mapTranscriptTurn(turn!).map((payload) => payload.event_type)).toEqual(["chat", "edit", "commit"]);
    expect(mapTranscriptTurn(turn!)[0]?.metadata).toMatchObject({
      nav_tool_calls: 1,
      total_tool_calls: 3,
    });
  });

  it("keeps tool_result follow-ups attached to the last real prompt via promptId", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aixle-claude-reader-followup-"));
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
      toolUses: [],
      navToolCalls: 1,
      totalToolCalls: 1,
    });
  });

  it("does not emit turns for local-command noise prompts", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aixle-claude-noise-"));
    mkdirSync(join(dir, "proj"), { recursive: true });
    const filePath = join(dir, "proj", "noise.jsonl");
    const sessionId = "5e606fb4-18dd-44be-903e-f6df65455cc3";

    const lines = [
      JSON.stringify({
        type: "user",
        sessionId,
        timestamp: "2026-05-21T12:00:00.000Z",
        message: {
          content: [
            {
              type: "text",
              text: "<local-command-caveat>Caveat: The messages below were generated by the user while running local commands.</local-command-caveat>",
            },
          ],
        },
      }),
      JSON.stringify({
        type: "user",
        sessionId,
        timestamp: "2026-05-21T12:01:00.000Z",
        message: {
          content: [
            {
              type: "text",
              text: "<command-name>/exit</command-name>\n<command-message>exit</command-message>\n<command-args></command-args>",
            },
          ],
        },
      }),
      JSON.stringify({
        type: "user",
        sessionId,
        timestamp: "2026-05-21T12:02:00.000Z",
        message: {
          content: [{ type: "text", text: "<local-command-stdout>Bye!</local-command-stdout>" }],
        },
      }),
    ].join("\n");

    writeFileSync(filePath, `${lines}\n`, "utf-8");
    const turns = await parseTranscriptFile(filePath);
    expect(turns).toHaveLength(0);
  });

  it("skips isMeta user lines and keeps a normal turn in the same file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aixle-claude-meta-"));
    mkdirSync(join(dir, "proj"), { recursive: true });
    const filePath = join(dir, "proj", "mixed.jsonl");
    const sessionId = "meta-session-1";

    const lines = [
      JSON.stringify({
        type: "user",
        sessionId,
        isMeta: true,
        timestamp: "2026-05-21T12:00:00.000Z",
        message: { content: [{ type: "text", text: "System injected meta prompt" }] },
      }),
      JSON.stringify({
        type: "user",
        sessionId,
        timestamp: "2026-05-21T12:01:00.000Z",
        message: { content: [{ type: "text", text: "Real user question" }] },
      }),
      JSON.stringify({
        type: "assistant",
        sessionId,
        timestamp: "2026-05-21T12:01:05.000Z",
        message: {
          model: "claude-sonnet-4-6",
          usage: { input_tokens: 5, output_tokens: 2 },
          content: [{ type: "text", text: "Real answer" }],
        },
      }),
    ].join("\n");

    writeFileSync(filePath, `${lines}\n`, "utf-8");
    const turns = await parseTranscriptFile(filePath);
    expect(turns).toHaveLength(1);
    expect(turns[0]?.promptText).toBe("Real user question");
  });

  it("keeps turns with real token usage even when prompt contains angle brackets", async () => {
    const turn = {
      sessionId: "s1",
      turnId: "s1:1",
      filePath: "/tmp/t.jsonl",
      fileSize: 1,
      model: "claude-sonnet-4-6",
      tokensIn: 100,
      tokensOut: 50,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      occurredAt: "2026-05-21T12:00:00.000Z",
      promptText: "Explain <foo> in the codebase",
      assistantText: "Done",
      riskLevel: "low" as const,
      riskScore: 0,
      riskCategories: [] as string[],
      toolUses: [],
      navToolCalls: 0,
      totalToolCalls: 0,
    };
    expect(isClaudeNoiseTranscriptTurn(turn)).toBe(false);
    expect(isClaudeLocalCommandNoisePrompt(turn.promptText)).toBe(false);
  });
});

describe("classifyToolUse", () => {
  it("maps Edit/Write/MultiEdit/NotebookEdit to edit", () => {
    for (const name of ["Edit", "Write", "MultiEdit", "NotebookEdit"]) {
      expect(classifyToolUse({ name })).toBe("edit");
    }
  });

  it("maps Bash git commit to commit", () => {
    expect(classifyToolUse({ name: "Bash", input: { command: "git commit -m 'x'" } })).toBe("commit");
    expect(classifyToolUse({ name: "Bash", input: { command: "git commit --amend" } })).toBe("commit");
    expect(classifyToolUse({ name: "Bash", input: { command: "git commit" } })).toBe("commit");
  });

  it("does not treat git commit-tree as a commit", () => {
    expect(classifyToolUse({ name: "Bash", input: { command: "git commit-tree abc" } })).toBe("tool_use");
  });

  it("maps Bash test runners to test", () => {
    expect(classifyToolUse({ name: "Bash", input: { command: "bundle exec rspec spec/foo_spec.rb" } })).toBe("test");
    expect(classifyToolUse({ name: "Bash", input: { command: "npx vitest run" } })).toBe("test");
  });

  it("drops Read/Grep/Glob/LS", () => {
    for (const name of ["Read", "Grep", "Glob", "LS"]) {
      expect(classifyToolUse({ name })).toBeNull();
    }
  });

  it("maps other tools to tool_use", () => {
    expect(classifyToolUse({ name: "Task", input: { subagent_type: "Explore" } })).toBe("tool_use");
    expect(classifyToolUse({ name: "Bash", input: { command: "ls -la" } })).toBe("tool_use");
  });
});

describe("summarizeToolUse", () => {
  it("uses file_path for edits and truncates to 256", () => {
    const s = summarizeToolUse({ name: "Edit", input: { file_path: "/a/b.rb" } });
    expect(s).toContain("/a/b.rb");
    expect(s.length).toBeLessThanOrEqual(256);
  });

  it("summarizes Bash command without exceeding 256", () => {
    const s = summarizeToolUse({ name: "Bash", input: { command: "git commit -m " + "x".repeat(400) } });
    expect(s.startsWith("Bash:")).toBe(true);
    expect(s.length).toBeLessThanOrEqual(256);
  });

  it("redacts credentials in Bash command summaries before egress", () => {
    const s = summarizeToolUse({
      name: "Bash",
      input: { command: "curl -H 'Authorization: Bearer secret-token-xyz' https://api.example.com" },
    });
    expect(s).not.toContain("secret-token-xyz");
    expect(s).toContain("[REDACTED]");
  });
});

describe("scrubBashCommand", () => {
  it("redacts Authorization Bearer header", () => {
    const out = scrubBashCommand("curl -H 'Authorization: Bearer sk-abc123' https://api.example.com");
    expect(out).not.toContain("sk-abc123");
    expect(out).toContain("Bearer [REDACTED]");
  });

  it("redacts Authorization Basic header", () => {
    const out = scrubBashCommand("curl -H 'Authorization: Basic dXNlcjpwYXNz'");
    expect(out).not.toContain("dXNlcjpwYXNz");
    expect(out).toContain("Basic [REDACTED]");
  });

  it("redacts inline env-var secret assignments", () => {
    expect(scrubBashCommand("AWS_SECRET_ACCESS_KEY=s3cr3t aws s3 ls")).not.toContain("s3cr3t");
    expect(scrubBashCommand("GITHUB_TOKEN=ghp_abc123 gh pr create")).not.toContain("ghp_abc123");
    expect(scrubBashCommand("DB_PASSWORD=hunter2 rails db:migrate")).not.toContain("hunter2");
    expect(scrubBashCommand("db_password=hunter2 rails db:migrate")).not.toContain("hunter2");
    expect(scrubBashCommand("api_key=xyz npm publish")).not.toContain("xyz");
    expect(scrubBashCommand("FOO_KEY=bar cmd")).not.toContain("bar");
  });

  it("does not redact benign env assignments that merely contain key/pass letters", () => {
    expect(scrubBashCommand("monkey=1 echo hi")).toBe("monkey=1 echo hi");
    expect(scrubBashCommand("keyboard=layout setxkbmap")).toBe("keyboard=layout setxkbmap");
    expect(scrubBashCommand("path=/tmp/foo cmd")).toBe("path=/tmp/foo cmd");
  });

  it("redacts --password= and --token= flags", () => {
    expect(scrubBashCommand("some-cli --password=supersecret --user=alice")).not.toContain("supersecret");
    expect(scrubBashCommand("tool --token=tok_live_xyz")).not.toContain("tok_live_xyz");
    expect(scrubBashCommand("tool --api-key=key-123")).not.toContain("key-123");
  });

  it("redacts space-separated secret flags (--flag value)", () => {
    expect(scrubBashCommand("tool --token hunter2")).not.toContain("hunter2");
    expect(scrubBashCommand("some-cli --password supersecret --user alice")).not.toContain("supersecret");
    expect(scrubBashCommand("tool --api-key key-123")).not.toContain("key-123");
    expect(scrubBashCommand("tool --client-secret shhh")).not.toContain("shhh");
  });

  it("redacts quoted secret-flag values including spaces inside quotes", () => {
    expect(scrubBashCommand('tool --token="secret value"')).not.toContain("secret value");
    expect(scrubBashCommand("tool --token 'secret value'")).not.toContain("secret value");
    expect(scrubBashCommand('tool --password="a b c"')).not.toContain("a b c");
  });

  it("redacts quoted env-var secret assignments including spaces inside quotes", () => {
    expect(scrubBashCommand('TOKEN="secret value" cmd')).not.toContain("secret value");
    expect(scrubBashCommand("DB_PASSWORD='hunter 2' rails db:migrate")).not.toContain("hunter 2");
  });

  it("redacts --profile flag (customer identifier)", () => {
    const out = scrubBashCommand("aws s3 sync s3://bucket/ . --profile customer-prod");
    expect(out).not.toContain("customer-prod");
    expect(out).toContain("--profile [REDACTED]");
  });

  it("redacts --secret-access-key and --access-key-id flags", () => {
    expect(scrubBashCommand("aws configure --secret-access-key AKIAXYZ")).not.toContain("AKIAXYZ");
    expect(scrubBashCommand("aws configure --access-key-id AKIA123")).not.toContain("AKIA123");
  });

  it("redacts curl | sh / curl | bash patterns", () => {
    const out = scrubBashCommand("curl https://install.example.com/script.sh | sh");
    expect(out).toContain("[SHELL REDACTED]");
    expect(out).not.toContain("| sh");
  });

  it("leaves safe commands unchanged", () => {
    expect(scrubBashCommand("git commit -m 'fix typo'")).toBe("git commit -m 'fix typo'");
    expect(scrubBashCommand("bundle exec rspec spec/")).toBe("bundle exec rspec spec/");
    expect(scrubBashCommand("npm run build")).toBe("npm run build");
  });

  it("handles multiple secrets in the same command", () => {
    const cmd = "AWS_SECRET_ACCESS_KEY=abc123 curl -H 'Authorization: Bearer bearer-secret' --token=tok-secret https://x.com";
    const out = scrubBashCommand(cmd);
    expect(out).not.toContain("abc123");
    expect(out).not.toContain("bearer-secret");
    expect(out).not.toContain("tok-secret");
  });
});
