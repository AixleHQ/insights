import { createReadStream, statSync } from "node:fs";
import { finished } from "node:stream/promises";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { homedir } from "node:os";
import { glob } from "glob";
import type { IngestPayload } from "@db90/sdk";
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
}

/** Payload shape expected by the db90 ingest API. */
export interface Db90Payload extends IngestPayload {
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
    model: string | null;
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
  };
}

/** Options for mapTranscriptTurn. */
export interface ToDb90PayloadOptions {
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
    persisted: false,
  };
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
      if (hasContent && !isClaudeNoiseTranscriptTurn(currentTurn)) {
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
  return finalizedTurns.map(({ persisted: _persisted, ...turn }) => turn);
}

/** Converts a Claude transcript turn to a db90 ingest payload. */
export function mapTranscriptTurn(turn: ClaudeTranscriptTurn, options?: ToDb90PayloadOptions): Db90Payload {
  const { projectId, pricing } = options ?? {};

  const baseInputTokens = Math.max(0, turn.tokensIn - turn.cacheWriteTokens - turn.cacheReadTokens);
  const cost = pricing
    ? calculateCost(turn.model, baseInputTokens, turn.tokensOut, turn.cacheWriteTokens, turn.cacheReadTokens, pricing)
    : null;

  const payload: Db90Payload = {
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
    },
  };

  if (turn.model) payload.model = turn.model;
  if (turn.tokensIn > 0) payload.tokens_in = turn.tokensIn;
  if (turn.tokensOut > 0) payload.tokens_out = turn.tokensOut;
  if (turn.tokensIn > 0 || turn.tokensOut > 0) {
    payload.tokens_total = turn.tokensIn + turn.tokensOut;
  }
  if (projectId) payload.project_id = projectId;

  return payload;
}
