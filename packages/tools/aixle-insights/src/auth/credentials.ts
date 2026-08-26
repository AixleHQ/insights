import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { userInfo } from "node:os";
import { join } from "node:path";
import { getAppDir } from "../state.js";
import { mcpLog } from "../log.js";
import { describeReadFailure } from "../lib/parse-error.js";
import { readBooleanEnvWithDeprecatedAlias, warnDeprecatedEnvVar } from "../lib/env.js";

/** Ingest tool IDs that MCP can provision tokens for via `/integrations/mcp/exchange`. */
export type TelemetryToolId = "claude_code" | "cursor";

/** Normalized persisted credentials (v2); all accounts share one ingest host namespace. */
export interface StoredCredentials {
  host: string;
  organizationId?: string;
  accounts: Partial<Record<TelemetryToolId, string>>;
  /**
   * Set only when the user explicitly passed `init --insecure` for this host.
   * There is no `run --insecure` flag (by design — see README § Security), so
   * runtime sync honors this persisted consent instead of re-prompting.
   */
  insecureHttpAllowed?: boolean;
}

export const KEYTAR_SERVICE = "aixle-insights";
const KEYTAR_ACCOUNT = "aixle-insights-ingest-credential";

function credentialsPath(appDir: string): string {
  return join(appDir, "credentials.json");
}

function keytarDisabled(): boolean {
  return readBooleanEnvWithDeprecatedAlias({
    current: "AIXLE_INSIGHTS_MCP_DISABLE_KEYTAR",
    deprecated: "DB90_MCP_DISABLE_KEYTAR",
    onDeprecatedUse: warnDeprecatedEnvVar,
  });
}

/** Returns true when at least one tool has a non-empty token. */
export function credentialsHaveAnyToken(creds: StoredCredentials): boolean {
  const acc = creds.accounts;
  if (acc === null || acc === undefined || typeof acc !== "object") return false;
  return Object.values(acc).some((t) => typeof t === "string" && t.length > 0);
}

export function pickProjectLookupToken(creds: StoredCredentials): string | null {
  return creds.accounts.claude_code ?? creds.accounts.cursor ?? null;
}

function normalizeLoadedCredentials(raw: unknown): StoredCredentials | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const host = o.host;

  const v = o.version;
  if (v === 2) {
    const acc = o.accounts;
    if (typeof host !== "string" || host.length === 0) return null;
    if (typeof acc !== "object" || acc === null) return null;
    const accounts = acc as Record<string, unknown>;
    const out: Partial<Record<TelemetryToolId, string>> = {};
    for (const tid of ["claude_code", "cursor"] as const) {
      const tok = accounts[tid];
      if (typeof tok === "string" && tok.length > 0) out[tid] = tok;
    }
    if (!credentialsHaveAnyToken({ host, accounts: out })) return null;
    const org = o.organizationId;
    return {
      host,
      accounts: out,
      organizationId: typeof org === "string" ? org : undefined,
      ...(o.insecureHttpAllowed === true ? { insecureHttpAllowed: true } : {}),
    };
  }

  const token = o.token;
  if (typeof token === "string" && token.length > 0 && typeof host === "string" && host.length > 0) {
    return { host, accounts: { claude_code: token } };
  }

  return null;
}

/** Read credentials from disk only (tests / fallback). */
export function loadCredentialsFromFileOnly(appDir: string = getAppDir()): StoredCredentials | null {
  const filePath = credentialsPath(appDir);
  if (!existsSync(filePath)) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(filePath, "utf-8")) as unknown;
  } catch (err) {
    // File exists (checked above) but is not readable/valid JSON — distinguishes tampering from "never created".
    mcpLog.warn("credentials_parse_failed", { path: filePath, ...describeReadFailure(err) }, false);
    return null;
  }
  const normalized = normalizeLoadedCredentials(raw);
  if (normalized === null) {
    // Valid JSON, but not a credential shape we accept. `normalizeLoadedCredentials` signals
    // rejection by returning null and never throws, so this cannot surface in the catch
    // above — without this branch a plausible-looking replacement file stays silent. (AIX-699)
    mcpLog.warn("credentials_parse_failed", { path: filePath, reason: "invalid_shape" }, false);
  }
  return normalized;
}

async function tryKeytarGet(): Promise<StoredCredentials | null> {
  if (keytarDisabled()) return null;
  let raw: string | null;
  try {
    const keytar = await import("keytar");
    raw = await keytar.default.getPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT);
  } catch {
    // Keytar unavailable (native module missing/unbuilt, no Secret Service, etc.) — silent fallback to file, same as tryKeytarSet.
    return null;
  }
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (err) {
    // Keychain entry exists (checked above) but is not valid JSON — distinguishes tampering from "no entry".
    mcpLog.warn(
      "credentials_keytar_parse_failed",
      { keytarService: KEYTAR_SERVICE, ...describeReadFailure(err) },
      false,
    );
    return null;
  }
  const normalized = normalizeLoadedCredentials(parsed);
  if (normalized === null) {
    // Same shape-rejection hole as the file path above. Fields stay service-only — never the
    // keychain payload. (AIX-699)
    mcpLog.warn("credentials_keytar_parse_failed", { keytarService: KEYTAR_SERVICE, reason: "invalid_shape" }, false);
  }
  return normalized;
}

async function tryKeytarSet(payload: string): Promise<boolean> {
  if (keytarDisabled()) return false;
  try {
    const keytar = await import("keytar");
    await keytar.default.setPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT, payload);
    return true;
  } catch {
    return false;
  }
}

async function tryKeytarDelete(): Promise<void> {
  if (keytarDisabled()) return;
  try {
    const keytar = await import("keytar");
    await keytar.default.deletePassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT);
  } catch (err) {
    // Non-fatal, but a stale keychain entry can mislead later loads — record it.
    mcpLog.warn(
      "keytar_delete_failed",
      { keytarService: KEYTAR_SERVICE, error: err instanceof Error ? err.message : String(err) },
      false,
    );
  }
}

/**
 * Best-effort NTFS ACL lock-down for the fallback credentials file on Windows.
 *
 * Node's file `mode` / `chmodSync` only toggle the read-only bit on Windows — they do NOT
 * map to NTFS ACLs — so the POSIX `0o600` we set on other platforms has no real effect there.
 * We shell out to the built-in `icacls` to drop inherited ACEs and grant only the current user
 * full control. Mirrors the POSIX `chmod` best-effort: any failure is swallowed (the user-profile
 * directory already blocks cross-user reads, and Windows Credential Manager — the preferred store
 * via keytar — makes this fallback file rare in the first place).
 */
function restrictWindowsAclBestEffort(filePath: string): void {
  try {
    const user = userInfo().username;
    if (!user) return;
    execFileSync("icacls", [filePath, "/inheritance:r", "/grant:r", `${user}:F`], {
      stdio: "ignore",
    });
  } catch {
    // best-effort, non-fatal — same posture as the POSIX chmod
  }
}

function writeFileCredential(appDir: string, creds: StoredCredentials): void {
  mkdirSync(appDir, { recursive: true });
  const filePath = credentialsPath(appDir);
  const body = {
    version: 2,
    host: creds.host,
    organizationId: creds.organizationId,
    accounts: { ...creds.accounts },
    ...(creds.insecureHttpAllowed ? { insecureHttpAllowed: true } : {}),
  };
  writeFileSync(filePath, `${JSON.stringify(body, null, 2)}\n`, {
    encoding: "utf-8",
    mode: 0o600,
  });
  if (process.platform === "win32") {
    restrictWindowsAclBestEffort(filePath);
  } else {
    try {
      chmodSync(filePath, 0o600);
    } catch {
      // ignore chmod failures on exotic FS
    }
  }
}

function removeFileCredential(appDir: string): void {
  const filePath = credentialsPath(appDir);
  if (existsSync(filePath)) {
    try {
      unlinkSync(filePath);
    } catch (err) {
      // A stale plaintext credentials.json left behind here is exactly the drift loadCredentials warns about.
      mcpLog.warn(
        "credentials_file_remove_failed",
        { path: filePath, error: err instanceof Error ? err.message : String(err) },
        false,
      );
    }
  }
}

/** Prefer the OS keychain when keytar works; fall back to `credentials.json`. */
export async function loadCredentials(appDir: string = getAppDir()): Promise<StoredCredentials | null> {
  const fromKeytar = await tryKeytarGet();
  if (fromKeytar) {
    // Keychain is the source of truth; a lingering file is stale and silently shadowed it before this fix.
    // Warn-only (log file, no stderr mirror): drift is recorded without spamming the background sync loop,
    // and the next saveStoredCredentials removes the file. We do not mutate disk on a read.
    if (existsSync(credentialsPath(appDir))) {
      mcpLog.warn(
        "credentials_file_shadowed_by_keychain",
        { path: credentialsPath(appDir), keytarService: KEYTAR_SERVICE },
        false,
      );
    }
    return fromKeytar;
  }

  const fromFile = loadCredentialsFromFileOnly(appDir);
  if (fromFile) return fromFile;
  return null;
}

/**
 * Persist multi-tool ingest tokens for one host namespace.
 */
export async function saveStoredCredentials(creds: StoredCredentials, appDir: string = getAppDir()): Promise<void> {
  if (!credentialsHaveAnyToken(creds)) {
    throw new Error("saveStoredCredentials requires at least one account token");
  }
  const payload = JSON.stringify({
    version: 2,
    host: creds.host,
    organizationId: creds.organizationId,
    accounts: { ...creds.accounts },
    ...(creds.insecureHttpAllowed ? { insecureHttpAllowed: true } : {}),
  });
  const keytarOk = await tryKeytarSet(payload);
  if (keytarOk) {
    removeFileCredential(appDir);
  } else {
    await tryKeytarDelete();
    writeFileCredential(appDir, creds);
  }
}

/** Back-compat: persists a Claude-only ingest token bundle. */
export async function saveCredentials(token: string, host: string, appDir: string = getAppDir()): Promise<void> {
  await saveStoredCredentials({ host, accounts: { claude_code: token } }, appDir);
}

export async function clearCredentials(appDir: string = getAppDir()): Promise<void> {
  await tryKeytarDelete();
  removeFileCredential(appDir);
}
