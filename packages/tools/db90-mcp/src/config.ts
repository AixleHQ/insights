import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { APP_DIR } from "./log.js";

export interface Config {
  host: string;
  keycloakIssuer: string;
  defaultToolName: "claude_code" | "cursor";
}

const CONFIG_FILE = join(APP_DIR, "config.json");

const DEFAULTS: Config = {
  host: "https://app.db90.io",
  keycloakIssuer: "https://app.db90.io/auth/realms/db90",
  defaultToolName: "claude_code",
};

export function loadConfig(): Config {
  if (!existsSync(CONFIG_FILE)) return { ...DEFAULTS };
  try {
    const parsed = JSON.parse(readFileSync(CONFIG_FILE, "utf8")) as unknown;
    if (typeof parsed !== "object" || parsed === null) return { ...DEFAULTS };
    const obj = parsed as Partial<Config>;
    return {
      host: typeof obj.host === "string" ? obj.host : DEFAULTS.host,
      keycloakIssuer:
        typeof obj.keycloakIssuer === "string" ? obj.keycloakIssuer : DEFAULTS.keycloakIssuer,
      defaultToolName:
        obj.defaultToolName === "cursor" ? "cursor" : DEFAULTS.defaultToolName,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function ensureConfigFile(): Config {
  if (existsSync(CONFIG_FILE)) return loadConfig();
  mkdirSync(APP_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULTS, null, 2), { encoding: "utf8" });
  return { ...DEFAULTS };
}
