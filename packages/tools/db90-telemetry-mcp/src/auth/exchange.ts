export interface ExchangeAccount {
  ingestToken: string;
}

export interface ExchangeResult {
  ingestHost: string;
  organizationId: string;
  /** Present when exchanging a single tool (legacy shape). */
  ingestToken?: string;
  /** Per-tool ingest tokens (`claude_code`, `cursor`). */
  accounts: Partial<Record<"claude_code" | "cursor", ExchangeAccount>>;
}

type ExchangeToolId = "claude_code" | "cursor";

export async function exchangeIngestToken(params: {
  db90Host: string;
  keycloakAccessToken: string;
  /** Legacy single-tool mint. Omit when tools is provided. */
  toolName?: ExchangeToolId;
  /** Mint / rotate ingest tokens for all listed tools under one OAuth session. */
  tools?: readonly ExchangeToolId[];
  deviceLabel?: string;
  /** When set, sent as `X-Organization-ID` so the API scopes exchange to that membership. */
  exchangeOrganizationId?: string;
  fetchImpl?: typeof fetch;
}): Promise<ExchangeResult> {
  const fetchFn = params.fetchImpl ?? fetch;
  const requestedTools: ExchangeToolId[] =
    params.tools?.length ? [...params.tools] : params.toolName ? [params.toolName] : [];
  const base = params.db90Host.replace(/\/$/, "");
  const url = `${base}/api/v1/integrations/mcp/exchange`;
  const body: Record<string, unknown> = {};
  if (params.tools?.length) {
    body.tools = [...params.tools];
  } else if (params.toolName) {
    body.tool_name = params.toolName;
  } else {
    throw new Error("exchangeIngestToken: provide toolName or tools[]");
  }
  if (params.deviceLabel) {
    body.device_label = params.deviceLabel;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${params.keycloakAccessToken}`,
  };
  const orgHeader = params.exchangeOrganizationId?.trim();
  if (orgHeader) {
    headers["X-Organization-ID"] = orgHeader;
  }

  const res = await fetchFn(url, {
    method: "POST",
    headers,
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
  const ingestHost = d["ingestHost"];
  const organizationId = d["organizationId"];
  if (typeof ingestHost !== "string" || typeof organizationId !== "string") {
    throw new Error("DB90 exchange: missing ingestHost or organizationId in data");
  }

  const ingestTokenRaw = d["ingestToken"];
  const accountsRaw = d["accounts"];

  const accounts: Partial<Record<ExchangeToolId, ExchangeAccount>> = {};

  if (typeof accountsRaw === "object" && accountsRaw !== null && !Array.isArray(accountsRaw)) {
    for (const key of ["claude_code", "cursor"] as const) {
      const entry = (accountsRaw as Record<string, unknown>)[key];
      if (typeof entry === "object" && entry !== null) {
        const tok = (entry as Record<string, unknown>)["ingestToken"];
        if (typeof tok === "string" && tok.length > 0) {
          accounts[key] = { ingestToken: tok };
        }
      }
    }
  }

  let ingestToken: string | undefined =
    typeof ingestTokenRaw === "string" && ingestTokenRaw.length > 0 ? ingestTokenRaw : undefined;

  if (!ingestToken && Object.keys(accounts).length === 1) {
    const only = Object.values(accounts)[0];
    if (only?.ingestToken) ingestToken = only.ingestToken;
  }

  if (Object.keys(accounts).length === 0) {
    if (!ingestToken) {
      throw new Error("DB90 exchange: no ingestToken / accounts returned in data");
    }
    const fallbackTool = requestedTools.length === 1 ? requestedTools[0] : d["toolName"];
    const tid = fallbackTool === "cursor" ? "cursor" : "claude_code";
    accounts[tid] = { ingestToken };
  }

  const missingTools = requestedTools.filter((tool) => !accounts[tool]?.ingestToken);
  if (missingTools.length > 0) {
    throw new Error(`DB90 exchange: missing requested account(s): ${missingTools.join(", ")}`);
  }

  return { ingestHost, organizationId, ingestToken, accounts };
}
