import { resolveDb90IngestHost } from "@/lib/ingest-host";

/** Shown in copy-paste examples when the user must substitute a real ingest token. */
export const DB90_CLI_INGEST_TOKEN_PLACEHOLDER = "<YOUR_INGEST_TOKEN>";

/** `npx -y @aixle/insights` with required flags (token from Settings → Tools or Integration Connect). */
export function buildDb90ClaudeIngestCommand(token: string): string {
  return `npx -y @aixle/insights --token ${token} --host ${resolveDb90IngestHost()}`;
}

/** `npx -y @aixle/insights` with required flags. */
export function buildDb90CursorIngestCommand(token: string): string {
  return `npx -y @aixle/insights --token ${token} --host ${resolveDb90IngestHost()}`;
}

export function buildDb90ClaudeIngestExampleCommand(): string {
  return buildDb90ClaudeIngestCommand(DB90_CLI_INGEST_TOKEN_PLACEHOLDER);
}

export function buildDb90CursorIngestExampleCommand(): string {
  return buildDb90CursorIngestCommand(DB90_CLI_INGEST_TOKEN_PLACEHOLDER);
}
