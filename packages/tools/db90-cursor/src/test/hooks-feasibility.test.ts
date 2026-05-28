import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  analyzeHookEvent,
  analyzeHookFeasibility,
  buildUserHooksConfig,
  hooksConfigUsesLogger,
  readHookLogEvents,
} from "../hooks-feasibility.js";

describe("analyzeHookEvent", () => {
  it("passes when conversation_id, model, workspace_roots are populated", () => {
    const result = analyzeHookEvent({
      hook_event_name: "postToolUse",
      conversation_id: "cmp-abc",
      model: "claude-sonnet-4-20250514",
      workspace_roots: ["/Users/x/proj"],
    });
    expect(result.passes_required_fields).toBe(true);
  });

  it("fails when model is empty", () => {
    const result = analyzeHookEvent({
      conversation_id: "cmp-abc",
      model: "",
      workspace_roots: ["/proj"],
    });
    expect(result.passes_required_fields).toBe(false);
  });
});

describe("analyzeHookFeasibility", () => {
  it("reads NDJSON log and verifies required fields", () => {
    const root = mkdtempSync(join(tmpdir(), "db90-v13-"));
    const logPath = join(root, "hooks.ndjson");
    const loggerPath = join(root, "log-hook-event.mjs");

    writeFileSync(
      logPath,
      [
        JSON.stringify({
          captured_at: "2026-05-27T00:00:00.000Z",
          hook_event_name: "postToolUse",
          conversation_id: "uuid-1",
          model: "auto",
          workspace_roots: ["~/db90-rails"],
          tool_name: "Shell",
        }),
        JSON.stringify({
          captured_at: "2026-05-27T00:01:00.000Z",
          hook_event_name: "sessionEnd",
          conversation_id: "uuid-1",
          model: "claude-sonnet-4",
          workspace_roots: ["~/db90-rails"],
          reason: "completed",
        }),
      ].join("\n") + "\n"
    );

    const report = analyzeHookFeasibility({ logPath, loggerPath });
    expect(report.required_fields_verified).toBe(true);
    expect(report.post_tool_use_events).toBe(1);
    expect(report.session_end_events).toBe(1);
  });
});

describe("hooksConfigUsesLogger", () => {
  it("detects logger command in hooks.json", () => {
    const logger = "/tmp/log-hook-event.mjs";
    const config = buildUserHooksConfig(logger);
    expect(hooksConfigUsesLogger(config, logger)).toBe(true);
  });
});

describe("readHookLogEvents", () => {
  it("skips blank lines", () => {
    const root = mkdtempSync(join(tmpdir(), "db90-v13-read-"));
    const logPath = join(root, "hooks.ndjson");
    writeFileSync(logPath, '\n{"hook_event_name":"sessionEnd"}\n\n');
    expect(readHookLogEvents(logPath)).toHaveLength(1);
  });
});
