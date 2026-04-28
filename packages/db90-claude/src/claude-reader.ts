import { createReadStream, statSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { homedir } from "node:os";
import { glob } from "glob";
import { type PricingTable, calculateCost } from "./pricing.js";
import { type RiskLevel, scanText } from "./risk-scanner.js";

/** Subset of a Claude Code JSONL assistant message usage block. */
interface ClaudeUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

interface ContentBlock {
  type: string;
  text?: string;
}

/** Subset of a Claude Code JSONL message. */
interface ClaudeMessage {
  model?: string;
  usage?: ClaudeUsage;
  content?: ContentBlock[] | string;
}

/** A single line in a Claude Code JSONL transcript. */
interface ClaudeTranscriptLine {
  type?: string;
  sessionId?: string;
  timestamp?: string;
  message?: ClaudeMessage;
}

/** Aggregated token usage for one session. */
export interface SessionAggregate {
  sessionId: string;
  filePath: string;
  fileSize: number;
  model: string | null;
  tokensIn: number;
  tokensOut: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  /** Latest assistant message timestamp in the session (ISO string). */
  occurredAt: string;
  riskLevel: RiskLevel;
  riskScore: number;
  riskCategories: string[];
}

/** Payload shape expected by the db90 ingest API. */
export interface Db90Payload {
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
    model: string | null;
    base_input_tokens: number;
    output_tokens: number;
    cache_write_tokens: number;
    cache_read_tokens: number;
    risk_level: RiskLevel;
    risk_categories: string[];
    risk_score: number;
    scannable: true;
  };
}

/** Options for toDb90Payload. */
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
function extractContentText(content: ContentBlock[] | string): string[] {
  if (typeof content === "string") return [content];
  return content.filter((b) => b.type === "text" && b.text).map((b) => b.text!);
}

/** Streams a JSONL file and aggregates token usage per session. */
export async function parseTranscriptFile(
  filePath: string,
  verbose: boolean = false
): Promise<Map<string, SessionAggregate>> {
  const sessions = new Map<string, SessionAggregate>();
  const userTexts = new Map<string, string>();

  let fileSize = 0;
  try {
    fileSize = statSync(filePath).size;
  } catch {
    return sessions;
  }

  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  let lineNumber = 0;
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

    if (entry.type === "assistant") {
      if (!entry.sessionId || !entry.message) continue;

      const usage = entry.message.usage;
      if (!usage) {
        if (verbose) {
          console.warn(`[warn] ${filePath}:${lineNumber} — assistant message has no usage, skipping`);
        }
        continue;
      }

      const sessionId = entry.sessionId;
      const existing = sessions.get(sessionId);

      const tokensIn =
        (usage.input_tokens ?? 0) +
        (usage.cache_creation_input_tokens ?? 0) +
        (usage.cache_read_input_tokens ?? 0);
      const tokensOut = usage.output_tokens ?? 0;
      const cacheWrite = usage.cache_creation_input_tokens ?? 0;
      const cacheRead = usage.cache_read_input_tokens ?? 0;
      const model = entry.message.model ?? null;
      const timestamp = entry.timestamp ?? new Date().toISOString();

      if (!existing) {
        sessions.set(sessionId, {
          sessionId,
          filePath,
          fileSize,
          model,
          tokensIn,
          tokensOut,
          cacheWriteTokens: cacheWrite,
          cacheReadTokens: cacheRead,
          occurredAt: timestamp,
          riskLevel: "low",
          riskScore: 0,
          riskCategories: [],
        });
      } else {
        existing.tokensIn += tokensIn;
        existing.tokensOut += tokensOut;
        existing.cacheWriteTokens += cacheWrite;
        existing.cacheReadTokens += cacheRead;
        // Keep most common model (last seen wins for simplicity)
        if (model) existing.model = model;
        // Advance to latest timestamp
        if (timestamp > existing.occurredAt) existing.occurredAt = timestamp;
      }
    } else if (entry.type === "user") {
      if (!entry.sessionId || !entry.message?.content) continue;
      const texts = extractContentText(entry.message.content);
      const existing = userTexts.get(entry.sessionId);
      userTexts.set(entry.sessionId, existing ? `${existing} ${texts.join(" ")}` : texts.join(" "));
    } else {
      continue;
    }
  }

  // Apply risk scanning to each session from accumulated user-turn text
  for (const [sessionId, agg] of sessions) {
    const combined = userTexts.get(sessionId);
    if (combined) {
      const result = scanText(combined);
      agg.riskLevel = result.risk_level;
      agg.riskScore = result.risk_score;
      agg.riskCategories = result.risk_categories;
    }
  }

  return sessions;
}

/** Converts a SessionAggregate to a db90 ingest payload. */
export function toDb90Payload(agg: SessionAggregate, options?: ToDb90PayloadOptions): Db90Payload {
  const { projectId, pricing } = options ?? {};

  // tokensIn = input_tokens + cache_write + cache_read (see parseTranscriptFile).
  // Decompose back to bill each component at its own rate.
  const baseInputTokens = Math.max(0, agg.tokensIn - agg.cacheWriteTokens - agg.cacheReadTokens);
  const cost = pricing
    ? calculateCost(agg.model, baseInputTokens, agg.tokensOut, agg.cacheWriteTokens, agg.cacheReadTokens, pricing)
    : null;

  const payload: Db90Payload = {
    tool_name: "claude_code",
    event_type: "chat",
    cost_usd: cost,
    occurred_at: agg.occurredAt,
    metadata: {
      session_id: agg.sessionId,
      model: agg.model,
      base_input_tokens: baseInputTokens,
      output_tokens: agg.tokensOut,
      cache_write_tokens: agg.cacheWriteTokens,
      cache_read_tokens: agg.cacheReadTokens,
      risk_level: agg.riskLevel,
      risk_categories: agg.riskCategories,
      risk_score: agg.riskScore,
      scannable: true,
    },
  };

  if (agg.model) payload.model = agg.model;
  if (agg.tokensIn > 0) payload.tokens_in = agg.tokensIn;
  if (agg.tokensOut > 0) payload.tokens_out = agg.tokensOut;
  if (agg.tokensIn > 0 || agg.tokensOut > 0) {
    payload.tokens_total = agg.tokensIn + agg.tokensOut;
  }
  if (projectId) payload.project_id = projectId;

  return payload;
}
