/**
 * model-indicator.ts — PreToolUse hook for Claude Code
 *
 * Fires before every Agent tool call and prints a colored model indicator
 * directly in the Claude Code execution steps, making model switches visible.
 *
 *   red    ⚑  OPUS ADVISOR      — model: opus
 *   orange ⚑  SONNET EXECUTOR   — model: sonnet (or unspecified)
 *   green  ⚑  HAIKU EXECUTOR    — model: haiku
 *
 * Input (stdin): { tool_name: "Agent", tool_input: { model?: string, ... } }
 * Runtime: Node.js 22+ with --experimental-strip-types (no dependencies).
 */

const RED    = "\x1b[1;31m";
const ORANGE = "\x1b[1;33m";
const GREEN  = "\x1b[1;32m";
const DIM    = "\x1b[2;37m";
const X      = "\x1b[0m";

const MODELS: Record<string, { color: string; label: string }> = {
  opus:   { color: RED,    label: "OPUS ADVISOR"    },
  sonnet: { color: ORANGE, label: "SONNET EXECUTOR" },
  haiku:  { color: GREEN,  label: "HAIKU EXECUTOR"  },
};

async function main(): Promise<void> {
  let model = "sonnet";

  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin as AsyncIterable<Buffer>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    }
    const raw = Buffer.concat(chunks).toString("utf8").trim();
    if (raw) {
      try {
        const payload = JSON.parse(raw) as {
          tool_input?: { model?: string; description?: string };
        };
        model = payload?.tool_input?.model ?? "sonnet";
      } catch { /* fall through */ }
    }
  }

  // Normalize: strip version suffixes (e.g. "claude-opus-4-6" → "opus")
  const key = model.includes("opus")
    ? "opus"
    : model.includes("haiku")
    ? "haiku"
    : "sonnet";

  const { color, label } = MODELS[key];

  process.stderr.write("\n");
  process.stderr.write(`${color}⚑  ${label}${X}\n`);
  process.stderr.write("\n");
}

main().catch(() => process.exit(0));
