/**
 * on-edit-lint.ts — PostToolUse hook for Claude Code
 *
 * Runs the appropriate linter on the edited file after every Edit or Write tool call.
 * Cross-platform: Windows, macOS, and Linux (Node.js only, no shell dependency).
 *
 * Runtime: Node.js 22+ with --experimental-strip-types (no external dependencies).
 * Registered in .claude/settings.json under hooks.PostToolUse (matcher: Edit|Write).
 *
 * Claude Code pipes the tool payload as JSON to stdin. Shape:
 * {
 *   tool_name: "Edit" | "Write",
 *   tool_input: { file_path: string, ... }
 * }
 */

import { spawnSync } from "node:child_process";
import path from "node:path";

const projectDir: string = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

function run(cmd: string, args: string[], cwd: string): void {
  spawnSync(cmd, args, { cwd, stdio: "inherit", shell: true });
  // Always exit 0 — lint findings are advisory; the model reads stdout and acts on them.
}

function lint(filePath: string): void {
  const ext: string = path.extname(filePath).toLowerCase();

  if (ext === ".rb") {
    run(
      "bundle",
      ["exec", "rubocop", "--parallel", "--force-exclusion", filePath],
      path.join(projectDir, "packages", "api")
    );
  } else if ([".ts", ".tsx", ".js", ".jsx"].includes(ext)) {
    run(
      "npx",
      ["eslint", filePath],
      path.join(projectDir, "packages", "web")
    );
  }
  // Other file types: no-op
}

async function getFilePath(): Promise<string | undefined> {
  // Priority 1: stdin JSON payload (Claude Code PostToolUse hook format)
  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin as AsyncIterable<Buffer>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    }
    const raw: string = Buffer.concat(chunks).toString("utf8").trim();
    if (raw) {
      try {
        const payload = JSON.parse(raw) as {
          tool_input?: { file_path?: string };
        };
        if (payload?.tool_input?.file_path) return payload.tool_input.file_path;
      } catch {
        // Not valid JSON — fall through
      }
    }
  }

  // Priority 2: command-line argument fallback
  return process.argv[2];
}

async function main(): Promise<void> {
  const filePath = await getFilePath();
  if (filePath) lint(filePath);
}

main().catch(() => {
  // Never let hook errors surface to the Claude Code session
  process.exit(0);
});
