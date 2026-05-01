import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { APP_DIR } from "./log.js";

const SERVICE = "db90-mcp";
const ACCOUNT = "ingest-token";
const FALLBACK_FILE = join(APP_DIR, "credentials.json");

interface KeytarLike {
  setPassword(service: string, account: string, password: string): Promise<void>;
  getPassword(service: string, account: string): Promise<string | null>;
  deletePassword(service: string, account: string): Promise<boolean>;
}

let keytar: KeytarLike | null = null;
let keytarLoadAttempted = false;

async function loadKeytar(): Promise<KeytarLike | null> {
  if (keytarLoadAttempted) return keytar;
  keytarLoadAttempted = true;
  try {
    const mod = (await import("keytar")) as KeytarLike | { default: KeytarLike };
    keytar = "default" in mod ? mod.default : mod;
  } catch {
    keytar = null;
  }
  return keytar;
}

function readFallback(): { ingestToken: string; host: string } | null {
  if (!existsSync(FALLBACK_FILE)) return null;
  try {
    const parsed = JSON.parse(readFileSync(FALLBACK_FILE, "utf8")) as unknown;
    if (typeof parsed !== "object" || parsed === null) return null;
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.ingestToken !== "string" || typeof obj.host !== "string") return null;
    return { ingestToken: obj.ingestToken, host: obj.host };
  } catch {
    return null;
  }
}

function writeFallback(data: { ingestToken: string; host: string }): void {
  mkdirSync(APP_DIR, { recursive: true });
  writeFileSync(FALLBACK_FILE, JSON.stringify(data, null, 2), { encoding: "utf8" });
  try {
    chmodSync(FALLBACK_FILE, 0o600);
  } catch {
    // chmod is best-effort on Windows
  }
}

export async function saveCredentials(ingestToken: string, host: string): Promise<void> {
  const k = await loadKeytar();
  if (k) {
    await k.setPassword(SERVICE, ACCOUNT, JSON.stringify({ ingestToken, host }));
    return;
  }
  writeFallback({ ingestToken, host });
}

export async function loadCredentials(): Promise<{ ingestToken: string; host: string } | null> {
  const k = await loadKeytar();
  if (k) {
    const raw = await k.getPassword(SERVICE, ACCOUNT);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed !== "object" || parsed === null) return null;
      const obj = parsed as Record<string, unknown>;
      if (typeof obj.ingestToken !== "string" || typeof obj.host !== "string") return null;
      return { ingestToken: obj.ingestToken, host: obj.host };
    } catch {
      return null;
    }
  }
  return readFallback();
}

export async function clearCredentials(): Promise<void> {
  const k = await loadKeytar();
  if (k) {
    await k.deletePassword(SERVICE, ACCOUNT);
    return;
  }
  if (existsSync(FALLBACK_FILE)) {
    writeFileSync(FALLBACK_FILE, "{}", { encoding: "utf8" });
  }
}
