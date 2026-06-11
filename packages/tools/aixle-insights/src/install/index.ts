import {
  installClaudeUserMcp,
  type InstallClaudeUserMcpOptions,
  type InstallResult,
} from "./claude.js";

export type SupportedEditor = "claude";

export type { InstallClaudeUserMcpOptions, InstallResult };

/**
 * Editor dispatch for MCP install hooks. Only Claude Code is supported in this story.
 */
export function installEditorMcp(
  editor: SupportedEditor,
  options: InstallClaudeUserMcpOptions = {}
): InstallResult {
  if (editor === "claude") {
    return installClaudeUserMcp(options);
  }
  return { kind: "error", message: `Unsupported editor for MCP install: ${String(editor)}` };
}

export {
  installClaudeUserMcp,
  defaultClaudeUserConfigPath,
  desiredAixleInsightsEntry,
  aixleInsightsEntryMatchesDesired,
} from "./claude.js";
