import { chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAppDir } from "../state.js";

/** Ingest tool IDs that MCP can provision tokens for via `/integrations/mcp/exchange`. */
export type TelemetryToolId = "claude_code" | "cursor";

/** Normalized persisted credentials (v2); all accounts share one ingest host namespace. */
export interface StoredCredentials {
  host: string;
  organizationId?: string;
  accounts: Partial<Record<TelemetryToolId, string>>;
}

export const KEYTAR_SERVICE = "db90-mcp";
const KEYTAR_ACCOUNT = "db90-ingest-credential";

function credentialsPath(appDir: string): string {
  return join(appDir, "credentials.json");
}

function keytarDisabled(): boolean {
  return ["1", "true", "yes"].includes(process.env["DB90_MCP_DISABLE_KEYTAR"]?.toLowerCase() ?? "");
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
  try {
    const raw = JSON.parse(readFileSync(filePath, "utf-8")) as unknown;
    return normalizeLoadedCredentials(raw);
  } catch {
    return null;
  }
}

async function tryKeytarGet(): Promise<StoredCredentials | null> {
  if (keytarDisabled()) return null;
  try {
    const keytar = await import("keytar");
    const raw = await keytar.default.getPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return normalizeLoadedCredentials(parsed);
  } catch {
    return null;
  }
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
  } catch {
    // ignore
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
  };
  writeFileSync(filePath, `${JSON.stringify(body, null, 2)}\n`, {
    encoding: "utf-8",
    mode: 0o600,
  });
  if (process.platform !== "win32") {
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
    } catch {
      // ignore
    }
  }
}

/** Prefer OS keychain when keytar works; otherwise read `credentials.json`. */
export async function loadCredentials(appDir: string = getAppDir()): Promise<StoredCredentials | null> {
  const fromFile = loadCredentialsFromFileOnly(appDir);
  if (fromFile) return fromFile;

  const fromKeytar = await tryKeytarGet();
  if (fromKeytar) return fromKeytar;
  return null;
}

/**
 * Persist multi-tool ingest tokens for one host namespace.
 */
export async function saveStoredCredentials(creds: StoredCredentials, appDir: string = getAppDir()): Promise<void> {
  if (!credentialsHaveAnyToken(creds)) {
    throw new Error("saveStoredCredentials requires at least one account token");
  }
  const payload = JSON.stringify({ version: 2, ...creds, accounts: { ...creds.accounts } });
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
