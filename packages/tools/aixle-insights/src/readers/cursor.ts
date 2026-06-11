/**
 * Consolidated SQLite reader + ingest mapper for Cursor telemetry.
 * Not imported from the package — public export is `./sync`.
 */
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { finished } from "node:stream/promises";
import { createInterface } from "node:readline";
import { createHash } from "node:crypto";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { glob } from "glob";
import Database from "better-sqlite3";
import type { IngestPayload } from "../lib/index.js";
import { type RiskLevel, scanText } from "../risk-scanner.js";

// ─── Reader: paths & SQLite ──────────────────────────────────────────────────

export function cursorUserDir(): string {
  switch (process.platform) {
    case "darwin":
      return join(homedir(), "Library", "Application Support", "Cursor", "User");
    case "win32":
      return join(process.env.APPDATA ?? homedir(), "Cursor", "User");
    default:
      return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "Cursor", "User");
  }
}

function cursorProjectsDir(): string {
  return join(homedir(), ".cursor", "projects");
}

interface TableInfo {
  name: string;
}

const LEGACY_TABLE = "CursorRequestFeedback";
const STATE_TABLE = "ItemTable";

function getTableNames(db: Database.Database): string[] {
  return (
    db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as TableInfo[]
  ).map((r) => r.name);
}

function tableExists(db: Database.Database, tableName: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get(tableName) as TableInfo | undefined;
  return row !== undefined;
}

function logDbTables(db: Database.Database, dbPath: string, label: string): void {
  const tables = getTableNames(db);
  console.log(`  [${label}] ${dbPath}`);
  console.log(`  tables: ${tables.join(", ") || "(none)"}`);
}

/** Smoke-test better-sqlite3 against the global Cursor state DB (CUR-V02 / verify scripts). */
export function probeCursorGlobalStateDb(verbose = false): boolean {
  const dbPath = join(cursorUserDir(), "globalStorage", "state.vscdb");
  try {
    const db = new Database(dbPath, { readonly: true });
    const row = db
      .prepare(
        `SELECT count(*) AS c FROM ${STATE_TABLE} WHERE key LIKE 'aiCodeTracking.dailyStats%'`
      )
      .get() as { c: number };
    db.close();
    if (verbose) {
      console.log(`  [probe] global state.vscdb OK — ${row.c} dailyStats key(s)`);
    }
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  [probe] failed to read ${dbPath}: ${msg}`);
    return false;
  }
}

// ─── Legacy: cursor.db / CursorRequestFeedback ─────────────────────────────────

export function findCursorDbs(baseDir?: string): string[] {
  const dir = join(baseDir ?? cursorUserDir(), "workspaceStorage");
  try {
    return glob.sync(join(dir, "**", "cursor.db"));
  } catch {
    return [];
  }
}

export interface CursorRow {
  requestId?: string | null;
  timestamp?: number | string | null;
  model?: string | null;
  promptTokens?: number | null;
  generatedTokens?: number | null;
  type?: number | null;
  sessionId?: string | null;
  [key: string]: unknown;
}

function readLegacyFromDb(
  dbPath: string,
  since: Date | null,
  workspacePath: string,
  verbose: boolean
): CursorRow[] {
  let db: Database.Database | null = null;
  try {
    db = new Database(dbPath, { readonly: true });

    if (verbose) logDbTables(db, dbPath, "cursor.db");

    if (!tableExists(db, LEGACY_TABLE)) return [];

    const params: unknown[] = [workspacePath];
    let query = `SELECT *, ? as _workspacePath FROM ${LEGACY_TABLE}`;
    if (since != null) {
      query += " WHERE timestamp > ?";
      params.push(since.getTime() / 1000 - 1);
    }
    query += " ORDER BY timestamp ASC";

    const rows = db.prepare(query).all(...params) as CursorRow[];

    if (since != null) {
      const sinceMs = since.getTime();
      return rows.filter((row) => {
        const ms = toEpochMs(row.timestamp);
        return ms !== null && ms > sinceMs;
      });
    }
    return rows;
  } catch {
    return [];
  } finally {
    db?.close();
  }
}

export function readLegacyEvents(
  since: Date | null,
  baseDir?: string,
  verbose = false
): Array<{ row: CursorRow; workspacePath: string }> {
  const dbPaths = findCursorDbs(baseDir);

  if (verbose) console.log(`Found ${dbPaths.length} legacy cursor.db file(s)`);

  const results: Array<{ row: CursorRow; workspacePath: string }> = [];
  for (const dbPath of dbPaths) {
    const workspacePath = dbPath.replace(/[\\/]cursor\.db$/, "");
    for (const row of readLegacyFromDb(dbPath, since, workspacePath, verbose)) {
      results.push({ row, workspacePath });
    }
  }
  return results;
}

// ─── state.vscdb / ItemTable / aiCodeTracking keys ─────────────────────────────

export interface DailyStatsEntry {
  date: string;
  value: unknown;
  dbPath: string;
}

export function isGlobalStateDbPath(dbPath: string): boolean {
  return dbPath.replace(/\\/g, "/").includes("/globalStorage/state.vscdb");
}

type WorkspaceScope = "global" | "workspace";

function fileUriToPath(uri: string): string | null {
  try {
    if (uri.startsWith("file://")) return fileURLToPath(uri);
    return uri;
  } catch {
    return null;
  }
}

function readWorkspaceFolderFromJson(workspaceStorageDir: string): string | null {
  const jsonPath = join(workspaceStorageDir, "workspace.json");
  if (!existsSync(jsonPath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(jsonPath, "utf-8")) as Record<string, unknown>;
    if (typeof parsed.folder === "string") return fileUriToPath(parsed.folder);
    const folders = parsed.folders;
    if (Array.isArray(folders) && folders.length > 0) {
      const first = folders[0] as Record<string, unknown>;
      if (typeof first.path === "string") return fileUriToPath(first.path);
    }
  } catch {
    return null;
  }
  return null;
}

function resolveCursorWorkspaceFolder(dbPathOrWorkspaceDir: string): string | null {
  if (isGlobalStateDbPath(dbPathOrWorkspaceDir)) return null;
  const normalized = dbPathOrWorkspaceDir.replace(/\\/g, "/");
  const wsDir = normalized.endsWith("/state.vscdb")
    ? dirname(dbPathOrWorkspaceDir)
    : dbPathOrWorkspaceDir;
  return readWorkspaceFolderFromJson(wsDir);
}

function cursorWorkspaceMetadata(dbPath: string): {
  workspace: string;
  workspace_scope: WorkspaceScope;
  workspace_folder?: string;
} {
  const workspace_scope: WorkspaceScope = isGlobalStateDbPath(dbPath) ? "global" : "workspace";
  const folder =
    workspace_scope === "workspace" ? resolveCursorWorkspaceFolder(dbPath) : null;
  return {
    workspace: dbPath,
    workspace_scope,
    ...(folder ? { workspace_folder: folder } : {}),
  };
}

function cursorWorkspaceMetadataFromStorageDir(workspaceStorageDir: string): {
  workspace: string;
  workspace_scope: WorkspaceScope;
  workspace_folder?: string;
} {
  const folder = resolveCursorWorkspaceFolder(workspaceStorageDir);
  return {
    workspace: workspaceStorageDir,
    workspace_scope: "workspace",
    ...(folder ? { workspace_folder: folder } : {}),
  };
}

function dailyStatsActivityTotal(value: unknown): number {
  if (typeof value !== "object" || value === null) return 0;
  const o = value as Record<string, unknown>;
  const fields = [
    "tabSuggestedLines",
    "tabAcceptedLines",
    "composerSuggestedLines",
    "composerAcceptedLines",
  ] as const;
  return fields.reduce((sum, field) => {
    const n = o[field];
    return sum + (typeof n === "number" && n > 0 ? n : 0);
  }, 0);
}

function dailyStatsValuesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function dedupeDailyStatsEntries(entries: DailyStatsEntry[]): DailyStatsEntry[] {
  const byDate = new Map<string, DailyStatsEntry[]>();
  for (const entry of entries) {
    const group = byDate.get(entry.date) ?? [];
    group.push(entry);
    byDate.set(entry.date, group);
  }

  const deduped: DailyStatsEntry[] = [];

  for (const group of byDate.values()) {
    if (group.length === 1) {
      deduped.push(group[0]);
      continue;
    }

    const fromGlobal = group.filter((e) => isGlobalStateDbPath(e.dbPath));
    if (fromGlobal.length > 0) {
      deduped.push(fromGlobal[0]);
      continue;
    }

    const distinct: DailyStatsEntry[] = [];
    for (const entry of group) {
      if (distinct.some((d) => dailyStatsValuesEqual(d.value, entry.value))) continue;
      distinct.push(entry);
    }
    if (distinct.length === 1) {
      deduped.push(distinct[0]);
      continue;
    }
    distinct.sort(
      (a, b) => dailyStatsActivityTotal(b.value) - dailyStatsActivityTotal(a.value)
    );
    deduped.push(distinct[0]);
  }

  return deduped.sort((a, b) => a.date.localeCompare(b.date));
}

export function findStateVscDbs(baseDir?: string): string[] {
  const userDir = baseDir ?? cursorUserDir();
  const results: string[] = [];

  results.push(join(userDir, "globalStorage", "state.vscdb"));

  try {
    results.push(...glob.sync(join(userDir, "workspaceStorage", "**", "state.vscdb")));
  } catch {
    /* ignore */
  }

  return results;
}

function readDailyStatsFromDb(
  dbPath: string,
  since: Date | null,
  verbose: boolean
): DailyStatsEntry[] {
  let db: Database.Database | null = null;
  try {
    db = new Database(dbPath, { readonly: true });

    if (verbose) logDbTables(db, dbPath, "state.vscdb");

    if (!tableExists(db, STATE_TABLE)) return [];

    const rows = db
      .prepare(`SELECT key, value FROM ${STATE_TABLE} WHERE key LIKE 'aiCodeTracking.%'`)
      .all() as { key: string; value: string }[];

    if (verbose && rows.length > 0) {
      console.log(`  aiCodeTracking keys (${rows.length}):`);
      for (const r of rows.slice(0, 10)) {
        console.log(`    ${r.key} → ${r.value}`);
      }
      if (rows.length > 10) console.log(`    … and ${rows.length - 10} more`);
    }

    const entries: DailyStatsEntry[] = [];
    for (const { key, value: rawValue } of rows) {
      const dateMatch = key.match(/(\d{4}-\d{2}-\d{2})$/);
      if (!dateMatch) continue;

      const date = dateMatch[1];
      if (since && date <= since.toISOString().slice(0, 10)) continue;

      let parsed: unknown;
      try {
        parsed = JSON.parse(rawValue);
      } catch {
        continue;
      }

      entries.push({ date, value: parsed, dbPath });
    }

    return entries;
  } catch {
    return [];
  } finally {
    db?.close();
  }
}

function readDailyStatsRaw(
  since: Date | null,
  baseDir: string | undefined,
  verbose: boolean
): DailyStatsEntry[] {
  const dbPaths = findStateVscDbs(baseDir);

  if (verbose) {
    console.log(`Searching: ${baseDir ?? cursorUserDir()}`);
    console.log(`Found ${dbPaths.length} state.vscdb file(s)`);
  }

  const raw: DailyStatsEntry[] = [];
  for (const dbPath of dbPaths) {
    raw.push(...readDailyStatsFromDb(dbPath, since, verbose));
  }
  return raw;
}

export interface DailyStatsReadResult {
  raw: DailyStatsEntry[];
  deduped: DailyStatsEntry[];
}

export function readDailyStatsWithDedupe(
  since: Date | null,
  baseDir?: string,
  verbose = false
): DailyStatsReadResult {
  const raw = readDailyStatsRaw(since, baseDir, verbose);
  const deduped = dedupeDailyStatsEntries(raw);
  if (verbose && raw.length !== deduped.length) {
    console.log(
      `  dailyStats dedupe: ${raw.length} raw row(s) → ${deduped.length} after preferring globalStorage per date`
    );
  }
  return { raw, deduped };
}

export function readDailyStats(
  since: Date | null,
  baseDir?: string,
  verbose = false
): DailyStatsEntry[] {
  return readDailyStatsWithDedupe(since, baseDir, verbose).deduped;
}

// ─── recentCommit ────────────────────────────────────────────────────────────

const RECENT_COMMIT_KEY = "aiCodeTracking.recentCommit";

export interface RecentCommitSnapshot {
  value: Record<string, unknown>;
  dbPath: string;
}

function toTimestampMs(raw: unknown): number | null {
  if (typeof raw === "number" && !isNaN(raw) && raw > 0) return raw;
  if (typeof raw === "string") {
    const n = Number(raw);
    if (!isNaN(n) && n > 0) return n;
  }
  return null;
}

function dedupeRecentCommitSnapshots(entries: RecentCommitSnapshot[]): RecentCommitSnapshot[] {
  const byKey = new Map<string, RecentCommitSnapshot>();
  for (const e of entries) {
    const h =
      typeof e.value.commitHash === "string" && e.value.commitHash.length > 0
        ? e.value.commitHash
        : `${e.dbPath}:${String(e.value.timestamp ?? "")}`;
    const prev = byKey.get(h);
    const tE = toTimestampMs(e.value.timestamp);
    if (tE === null) continue;
    if (!prev) {
      byKey.set(h, e);
      continue;
    }
    const tP = toTimestampMs(prev.value.timestamp);
    if (tP === null || tE > tP) byKey.set(h, e);
  }
  return [...byKey.values()];
}

function readRecentCommitFromDb(
  dbPath: string,
  since: Date | null,
  verbose: boolean
): RecentCommitSnapshot[] {
  let db: Database.Database | null = null;
  try {
    db = new Database(dbPath, { readonly: true });
    if (!tableExists(db, STATE_TABLE)) return [];

    const row = db
      .prepare(`SELECT value FROM ${STATE_TABLE} WHERE key = ?`)
      .get(RECENT_COMMIT_KEY) as { value: string } | undefined;
    if (!row) return [];

    let parsed: unknown;
    try {
      parsed = JSON.parse(row.value);
    } catch {
      return [];
    }
    if (typeof parsed !== "object" || parsed === null) return [];
    const obj = parsed as Record<string, unknown>;
    const tMs = toTimestampMs(obj.timestamp);
    if (tMs === null) return [];

    if (since !== null) {
      const sinceMs = since.getTime();
      if (tMs <= sinceMs) return [];
    }

    if (verbose) {
      const ch = typeof obj.commitHash === "string" ? obj.commitHash : "";
      console.log(`  [recentCommit] ${dbPath}`);
      if (ch) console.log(`    commitHash → ${ch.slice(0, 12)}…`);
    }

    return [{ value: obj, dbPath }];
  } catch {
    return [];
  } finally {
    db?.close();
  }
}

export function readRecentCommitSnapshots(
  since: Date | null,
  baseDir?: string,
  verbose = false
): RecentCommitSnapshot[] {
  const dbPaths = findStateVscDbs(baseDir);
  if (verbose) {
    console.log(`Searching recentCommit: ${baseDir ?? cursorUserDir()}`);
  }

  const found: RecentCommitSnapshot[] = [];
  for (const dbPath of dbPaths) {
    found.push(...readRecentCommitFromDb(dbPath, since, verbose));
  }
  return dedupeRecentCommitSnapshots(found);
}

export function readEvents(
  since: Date | null,
  baseDir?: string,
  verbose = false
): Array<{ row: CursorRow; workspacePath: string }> {
  return readLegacyEvents(since, baseDir, verbose);
}

// ─── Cursor composer transcripts (~/.cursor/projects/**/agent-transcripts/*.jsonl) ─────

interface CursorComposerHeader {
  composerId: string;
  name: string | null;
  workspacePath: string | null;
  lastUpdatedAt: string | null;
}

interface CursorTranscriptLine {
  role?: string;
  message?: {
    content?: unknown;
  };
}

export interface CursorTranscriptTurn {
  turnId: string;
  sessionId: string;
  filePath: string;
  fileSize: number;
  /** SHA-256 prefix (32 hex chars) of the JSONL content — preferred over fileSize for change detection. */
  contentHash?: string;
  workspacePath: string | null;
  composerName: string | null;
  occurredAt: string;
  promptText: string;
  assistantText: string;
  tokensIn: number;
  tokensOut: number;
  riskLevel: RiskLevel;
  riskScore: number;
  riskCategories: string[];
}

function extractContentText(content: unknown): string[] {
  if (typeof content === "string") return [content];
  if (!Array.isArray(content)) return [];
  return content.flatMap((block) => {
    if (typeof block !== "object" || block === null) return [];
    const { type, text } = block as Record<string, unknown>;
    return type === "text" && typeof text === "string" ? [text] : [];
  });
}

function stripUserQueryWrapper(text: string): string {
  return text
    .replace(/<user_query>\s*/g, "")
    .replace(/\s*<\/user_query>/g, "")
    .trim();
}

function estimateTokens(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return Math.max(1, Math.ceil(trimmed.length / 4));
}

function toIsoFromMs(value: unknown): string | null {
  if (typeof value !== "number" || Number.isNaN(value) || value <= 0) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function readComposerHeaders(baseDir?: string): Map<string, CursorComposerHeader> {
  const userDir = baseDir ?? cursorUserDir();
  const dbPath = join(userDir, "globalStorage", "state.vscdb");
  let db: Database.Database | null = null;

  try {
    db = new Database(dbPath, { readonly: true });
    if (!tableExists(db, STATE_TABLE)) return new Map();

    const row = db
      .prepare(`SELECT value FROM ${STATE_TABLE} WHERE key = ?`)
      .get("composer.composerHeaders") as { value: string } | undefined;
    if (!row) return new Map();

    const parsed = JSON.parse(row.value) as unknown;
    if (typeof parsed !== "object" || parsed === null) return new Map();
    const allComposers = (parsed as Record<string, unknown>).allComposers;
    if (!Array.isArray(allComposers)) return new Map();

    const headers = new Map<string, CursorComposerHeader>();
    for (const entry of allComposers) {
      if (typeof entry !== "object" || entry === null) continue;
      const composer = entry as Record<string, unknown>;
      const composerId =
        typeof composer.composerId === "string" && composer.composerId.length > 0
          ? composer.composerId
          : null;
      if (!composerId) continue;

      const workspaceIdentifier =
        typeof composer.workspaceIdentifier === "object" && composer.workspaceIdentifier !== null
          ? (composer.workspaceIdentifier as Record<string, unknown>)
          : null;
      const uri =
        workspaceIdentifier &&
        typeof workspaceIdentifier.uri === "object" &&
        workspaceIdentifier.uri !== null
          ? (workspaceIdentifier.uri as Record<string, unknown>)
          : null;

      headers.set(composerId, {
        composerId,
        name: typeof composer.name === "string" ? composer.name : null,
        workspacePath: typeof uri?.fsPath === "string" ? uri.fsPath : null,
        lastUpdatedAt: toIsoFromMs(composer.lastUpdatedAt),
      });
    }

    return headers;
  } catch {
    return new Map();
  } finally {
    db?.close();
  }
}

export function findCursorTranscriptFiles(projectDirs?: string[]): string[] {
  const dirs = projectDirs ?? [cursorProjectsDir()];
  const files: string[] = [];

  for (const dir of dirs) {
    try {
      files.push(
        ...glob.sync("**/agent-transcripts/*/*.jsonl", {
          cwd: dir,
          absolute: true,
        })
      );
    } catch {
      // directory missing — skip
    }
  }

  return [...new Set(files)];
}

/**
 * Decode a Cursor project directory name back to the original workspace path.
 * Cursor encodes workspace paths as `absolutePath.slice(1).replace(/\//g, '-')`,
 * which is ambiguous when directories contain literal hyphens. We resolve the
 * ambiguity by backtracking: at each '-', try treating it as a path separator
 * first (only if the current prefix exists on disk), then as a literal hyphen.
 */
function decodeProjectDirName(encodedName: string): string | null {
  function bt(pos: number, current: string): string | null {
    if (pos === encodedName.length) {
      return existsSync("/" + current) ? "/" + current : null;
    }
    const ch = encodedName[pos];
    if (ch !== "-") return bt(pos + 1, current + ch);
    if (existsSync("/" + current)) {
      const res = bt(pos + 1, current + "/");
      if (res) return res;
    }
    return bt(pos + 1, current + "-");
  }
  return bt(0, "");
}

/**
 * Derive the workspace path from a transcript file path when the composer
 * header doesn't carry a workspacePath. The transcript lives at:
 *   ~/.cursor/projects/<encoded-workspace>/agent-transcripts/<session>/<session>.jsonl
 * Going up three directories yields the encoded project dir, which we decode.
 * Returns null on Windows (encoding differs) or if the path can't be resolved.
 */
function workspaceFromTranscriptFile(filePath: string): string | null {
  if (process.platform === "win32") return null;
  const projectDir = dirname(dirname(dirname(filePath)));
  const projectsDir = cursorProjectsDir();
  if (!projectDir.startsWith(projectsDir)) return null;
  return decodeProjectDirName(basename(projectDir));
}

/** Skip JSONL files larger than this to avoid memory pressure on extremely long sessions. */
const MAX_TRANSCRIPT_BYTES = 50 * 1024 * 1024; // 50 MB

export async function parseCursorTranscriptFile(
  filePath: string,
  composerHeaders: Map<string, CursorComposerHeader>,
  verbose = false
): Promise<CursorTranscriptTurn[]> {
  let fileSize = 0;
  let occurredAt = new Date().toISOString();

  try {
    const stat = statSync(filePath);
    fileSize = stat.size;
    occurredAt = stat.mtime.toISOString();
  } catch {
    return [];
  }

  if (fileSize > MAX_TRANSCRIPT_BYTES) {
    if (verbose) {
      console.warn(`[warn][cursor] ${filePath} exceeds ${MAX_TRANSCRIPT_BYTES / 1024 / 1024} MB limit — skipping`);
    }
    return [];
  }

  const sessionId = basename(filePath, ".jsonl");
  const header = composerHeaders.get(sessionId);
  if (header?.lastUpdatedAt) occurredAt = header.lastUpdatedAt;

  const turns: CursorTranscriptTurn[] = [];
  let currentPromptParts: string[] = [];
  let currentAssistantParts: string[] = [];
  let turnIndex = 0;
  const hasher = createHash("sha256");
  const stream = createReadStream(filePath, { encoding: "utf-8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  const finalizeTurn = (): void => {
    const promptText = currentPromptParts.join("\n\n").trim();
    const assistantText = currentAssistantParts.join("\n\n").trim();
    if (!promptText && !assistantText) return;

    const risk = scanText(promptText);
    turnIndex += 1;
    turns.push({
      turnId: `${sessionId}:${turnIndex}`,
      sessionId,
      filePath,
      fileSize,
      workspacePath: header?.workspacePath ?? workspaceFromTranscriptFile(filePath),
      composerName: header?.name ?? null,
      occurredAt,
      promptText,
      assistantText,
      tokensIn: estimateTokens(promptText),
      tokensOut: estimateTokens(assistantText),
      riskLevel: risk.risk_level,
      riskScore: risk.risk_score,
      riskCategories: risk.risk_categories,
    });
  };

  let lineNumber = 0;
  try {
    for await (const line of rl) {
      lineNumber++;
      hasher.update(line + "\n");
      const trimmed = line.trim();
      if (!trimmed) continue;

      let entry: CursorTranscriptLine;
      try {
        entry = JSON.parse(trimmed) as CursorTranscriptLine;
      } catch {
        if (verbose) {
          console.warn(`[warn] ${filePath}:${lineNumber} — invalid JSON, skipping`);
        }
        continue;
      }

      const texts = extractContentText(entry.message?.content);
      if (texts.length === 0) continue;

      if (entry.role === "user") {
        if (currentPromptParts.length > 0 || currentAssistantParts.length > 0) {
          finalizeTurn();
          currentPromptParts = [];
          currentAssistantParts = [];
        }
        currentPromptParts.push(...texts.map(stripUserQueryWrapper).filter((text) => text.length > 0));
      } else if (entry.role === "assistant") {
        currentAssistantParts.push(...texts.map((text) => text.trim()).filter((text) => text.length > 0));
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
    return [];
  }

  finalizeTurn();
  const contentHash = hasher.digest("hex").slice(0, 32);
  for (const t of turns) t.contentHash = contentHash;
  return turns;
}

export async function readCursorTranscriptSessions(
  cursorUserBaseDir?: string,
  transcriptProjectDirs?: string[],
  verbose = false
): Promise<CursorTranscriptTurn[]> {
  const composerHeaders = readComposerHeaders(cursorUserBaseDir);
  const files = findCursorTranscriptFiles(transcriptProjectDirs);
  const sessions = await Promise.all(
    files.map((filePath) => parseCursorTranscriptFile(filePath, composerHeaders, verbose))
  );
  return sessions.flat();
}

// ─── Mapper ──────────────────────────────────────────────────────────────────

const LINE_COST_MODEL = "estimated_line_count" as const;
const TOKEN_COST_MODEL = "token_count" as const;
const TRANSCRIPT_COST_MODEL = "estimated_transcript_text" as const;
export const HOOK_COST_MODEL = "cursor_hook" as const;

type CursorLineCostModel = typeof LINE_COST_MODEL;
type CursorTokenCostModel = typeof TOKEN_COST_MODEL;
export type CursorHookCostModel = typeof HOOK_COST_MODEL;

export interface PricingConfig {
  tokens_per_line: number;
  completion_output_per_mtok: number;
  chat_input_per_mtok: number;
  chat_output_per_mtok: number;
}

export const DEFAULT_CURSOR_PRICING: PricingConfig = {
  tokens_per_line: 15,
  completion_output_per_mtok: 0.6,
  chat_input_per_mtok: 3.0,
  chat_output_per_mtok: 15.0,
};

export type Db90CursorPayloadMetadata = {
  session_id?: string;
  cursor_session_id: string | null;
  workspace: string;
  workspace_scope?: WorkspaceScope;
  workspace_folder?: string;
  cost_model: CursorLineCostModel | CursorTokenCostModel | typeof TRANSCRIPT_COST_MODEL | CursorHookCostModel;
  scannable: boolean;
  risk_level: RiskLevel | "none";
  source?: "recent_commit";
  transcript_source?: "agent_transcript";
  composer_name?: string;
  prompt_text?: string;
  assistant_text?: string;
  risk_categories?: string[];
  risk_score?: number;
  commit_hash?: string;
  commit_message?: string;
  repo_name?: string;
  branch_name?: string;
  ai_percentage?: number;
  // cursor_hook path fields
  ingest_source?: "cursor_hook";
  hook_event_name?: string;
  generation_id?: string;
  hook_tool_name?: string;
  duration_ms?: number;
};

export interface CursorDb90Payload extends IngestPayload {
  tool_name: "cursor";
  event_type: "completion" | "chat" | "commit";
  model: string;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  occurred_at: string;
  project_id?: string;
  metadata: Db90CursorPayloadMetadata;
}

const EPOCH_SECONDS_THRESHOLD = 1e12;

export function toEpochMs(timestamp: number | string | null | undefined): number | null {
  if (timestamp == null) return null;
  const num = typeof timestamp === "string" ? Number(timestamp) : timestamp;
  if (isNaN(num)) return null;
  return num < EPOCH_SECONDS_THRESHOLD ? num * 1000 : num;
}

function toIsoString(timestamp: number | string | null | undefined): string | null {
  const ms = toEpochMs(timestamp);
  if (ms === null) return null;
  const date = new Date(ms);
  if (isNaN(date.getTime())) return null;
  return date.toISOString();
}

const nn = (n: number): number => (n > 0 ? n : 0);

function computeLineCost(eventType: "completion" | "chat", lines: number, pricing: PricingConfig): number {
  const safeLines = Math.max(0, lines);
  const tokensPerLine = nn(pricing.tokens_per_line);
  if (eventType === "completion") {
    return (safeLines * tokensPerLine * nn(pricing.completion_output_per_mtok)) / 1_000_000;
  }
  return (
    (safeLines * tokensPerLine * (nn(pricing.chat_output_per_mtok) + nn(pricing.chat_input_per_mtok) * 2)) /
    1_000_000
  );
}

function computeTokenCost(
  eventType: "completion" | "chat",
  tokensIn: number,
  tokensOut: number,
  pricing: PricingConfig
): number {
  const safeIn = Math.max(0, tokensIn);
  const safeOut = Math.max(0, tokensOut);
  if (eventType === "completion") {
    return (safeOut * nn(pricing.completion_output_per_mtok)) / 1_000_000;
  }
  return (safeIn * nn(pricing.chat_input_per_mtok) + safeOut * nn(pricing.chat_output_per_mtok)) / 1_000_000;
}

function pick(obj: unknown, ...keys: string[]): number | null {
  let cur: unknown = obj;
  for (const k of keys) {
    if (typeof cur !== "object" || cur === null) return null;
    cur = (cur as Record<string, unknown>)[k];
  }
  return typeof cur === "number" ? cur : null;
}

function buildPayload(opts: {
  eventType: "completion" | "chat";
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  occurredAt: string;
  dbPath: string;
  model?: string;
  projectId?: string;
  costModel?: CursorLineCostModel | CursorTokenCostModel;
}): CursorDb90Payload {
  const {
    eventType,
    tokensIn,
    tokensOut,
    costUsd,
    occurredAt,
    dbPath,
    model = "unknown",
    projectId,
    costModel = LINE_COST_MODEL,
  } = opts;
  const payload: CursorDb90Payload = {
    tool_name: "cursor",
    event_type: eventType,
    model,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    cost_usd: costUsd,
    occurred_at: occurredAt,
    metadata: {
      cursor_session_id: null,
      ...cursorWorkspaceMetadata(dbPath),
      cost_model: costModel,
      scannable: false,
      risk_level: "none",
    },
  };
  if (projectId) payload.project_id = projectId;
  return payload;
}

export function mapDailyStats(
  entry: DailyStatsEntry,
  projectId?: string,
  pricing: PricingConfig = DEFAULT_CURSOR_PRICING,
  model?: string
): CursorDb90Payload[] {
  const { date, value, dbPath } = entry;
  const occurredAt = `${date}T00:00:00.000Z`;
  const results: CursorDb90Payload[] = [];

  if (typeof value !== "object" || value === null) return results;

  const obj = value as Record<string, unknown>;

  const tabSuggested = pick(obj, "tabSuggestedLines") ?? 0;
  const tabAccepted = pick(obj, "tabAcceptedLines") ?? 0;
  const composerSuggested = pick(obj, "composerSuggestedLines") ?? 0;
  const composerAccepted = pick(obj, "composerAcceptedLines") ?? 0;

  if (tabSuggested > 0 || tabAccepted > 0) {
    results.push(
      buildPayload({
        eventType: "completion",
        tokensIn: tabSuggested,
        tokensOut: tabAccepted,
        costUsd: computeLineCost("completion", tabSuggested, pricing),
        occurredAt,
        dbPath,
        model,
        projectId,
      })
    );
  }

  if (composerSuggested > 0 || composerAccepted > 0) {
    results.push(
      buildPayload({
        eventType: "chat",
        tokensIn: composerSuggested,
        tokensOut: composerAccepted,
        costUsd: computeLineCost("chat", composerSuggested, pricing),
        occurredAt,
        dbPath,
        model,
        projectId,
      })
    );
  }

  if (results.length > 0) return results;

  const KNOWN_NON_MODEL_KEYS = new Set(["tab", "composer", "chat", "date", "inputTokens", "outputTokens"]);
  for (const [model, stats] of Object.entries(obj)) {
    if (KNOWN_NON_MODEL_KEYS.has(model) || typeof stats !== "object" || stats === null) continue;
    const tokensIn = pick(stats, "inputTokens") ?? pick(stats, "promptTokens") ?? 0;
    const tokensOut = pick(stats, "outputTokens") ?? pick(stats, "generatedTokens") ?? 0;
    if (tokensIn === 0 && tokensOut === 0) continue;
    results.push(
      buildPayload({
        eventType: "chat",
        tokensIn,
        tokensOut,
        costUsd: computeTokenCost("chat", tokensIn, tokensOut, pricing),
        occurredAt,
        dbPath,
        model,
        projectId,
        costModel: TOKEN_COST_MODEL,
      })
    );
  }

  return results;
}

/**
 * Maps Cursor’s latest-commit snapshot (`aiCodeTracking.recentCommit`) to a single commit-classified event.
 * Cursor only keeps one recent commit row (overwritten on each new commit).
 * Line-cost math still follows the chat-style line proxy (`computeLineCost("chat", …)`); only `event_type` differs.
 */
export function mapRecentCommit(
  entry: RecentCommitSnapshot,
  projectId?: string,
  pricing: PricingConfig = DEFAULT_CURSOR_PRICING,
  model?: string
): CursorDb90Payload | null {
  const { value: obj, dbPath } = entry;
  const occurredAt = toIsoString(obj.timestamp as number | string | null | undefined);
  if (!occurredAt) return null;

  const la = Number(obj.linesAdded) || 0;
  const ld = Number(obj.linesDeleted) || 0;
  const tla = Number(obj.tabLinesAdded) || 0;
  const tld = Number(obj.tabLinesDeleted) || 0;
  const cla = Number(obj.composerLinesAdded) || 0;
  const cld = Number(obj.composerLinesDeleted) || 0;
  const linesAddedProxy = la + tla + cla;
  const linesDeletedProxy = ld + tld + cld;
  if (linesAddedProxy === 0 && linesDeletedProxy === 0) return null;
  const lineForCost = linesAddedProxy + linesDeletedProxy;
  const costUsd = computeLineCost("chat", Math.max(lineForCost, 0), pricing);

  const commitHash = obj.commitHash;
  const commitMessage = obj.commitMessage;
  const repoName = obj.repoName;
  const branchName = obj.branchName;
  const aiPct = obj.aiPercentage;

  const payload: CursorDb90Payload = {
    tool_name: "cursor",
    event_type: "commit",
    model: model ?? "unknown",
    tokens_in: linesAddedProxy,
    tokens_out: linesDeletedProxy,
    cost_usd: costUsd,
    occurred_at: occurredAt,
    metadata: {
      cursor_session_id: null,
      ...cursorWorkspaceMetadata(dbPath),
      cost_model: LINE_COST_MODEL,
      source: "recent_commit",
      commit_hash: typeof commitHash === "string" ? commitHash : undefined,
      commit_message: typeof commitMessage === "string" ? commitMessage : undefined,
      repo_name: typeof repoName === "string" ? repoName : undefined,
      branch_name: typeof branchName === "string" ? branchName : undefined,
      ai_percentage:
        typeof aiPct === "number"
          ? aiPct
          : typeof aiPct === "string"
            ? parseFloat(aiPct) || undefined
            : undefined,
      scannable: false,
      risk_level: "none",
    },
  };
  if (projectId) payload.project_id = projectId;
  return payload;
}

export function mapEvent(
  row: CursorRow,
  workspacePath: string,
  projectId?: string,
  pricing: PricingConfig = DEFAULT_CURSOR_PRICING
): CursorDb90Payload | null {
  const occurredAt = toIsoString(row.timestamp);
  if (!occurredAt) return null;

  const model = row.model;
  if (!model) return null;

  const eventType: "completion" | "chat" = row.type === 1 ? "chat" : "completion";
  const tokensIn = row.promptTokens ?? 0;
  const tokensOut = row.generatedTokens ?? 0;

  const payload: CursorDb90Payload = {
    tool_name: "cursor",
    event_type: eventType,
    model,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    cost_usd: computeTokenCost(eventType, tokensIn, tokensOut, pricing),
    occurred_at: occurredAt,
    metadata: {
      cursor_session_id: row.sessionId ?? row.requestId ?? null,
      ...cursorWorkspaceMetadataFromStorageDir(workspacePath),
      cost_model: TOKEN_COST_MODEL,
      scannable: false,
      risk_level: "none",
    },
  };
  if (projectId) payload.project_id = projectId;
  return payload;
}

export function mapTranscriptTurn(
  turn: CursorTranscriptTurn,
  projectId?: string,
  pricing: PricingConfig = DEFAULT_CURSOR_PRICING,
  model?: string
): CursorDb90Payload {
  const payload: CursorDb90Payload = {
    tool_name: "cursor",
    event_type: "chat",
    model: model ?? "unknown",
    tokens_in: turn.tokensIn,
    tokens_out: turn.tokensOut,
    cost_usd: computeTokenCost("chat", turn.tokensIn, turn.tokensOut, pricing),
    occurred_at: turn.occurredAt,
    metadata: {
      session_id: turn.turnId,
      cursor_session_id: turn.sessionId,
      workspace: turn.workspacePath ?? turn.filePath,
      cost_model: TRANSCRIPT_COST_MODEL,
      scannable: true,
      risk_level: turn.riskLevel,
      risk_categories: turn.riskCategories,
      risk_score: turn.riskScore,
      transcript_source: "agent_transcript",
      composer_name: turn.composerName ?? undefined,
      prompt_text: turn.promptText || undefined,
      assistant_text: turn.assistantText || undefined,
    },
  };
  if (projectId) payload.project_id = projectId;
  return payload;
}
