/**
 * model-indicator.ts — PreToolUse hook + direct banner printer
 *
 * Two usage modes:
 *
 * 1. Hook mode (Claude Code PreToolUse on Agent):
 *    Reads tool_input.model from stdin JSON and prints banner to stderr.
 *    Registered in settings.json — fires automatically before every Agent spawn.
 *
 * 2. Direct mode (called explicitly from commands via Bash):
 *    node --experimental-strip-types --no-warnings model-indicator.ts opus
 *    Reads model from argv[2] and prints banner to stdout (visible in execution steps).
 *
 * Use direct mode in commands where the Opus escalation step should be visible:
 *    node --experimental-strip-types --no-warnings ${CLAUDE_PROJECT_DIR}/.claude/hooks/model-indicator.ts opus
 *
 *   red    ⚑  OPUS ADVISOR      — model: opus
 *   orange ⚑  SONNET EXECUTOR   — model: sonnet (or unspecified)
 *   green  ⚑  HAIKU EXECUTOR    — model: haiku
 *
 * Runtime: Node.js 22+ with --experimental-strip-types (no dependencies).
 */

// Model → color mapping (single source of truth)
// opus = red, sonnet = yellow, haiku = green
const BOLD_RED    = "\x1b[1;31m";
const BOLD_YELLOW = "\x1b[1;33m";
const BOLD_GREEN  = "\x1b[1;32m";
const DIM_RED     = "\x1b[2;31m";
const DIM_YELLOW  = "\x1b[2;33m";
const DIM_GREEN   = "\x1b[2;32m";
const X           = "\x1b[0m";

const MODELS: Record<string, { bold: string; dim: string; label: string; detail: string }> = {
  opus:   { bold: BOLD_RED,    dim: DIM_RED,    label: "OPUS ADVISOR",    detail: "advisor escalation · risk HIGH/CRITICAL or hard flag" },
  sonnet: { bold: BOLD_YELLOW, dim: DIM_YELLOW, label: "SONNET EXECUTOR", detail: "standard executor"  },
  haiku:  { bold: BOLD_GREEN,  dim: DIM_GREEN,  label: "HAIKU EXECUTOR",  detail: "lightweight task"   },
};

function normalize(raw: string): string {
  if (raw.includes("opus"))  return "opus";
  if (raw.includes("haiku")) return "haiku";
  return "sonnet";
}

function printBanner(model: string, toStdout: boolean): void {
  const key = normalize(model);
  const { bold, dim, label, detail } = MODELS[key];
  const out = toStdout ? process.stdout : process.stderr;
  out.write("\n");
  out.write(`${bold}⚑  ${label}${X}\n`);
  out.write(`${dim}   ${detail}${X}\n`);
  out.write("\n");
}

async function main(): Promise<void> {
  // Direct mode: argv[2] provided — called explicitly from a command/script
  if (process.argv[2]) {
    printBanner(process.argv[2], true /* stdout — visible in execution steps */);
    return;
  }

  // Hook mode: read stdin JSON payload from Claude Code PreToolUse event
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
          tool_input?: { model?: string };
        };
        model = payload?.tool_input?.model ?? "sonnet";
      } catch { /* fall through */ }
    }
  }

  printBanner(model, false /* stderr — hook output path */);
}

main().catch(() => process.exit(0));
