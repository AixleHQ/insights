import { resolveAixleIngestHost, resolveAixleKeycloakIssuer } from "@/lib/ingest-host";

/** `npx -y @aixle/insights init` with the flags required for MCP device-flow setup. */
export function buildAixleInsightsInitCommand(): string {
  return `npx -y @aixle/insights init --host ${resolveAixleIngestHost()} --keycloak-url ${resolveAixleKeycloakIssuer()}`;
}
