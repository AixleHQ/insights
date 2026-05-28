import { loadBaseConfig } from "@db90/sdk";
import { APP_DIR } from "../src/state.js";

export interface IngestConfig {
  host: string;
  token: string;
}

/** Same precedence as `db90-cursor` CLI: env vars, then ~/.db90-cursor/config.json. */
export function resolveIngestConfig(): IngestConfig | null {
  const file = loadBaseConfig(APP_DIR);
  const host = process.env.DB90_HOST ?? file.host;
  const token = process.env.DB90_TOKEN ?? file.token;
  if (!host || !token) return null;
  return { host, token };
}

export function requireIngestConfig(): IngestConfig {
  const cfg = resolveIngestConfig();
  if (cfg) return cfg;

  console.error(`Missing ingest credentials. Use one of:
  • export DB90_HOST=<url> DB90_TOKEN=db90_<token>
  • ~/.db90-cursor/config.json with { "host": "...", "token": "..." }
  • Local API: host http://localhost:3000 (token from Settings → Integrations → Cursor)`);
  process.exit(1);
}
