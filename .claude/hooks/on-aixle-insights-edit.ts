/**
 * on-aixle-insights-edit.ts — PostToolUse hook for Claude Code
 *
 * Auto-suggests `/aixle:reset` whenever a file under
 * `packages/tools/aixle-insights/**` is edited or created. The reset itself is
 * NOT auto-executed — running `npm run build` + restarting the MCP on every
 * keystroke-equivalent would be disruptive during active development. The hook
 * just nudges Claude (and the developer reading the transcript) to invoke the
 * skill when they're ready to test their changes end-to-end.
 *
 * Behaviour:
 *   - No-op for any file outside `packages/tools/aixle-insights/**`.
 *   - No-op for `**\/test/**`, `**\/*.md`, and `dist/**` (test edits don't
 *     change the running MCP; doc edits don't either; dist edits ARE the build
 *     output, no need to suggest a rebuild).
 *   - Exit 0 always. The hook is advisory, never a blocker.
 *
 * Cross-platform: Node.js only.
 *
 * Stdin payload (Claude Code feeds JSON):
 * {
 *   tool_name: "Edit" | "Write" | "MultiEdit",
 *   tool_input: { file_path: string, ... }
 * }
 */

import path from "node:path";
import { readFileSync } from "node:fs";

const projectDir: string = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

function readStdinSync(): string {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

interface ToolPayload {
  tool_name?: string;
  tool_input?: { file_path?: string };
}

function parsePayload(raw: string): ToolPayload | null {
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw) as ToolPayload;
  } catch {
    return null;
  }
}

const AIXLE_PREFIX = path.join("packages", "tools", "aixle-insights") + path.sep;

function isReleventEdit(filePath: string): boolean {
  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(projectDir, filePath);
  const rel = path.relative(projectDir, abs);
  if (rel.startsWith("..")) return false;
  if (!rel.startsWith(AIXLE_PREFIX)) return false;

  // Skip test files (anywhere under the package), doc files, and dist output.
  const tail = rel.slice(AIXLE_PREFIX.length);
  if (tail.startsWith(`dist${path.sep}`)) return false;
  if (tail.endsWith(".md")) return false;
  const segments = tail.split(path.sep);
  if (segments.includes("test") || segments.includes("__tests__")) return false;
  if (tail.endsWith(".test.ts") || tail.endsWith(".test.tsx") || tail.endsWith(".spec.ts")) return false;

  return true;
}

function printBanner(rel: string): void {
  const BOLD_CYAN = "\x1b[1;36m";
  const DIM       = "\x1b[2m";
  const X         = "\x1b[0m";
  process.stderr.write("\n");
  process.stderr.write(`${BOLD_CYAN}↻  AIXLE-INSIGHTS EDIT DETECTED${X}\n`);
  process.stderr.write(`${DIM}   file: ${rel}${X}\n`);
  process.stderr.write(`${DIM}   Your local MCP may now be running stale code or stale config.${X}\n`);
  process.stderr.write(`${DIM}   Before testing telemetry end-to-end, invoke the ${BOLD_CYAN}/aixle-reset${X}${DIM} skill${X}\n`);
  process.stderr.write(`${DIM}   (rebuilds dist, restarts MCP from repo root, repairs ~/.claude.json + ~/.cursor/mcp.json).${X}\n`);
  process.stderr.write("\n");
}

function main(): void {
  const payload = parsePayload(readStdinSync());
  const filePath = payload?.tool_input?.file_path;
  if (!filePath) return;

  if (!isReleventEdit(filePath)) return;

  const rel = path.relative(projectDir, path.resolve(projectDir, filePath));
  printBanner(rel);
}

main();
