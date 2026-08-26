import { createReadStream, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { finished } from "node:stream/promises";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { homedir } from "node:os";
import { glob } from "glob";
import type { IngestPayload } from "../lib/index.js";
import { type PricingTable, calculateCost } from "../pricing.js";
import { type RiskLevel, scanText } from "../risk-scanner.js";

/** Subset of a Claude Code JSONL assistant message usage block. */
interface ClaudeUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

/** Subset of a Claude Code JSONL message. */
interface ClaudeMessage {
  model?: string;
  usage?: ClaudeUsage;
  content?: unknown;
}

/** A single line in a Claude Code JSONL transcript. */
interface ClaudeTranscriptLine {
  type?: string;
  sessionId?: string;
  promptId?: string;
  timestamp?: string;
  cwd?: string;
  isMeta?: boolean;
  message?: ClaudeMessage;
}

export type ClaudeDerivativeEventType = "edit" | "commit" | "test" | "tool_use";

export interface ClaudeToolUseBlock {
  id?: string;
  name: string;
  input?: Record<string, unknown>;
}

export interface ClaudeCollectedToolUse {
  id: string;
  name: string;
  eventType: ClaudeDerivativeEventType;
  summary: string;
}

const NAV_TOOLS = new Set(["Read", "Grep", "Glob", "LS"]);
const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

function bashCommand(block: ClaudeToolUseBlock): string {
  const c = block.input?.command;
  return typeof c === "string" ? c : "";
}

export function classifyToolUse(block: ClaudeToolUseBlock): ClaudeDerivativeEventType | null {
  if (NAV_TOOLS.has(block.name)) return null;
  if (EDIT_TOOLS.has(block.name)) return "edit";
  if (block.name === "Bash") {
    const cmd = bashCommand(block);
    // Require a space or end-of-string after "commit" so "git commit-tree" is not a commit.
    if (/\bgit\s+commit(\s|$)/.test(cmd)) return "commit";
    if (/\b(rspec|jest|vitest|pytest|phpunit)\b/i.test(cmd)) return "test";
  }
  return "tool_use";
}

/**
 * Redacts credential-bearing substrings from a Bash command string before egress.
 *
 * Claude events carry `scannable: true`, which causes the server's ClassificationActivity
 * to take Path 2 (classification_activity.rb:30-44) — trusting the CLI verbatim and
 * skipping server-side sanitization. This function is the single point of trust for
 * command strings derived from tool_input.command. Any new pattern that reads from
 * tool_input.command MUST pass through this function before being emitted. See DATA-CURRENT.md §12.
 */
/**
 * True when an env-var name looks credential-bearing.
 * Long tokens (SECRET/TOKEN/PASSWORD/…) may appear as substrings; short ones
 * (KEY/PASS/PWD) must be underscore-delimited segments so "monkey" / "keyboard"
 * are not redacted.
 */
function isSecretEnvName(name: string): boolean {
  const n = name.toUpperCase();
  if (/(?:SECRET|TOKEN|PASSWORD|APIKEY|API_KEY)/.test(n)) return true;
  return /(?:^|_)(?:KEY|PASS|PWD)(?:_|$)/.test(n);
}

// A credential value that follows a flag or `=`: either a single/double quoted
// string (which may contain spaces) or an unquoted run of non-space chars.
const VALUE = String.raw`(?:"[^"]*"|'[^']*'|\S+)`;

// Secret-bearing long-form flags. Matched with either `=` or a space separator,
// and the value may be quoted (so `--token "secret value"` is fully redacted).
const SECRET_FLAGS =
  "password|token|secret|api[-_]?key|access[-_]?key|auth[-_]?key|" +
  "access-key-id|secret-access-key|service-account-key|client-secret";

export function scrubBashCommand(cmd: string): string {
  return (
    cmd
      // Authorization / Bearer / Basic headers (curl -H, fetch headers, etc.)
      .replace(/\b(Authorization\s*:\s*)(Bearer|Basic|Token)\s+\S+/gi, "$1$2 [REDACTED]")
      // Inline env-var assignments carrying secrets (AWS_SECRET_ACCESS_KEY=…, db_password="a b").
      // Value may be quoted so assignments with spaces inside quotes are fully redacted.
      // eslint-disable-next-line security/detect-non-literal-regexp
      .replace(new RegExp(String.raw`\b([A-Za-z_][A-Za-z0-9_]*)\s*=\s*${VALUE}`, "g"), (match, name: string) =>
        isSecretEnvName(name) ? `${name}=[REDACTED]` : match
      )
      // Secret flags in both --flag=value and --flag value forms, quoted or bare.
      // eslint-disable-next-line security/detect-non-literal-regexp
      .replace(new RegExp(String.raw`(--(?:${SECRET_FLAGS}))(=|\s+)${VALUE}`, "gi"), "$1$2[REDACTED]")
      // -p / --password <value> flag-value pairs (value may be quoted)
      // eslint-disable-next-line security/detect-non-literal-regexp
      .replace(new RegExp(String.raw`((?:^|\s)-p\s+)${VALUE}`, "g"), "$1[REDACTED]")
      // AWS CLI --profile (may embed customer identifiers)
      // eslint-disable-next-line security/detect-non-literal-regexp
      .replace(new RegExp(String.raw`(--profile\s+)${VALUE}`, "g"), "$1[REDACTED]")
      // curl | sh / curl | bash patterns (remote code execution)
      .replace(/\|\s*(sh|bash|zsh|dash)\b/g, "| [SHELL REDACTED]")
  );
}

export function summarizeToolUse(block: ClaudeToolUseBlock): string {
  const input = block.input ?? {};
  let raw: string;
  if (typeof input.file_path === "string" && input.file_path.trim()) {
    raw = `${block.name}: ${input.file_path}`;
  } else if (typeof input.command === "string" && input.command.trim()) {
    const scrubbed = scrubBashCommand(input.command.trim().replace(/\s+/g, " "));
    raw = `${block.name}: ${scrubbed}`;
  } else if (typeof input.pattern === "string") {
    raw = `${block.name}: ${scrubBashCommand(input.pattern)}`;
  } else {
    raw = block.name;
  }
  return raw.length <= 256 ? raw : `${raw.slice(0, 253)}...`;
}

/** Prompt substrings emitted for local IDE commands — not real user prompts. */
const LOCAL_COMMAND_NOISE_PROMPT_PATTERNS = [
  /<local-command-caveat\b/i,
  /<local-command-stdout\b/i,
  /<command-name>/i,
] as const;

function hasZeroTokenUsage(turn: ClaudeTranscriptTurn): boolean {
  return (
    turn.tokensIn === 0 &&
    turn.tokensOut === 0 &&
    turn.cacheWriteTokens === 0 &&
    turn.cacheReadTokens === 0
  );
}

/** True when prompt text alone matches known local-command injection markers. */
export function isClaudeLocalCommandNoisePrompt(promptText: string): boolean {
  const prompt = promptText.trim();
  if (!prompt) return false;
  return LOCAL_COMMAND_NOISE_PROMPT_PATTERNS.some((pattern) => pattern.test(prompt));
}

/**
 * Returns true for transcript turns that are Claude Code local-command noise
 * (caveat, /exit, stdout) with no model usage — safe to omit from ingest.
 */
export function isClaudeNoiseTranscriptTurn(turn: ClaudeTranscriptTurn): boolean {
  if (!hasZeroTokenUsage(turn)) return false;
  if (turn.model !== null) return false;
  if (turn.assistantText.trim().length > 0) return false;
  return isClaudeLocalCommandNoisePrompt(turn.promptText);
}

/**
 * True for turns that look mid-flight: a user prompt is present but the
 * assistant hasn't responded yet (no text, no model, no output tokens).
 *
 * Skipping these is safe: the turn is NOT checkpointed (we never push it to
 * finalizedTurns), so the next sync cycle re-parses the JSONL and persists
 * the now-complete turn once the assistant has finished writing.
 *
 * Genuinely interrupted turns where the assistant never writes anything are
 * also dropped by this guard — that's correct. The classic example is the
 * "[Request interrupted by user for tool use]" placeholder Claude Code
 * injects after a tool-use interruption; it's a system marker, not real
 * user activity, so losing it produces cleaner Events table rows.
 */
export function isIncompleteTranscriptTurn(turn: ClaudeTranscriptTurn): boolean {
  return (
    turn.model === null &&
    turn.assistantText.trim().length === 0 &&
    turn.tokensOut === 0
  );
}

export interface ClaudeTranscriptTurn {
  sessionId: string;
  turnId: string;
  promptId?: string;
  filePath: string;
  fileSize: number;
  cwd?: string;
  model: string | null;
  tokensIn: number;
  tokensOut: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  occurredAt: string;
  promptText: string;
  assistantText: string;
  riskLevel: RiskLevel;
  riskScore: number;
  riskCategories: string[];
  toolUses: ClaudeCollectedToolUse[];
  navToolCalls: number;
  totalToolCalls: number;
  /**
   * Fingerprint of the turn's content (prompt + assistant text + tool-use set).
   * A turn keeps the same turnId as Claude appends more tool_use blocks to it,
   * so sync compares this hash to detect appended derivatives and re-emit them
   * instead of skipping the turn forever on its unchanged id (AIX-259).
   */
  contentHash: string;
}

/** Payload shape for the parent chat turn (carries full token cost). */
export interface ClaudePayload extends IngestPayload {
  tool_name: "claude_code";
  event_type: "chat";
  model?: string;
  tokens_in?: number;
  tokens_out?: number;
  tokens_total?: number;
  cost_usd: number | null;
  occurred_at: string;
  project_id?: string;
  metadata: {
    session_id: string;
    claude_session_id: string;
    transcript_source: "claude_jsonl";
    model?: string | null;
    base_input_tokens: number;
    output_tokens: number;
    cache_write_tokens: number;
    cache_read_tokens: number;
    risk_level: RiskLevel;
    risk_categories: string[];
    risk_score: number;
    prompt_text?: string;
    assistant_text?: string;
    scannable: true;
    cost_model: "token_count";
    nav_tool_calls: number;
    total_tool_calls: number;
  };
}

/** Payload shape for derivative tool-use children (cost_usd: 0, no tokens). */
export interface ClaudeDerivativePayload extends IngestPayload {
  tool_name: "claude_code";
  event_type: ClaudeDerivativeEventType;
  cost_usd: 0;
  occurred_at: string;
  model?: string;
  project_id?: string;
  metadata: {
    session_id: string;
    claude_session_id: string;
    transcript_source: "claude_jsonl";
    cost_model: "derivative";
    parent_session_id: string;
    tool_name_inner: string;
    tool_use_id: string;
    summary: string;
    scannable: false;
    risk_level: "none";
    risk_categories: string[];
    risk_score: 0;
  };
}

/** Union of all Claude transcript payloads expected by the ingest API. */
export type ClaudeMappedPayload = ClaudePayload | ClaudeDerivativePayload;

/** Options for mapTranscriptTurn. */
export interface ToClaudePayloadOptions {
  projectId?: string | null;
  pricing?: PricingTable;
}

/** Returns the two candidate Claude project directories (v1.0.30+ and legacy). */
function claudeProjectDirs(): string[] {
  const home = homedir();
  return [
    join(home, ".config", "claude", "projects"),
    join(home, ".claude", "projects"),
  ];
}

/** Finds all *.jsonl transcript files across both Claude project directory roots. */
export function findTranscriptFiles(baseDirs?: string[]): string[] {
  const dirs = baseDirs ?? claudeProjectDirs();
  const files: string[] = [];

  for (const dir of dirs) {
    try {
      const matches = glob.sync("**/*.jsonl", { cwd: dir, absolute: true });
      files.push(...matches);
    } catch {
      // directory does not exist — skip
    }
  }

  // De-duplicate in case both paths resolve to the same files (symlinks, etc.)
  return [...new Set(files)];
}

/** Extracts text strings from a content field (block array or plain string). */
function extractContentText(content: unknown): string[] {
  if (typeof content === "string") return [content];
  if (!Array.isArray(content)) return [];
  return content.flatMap((block) => {
    if (typeof block !== "object" || block === null) return [];
    const { type, text } = block as Record<string, unknown>;
    return type === "text" && typeof text === "string" ? [text] : [];
  });
}

function hasTextContent(content: unknown): boolean {
  if (typeof content === "string") return content.trim().length > 0;
  if (!Array.isArray(content)) return false;
  return content.some((block) => {
    if (typeof block !== "object" || block === null) return false;
    const { type, text } = block as Record<string, unknown>;
    return type === "text" && typeof text === "string" && text.trim().length > 0;
  });
}

interface MutableTranscriptTurn extends ClaudeTranscriptTurn {
  persisted?: boolean;
}

function newTurn(
  sessionId: string,
  turnIndex: number,
  filePath: string,
  fileSize: number,
  occurredAt: string,
  promptId?: string
): MutableTranscriptTurn {
  return {
    sessionId,
    turnId: `${sessionId}:${turnIndex}`,
    promptId,
    filePath,
    fileSize,
    cwd: undefined,
    model: null,
    tokensIn: 0,
    tokensOut: 0,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    occurredAt,
    promptText: "",
    assistantText: "",
    riskLevel: "low",
    riskScore: 0,
    riskCategories: [],
    toolUses: [],
    navToolCalls: 0,
    totalToolCalls: 0,
    contentHash: "",
    persisted: false,
  };
}

/**
 * Stable fingerprint of a turn's emittable content. Includes the tool-use set
 * (id + name + summary) so appending a tool_use to an already-synced turn
 * changes the hash and triggers a re-emit (AIX-259).
 */
function computeTurnContentHash(turn: ClaudeTranscriptTurn): string {
  const toolFingerprint = turn.toolUses
    .map((t) => `${t.id}:${t.eventType}:${t.summary}`)
    .join("");
  const material = [
    turn.model ?? "",
    turn.tokensIn,
    turn.tokensOut,
    turn.promptText,
    turn.assistantText,
    toolFingerprint,
  ].join(" ");
  return createHash("sha256").update(material).digest("hex").slice(0, 32);
}

function appendText(existing: string, addition: string): string {
  if (!addition.trim()) return existing;
  return existing ? `${existing}\n\n${addition}` : addition;
}

function enrichTurnRisk(turn: MutableTranscriptTurn): void {
  if (!turn.promptText.trim()) return;
  const result = scanText(turn.promptText);
  turn.riskLevel = result.risk_level;
  turn.riskScore = result.risk_score;
  turn.riskCategories = result.risk_categories;
}

function collectToolUsesFromContent(content: unknown, turn: MutableTranscriptTurn): void {
  if (!Array.isArray(content)) return;

  let nav = 0;
  let total = 0;
  for (const raw of content) {
    if (typeof raw !== "object" || raw === null) continue;
    const block = raw as Record<string, unknown>;
    if (block.type !== "tool_use" || typeof block.name !== "string") continue;

    total += 1;
    const toolBlock: ClaudeToolUseBlock = {
      id: typeof block.id === "string" ? block.id : undefined,
      name: block.name,
      input:
        typeof block.input === "object" && block.input !== null
          ? (block.input as Record<string, unknown>)
          : undefined,
    };
    const eventType = classifyToolUse(toolBlock);
    if (eventType === null) {
      nav += 1;
      continue;
    }

    const id = toolBlock.id ?? `idx-${turn.toolUses.length}`;
    turn.toolUses.push({
      id,
      name: toolBlock.name,
      eventType,
      summary: summarizeToolUse(toolBlock),
    });
  }
  turn.navToolCalls += nav;
  turn.totalToolCalls += total;
}

/** Streams a JSONL file and splits Claude transcripts into individual turns. */
export async function parseTranscriptFile(
  filePath: string,
  verbose: boolean = false
): Promise<ClaudeTranscriptTurn[]> {
  const turns: ClaudeTranscriptTurn[] = [];

  let fileSize = 0;
  try {
    fileSize = statSync(filePath).size;
  } catch {
    return turns;
  }

  const stream = createReadStream(filePath, { encoding: "utf-8" });
  const rl = createInterface({
    input: stream,
    crlfDelay: Infinity,
  });

  let lineNumber = 0;
  let currentTurn: MutableTranscriptTurn | null = null;
  let currentTurnIndex = 0;
  const turnsByPromptId = new Map<string, MutableTranscriptTurn>();
  const finalizedTurns: MutableTranscriptTurn[] = [];

  const flushCurrentTurn = (): void => {
    if (!currentTurn) return;
    if (!currentTurn.persisted) {
      enrichTurnRisk(currentTurn);
      const hasContent =
        currentTurn.promptText.trim().length > 0 || currentTurn.assistantText.trim().length > 0;
      if (
        hasContent &&
        !isClaudeNoiseTranscriptTurn(currentTurn) &&
        !isIncompleteTranscriptTurn(currentTurn)
      ) {
        currentTurn.persisted = true;
        finalizedTurns.push(currentTurn);
      }
    }
    currentTurn = null;
  };

  try {
    for await (const line of rl) {
      lineNumber++;
      const trimmed = line.trim();
      if (!trimmed) continue;

      let entry: ClaudeTranscriptLine;
      try {
        entry = JSON.parse(trimmed) as ClaudeTranscriptLine;
      } catch {
        if (verbose) {
          console.warn(`[warn] ${filePath}:${lineNumber} — invalid JSON, skipping`);
        }
        continue;
      }

      const sessionId = entry.sessionId;
      const promptId = entry.promptId;
      const timestamp = entry.timestamp ?? new Date().toISOString();
      const cwd = typeof entry.cwd === "string" && entry.cwd.trim().length > 0 ? entry.cwd : undefined;

      if (entry.type === "user") {
        if (!sessionId || !entry.message?.content) continue;
        const text = extractContentText(entry.message.content).join("\n\n").trim();

        // Claude emits tool_result-only user entries after assistant tool_use.
        // Those are part of the active turn, not a new user prompt.
        if (hasTextContent(entry.message.content)) {
          if (entry.isMeta === true || isClaudeLocalCommandNoisePrompt(text)) {
            if (verbose) {
              console.log("[verbose] Skipping Claude local-command/meta user line");
            }
            continue;
          }
          flushCurrentTurn();
          currentTurnIndex += 1;
          currentTurn = newTurn(sessionId, currentTurnIndex, filePath, fileSize, timestamp, promptId);
          currentTurn.cwd = cwd ?? currentTurn.cwd;
          currentTurn.promptText = appendText(currentTurn.promptText, text);
          currentTurn.occurredAt = timestamp;
          if (promptId) turnsByPromptId.set(promptId, currentTurn);
        } else if (promptId && turnsByPromptId.has(promptId)) {
          currentTurn = turnsByPromptId.get(promptId) ?? null;
          if (currentTurn) {
            currentTurn.cwd = cwd ?? currentTurn.cwd;
            currentTurn.occurredAt = timestamp > currentTurn.occurredAt ? timestamp : currentTurn.occurredAt;
          }
        } else if (currentTurn && currentTurn.sessionId === sessionId) {
          currentTurn.cwd = cwd ?? currentTurn.cwd;
          currentTurn.occurredAt = timestamp > currentTurn.occurredAt ? timestamp : currentTurn.occurredAt;
        }
        continue;
      }

      if (entry.type === "assistant") {
        if (!sessionId || !entry.message) continue;

        if (!currentTurn || currentTurn.sessionId !== sessionId) {
          currentTurnIndex += 1;
          currentTurn = newTurn(sessionId, currentTurnIndex, filePath, fileSize, timestamp);
        }
        currentTurn.cwd = cwd ?? currentTurn.cwd;

        const usage = entry.message.usage;
        if (usage) {
          currentTurn.tokensIn +=
            (usage.input_tokens ?? 0) +
            (usage.cache_creation_input_tokens ?? 0) +
            (usage.cache_read_input_tokens ?? 0);
          currentTurn.tokensOut += usage.output_tokens ?? 0;
          currentTurn.cacheWriteTokens += usage.cache_creation_input_tokens ?? 0;
          currentTurn.cacheReadTokens += usage.cache_read_input_tokens ?? 0;
        } else if (verbose) {
          console.warn(`[warn] ${filePath}:${lineNumber} — assistant message has no usage`);
        }

        if (entry.message.model) currentTurn.model = entry.message.model;
        currentTurn.occurredAt = timestamp > currentTurn.occurredAt ? timestamp : currentTurn.occurredAt;

        const text = extractContentText(entry.message.content).join("\n\n").trim();
        currentTurn.assistantText = appendText(currentTurn.assistantText, text);
        collectToolUsesFromContent(entry.message.content, currentTurn);
      }
    }
  } catch (err) {
    if (verbose) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[warn] ${filePath} — stream error, skipping file: ${message}`);
    }
    rl.close();
    stream.destroy();
    await finished(stream).catch(() => undefined);
    return turns;
  }

  flushCurrentTurn();
  return finalizedTurns.map(({ persisted: _persisted, ...turn }) => ({
    ...turn,
    contentHash: computeTurnContentHash(turn),
  }));
}

/** Converts a Claude transcript turn to parent chat and derivative tool-use payloads. */
export function mapTranscriptTurn(
  turn: ClaudeTranscriptTurn,
  options?: ToClaudePayloadOptions
): ClaudeMappedPayload[] {
  const { projectId, pricing } = options ?? {};

  const baseInputTokens = Math.max(0, turn.tokensIn - turn.cacheWriteTokens - turn.cacheReadTokens);
  const cost = pricing
    ? calculateCost(turn.model, baseInputTokens, turn.tokensOut, turn.cacheWriteTokens, turn.cacheReadTokens, pricing)
    : null;

  const payload: ClaudePayload = {
    tool_name: "claude_code",
    event_type: "chat",
    cost_usd: cost,
    occurred_at: turn.occurredAt,
    metadata: {
      session_id: turn.turnId,
      claude_session_id: turn.sessionId,
      transcript_source: "claude_jsonl",
      model: turn.model,
      base_input_tokens: baseInputTokens,
      output_tokens: turn.tokensOut,
      cache_write_tokens: turn.cacheWriteTokens,
      cache_read_tokens: turn.cacheReadTokens,
      risk_level: turn.riskLevel,
      risk_categories: turn.riskCategories,
      risk_score: turn.riskScore,
      prompt_text: turn.promptText || undefined,
      assistant_text: turn.assistantText || undefined,
      scannable: true,
      cost_model: "token_count",
      // Zero is intentional: confirms no tool activity on this turn (not an omission).
      nav_tool_calls: turn.navToolCalls,
      total_tool_calls: turn.totalToolCalls,
    },
  };

  if (turn.model) payload.model = turn.model;
  if (baseInputTokens > 0) payload.tokens_in = baseInputTokens;
  if (turn.tokensOut > 0) payload.tokens_out = turn.tokensOut;
  if (baseInputTokens > 0 || turn.tokensOut > 0) {
    payload.tokens_total = baseInputTokens + turn.tokensOut;
  }
  if (projectId) payload.project_id = projectId;

  const derivatives: ClaudeDerivativePayload[] = turn.toolUses.map((toolUse) => {
    const derivative: ClaudeDerivativePayload = {
      tool_name: "claude_code",
      event_type: toolUse.eventType,
      cost_usd: 0,
      occurred_at: turn.occurredAt,
      metadata: {
        session_id: `${turn.turnId}:tool:${toolUse.id}`,
        claude_session_id: turn.sessionId,
        transcript_source: "claude_jsonl",
        cost_model: "derivative",
        parent_session_id: turn.turnId,
        tool_name_inner: toolUse.name,
        tool_use_id: toolUse.id,
        summary: toolUse.summary,
        scannable: false,
        risk_level: "none",
        risk_categories: [],
        risk_score: 0,
      },
    };
    if (turn.model) derivative.model = turn.model;
    if (projectId) derivative.project_id = projectId;
    return derivative;
  });

  return [payload, ...derivatives];
}
