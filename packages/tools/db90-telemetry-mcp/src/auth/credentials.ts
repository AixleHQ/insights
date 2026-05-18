import { chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAppDir } from "../state.js";

export interface Credentials {
  token: string;
  host: string;
}

const KEYTAR_SERVICE = "db90-mcp";
const KEYTAR_ACCOUNT = "db90-ingest-credential";

function credentialsPath(appDir: string): string {
  return join(appDir, "credentials.json");
}

function keytarDisabled(): boolean {
  return ["1", "true", "yes"].includes(process.env["DB90_MCP_DISABLE_KEYTAR"]?.toLowerCase() ?? "");
}

function parseCredentialsJson(raw: unknown): Credentials | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const token = o.token;
  const host = o.host;
  if (typeof token === "string" && token.length > 0 && typeof host === "string" && host.length > 0) {
    return { token, host };
  }
  return null;
}

export function loadCredentialsFromFileOnly(appDir: string = getAppDir()): Credentials | null {
  const filePath = credentialsPath(appDir);
  if (!existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(readFileSync(filePath, "utf-8")) as unknown;
    return parseCredentialsJson(raw);
  } catch {
    return null;
  }
}

async function tryKeytarGet(): Promise<Credentials | null> {
  if (keytarDisabled()) return null;
  try {
    const keytar = await import("keytar");
    const raw = await keytar.default.getPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return parseCredentialsJson(parsed);
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

function writeFileCredential(appDir: string, creds: Credentials): void {
  mkdirSync(appDir, { recursive: true });
  const filePath = credentialsPath(appDir);
  writeFileSync(filePath, `${JSON.stringify({ token: creds.token, host: creds.host }, null, 2)}\n`, {
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
export async function loadCredentials(appDir: string = getAppDir()): Promise<Credentials | null> {
  const fromFile = loadCredentialsFromFileOnly(appDir);
  if (fromFile) return fromFile;

  const fromKeytar = await tryKeytarGet();
  if (fromKeytar) return fromKeytar;
  return null;
}

/** Persists ingest token + host. Tries keytar first; writes chmod-0600 JSON only as fallback. */
export async function saveCredentials(token: string, host: string, appDir: string = getAppDir()): Promise<void> {
  const creds: Credentials = { token, host };
  const payload = JSON.stringify(creds);
  const keytarOk = await tryKeytarSet(payload);
  if (keytarOk) {
    removeFileCredential(appDir);
  } else {
    await tryKeytarDelete();
    writeFileCredential(appDir, creds);
  }
}

export async function clearCredentials(appDir: string = getAppDir()): Promise<void> {
  await tryKeytarDelete();
  removeFileCredential(appDir);
}
