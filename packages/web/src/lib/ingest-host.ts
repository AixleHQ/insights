/**
 * Host origin for Aixle Insights standalone CLIs (`--host`) and MCP `init --host`.
 * Matches the logic previously inlined in IngestTokenConnectSheet: shell tools
 * need a real API base when the web app is served from a different origin than the API.
 */
export function resolveDb90IngestHost(): string {
  const ingestBase = import.meta.env.VITE_INGEST_BASE_URL;
  if (ingestBase) return String(ingestBase);
  const apiBase = import.meta.env.VITE_API_URL ?? "/api/v1";
  if (apiBase.startsWith("http")) {
    return String(apiBase).replace(/\/api\/v1\/?$/, "");
  }
  return window.location.origin;
}
