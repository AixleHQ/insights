import { describe, it, expect } from "vitest";
import { CANONICAL_TOOL_NAMES } from "./eventsToolFilters";
import { hasCuratedToolLabel } from "./utils";

/**
 * AIX-627 guards: the Events filter/label surface must cover every tool the
 * backend can emit. These are within-web tripwires (label drift + a hardcoded
 * expected list). Cross-package drift — a tool added to `ToolEvent::TOOL_NAMES`
 * without updating web — is caught separately by the CI gate
 * `.claude/scripts/tool-enum-parity.ts`.
 */
describe("CANONICAL_TOOL_NAMES", () => {
  // Mirror of ToolEvent::TOOL_NAMES (packages/api/app/models/tool_event.rb).
  // Update both together when the backend enum changes.
  const EXPECTED_TOOL_NAMES = [
    "claude_code",
    "cursor",
    "windsurf",
    "github_copilot",
    "aider",
    "continue",
    "cody",
    "tabnine",
    "amazon_q",
    "openrouter_api",
    "anthropic_api",
    "openai_api",
    "gemini_api",
    "custom",
    "jira",
    "linear",
    "github",
    "gitlab",
    "bitbucket",
  ];

  it("matches the backend ToolEvent::TOOL_NAMES enum exactly", () => {
    expect([...CANONICAL_TOOL_NAMES]).toEqual(EXPECTED_TOOL_NAMES);
  });

  it("has a curated display label for every canonical tool", () => {
    const missing = CANONICAL_TOOL_NAMES.filter((slug) => !hasCuratedToolLabel(slug));
    expect(missing).toEqual([]);
  });
});
