export interface ExchangeResult {
  ingestToken: string;
  ingestHost: string;
  organizationId: string;
}

export async function exchangeIngestToken(params: {
  /** DB90 API base URL, e.g. http://localhost:3000 */
  db90Host: string;
  keycloakAccessToken: string;
  toolName: string;
  deviceLabel?: string;
  fetchImpl?: typeof fetch;
}): Promise<ExchangeResult> {
  const fetchFn = params.fetchImpl ?? fetch;
  const base = params.db90Host.replace(/\/$/, "");
  const url = `${base}/api/v1/integrations/mcp/exchange`;
  const body: Record<string, string> = {
    tool_name: params.toolName,
  };
  if (params.deviceLabel) {
    body.device_label = params.deviceLabel;
  }
  const res = await fetchFn(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.keycloakAccessToken}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch {
    throw new Error(`DB90 exchange: invalid JSON (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    throw new Error(`DB90 exchange failed (HTTP ${res.status}): ${text.slice(0, 500)}`);
  }
  const root = json as Record<string, unknown>;
  const data = root["data"];
  if (typeof data !== "object" || data === null) {
    throw new Error("DB90 exchange: missing data object");
  }
  const d = data as Record<string, unknown>;
  const ingestToken = d["ingestToken"];
  const ingestHost = d["ingestHost"];
  const organizationId = d["organizationId"];
  if (typeof ingestToken !== "string" || typeof ingestHost !== "string" || typeof organizationId !== "string") {
    throw new Error("DB90 exchange: missing ingestToken, ingestHost, or organizationId in data");
  }
  return { ingestToken, ingestHost, organizationId };
}
