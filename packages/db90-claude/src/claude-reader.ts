import { createReadStream, statSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { homedir } from "node:os";
import { glob } from "glob";

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
}

/** Payload shape expected by the db90 ingest API. */
export interface Db90Payload {
  tool_name: "claude_code";
  event_type: "chat";
  model?: string;
  tokens_in?: number;
  tokens_out?: number;
  tokens_total?: number;
  occurred_at: string;
  metadata: {
    session_id: string;
    cache_write_tokens?: number;
    cache_read_tokens?: number;
  };
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

/** Streams a JSONL file and aggregates token usage per session. */
export async function parseTranscriptFile(
  filePath: string,
  verbose: boolean = false
): Promise<Map<string, SessionAggregate>> {
  const sessions = new Map<string, SessionAggregate>();

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

    if (entry.type !== "assistant") continue;
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
  }

  return sessions;
}

/** Converts a SessionAggregate to a db90 ingest payload. */
export function toDb90Payload(agg: SessionAggregate): Db90Payload {
  const payload: Db90Payload = {
    tool_name: "claude_code",
    event_type: "chat",
    occurred_at: agg.occurredAt,
    metadata: {
      session_id: agg.sessionId,
    },
  };

  if (agg.model) payload.model = agg.model;
  if (agg.tokensIn > 0) payload.tokens_in = agg.tokensIn;
  if (agg.tokensOut > 0) payload.tokens_out = agg.tokensOut;
  if (agg.tokensIn > 0 || agg.tokensOut > 0) {
    payload.tokens_total = agg.tokensIn + agg.tokensOut;
  }
  if (agg.cacheWriteTokens > 0) {
    payload.metadata.cache_write_tokens = agg.cacheWriteTokens;
  }
  if (agg.cacheReadTokens > 0) {
    payload.metadata.cache_read_tokens = agg.cacheReadTokens;
  }

  return payload;
}
