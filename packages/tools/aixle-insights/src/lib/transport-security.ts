export type TransportSecurityResult =
  | { ok: true; warning?: string }
  | { ok: false; error: string };

export interface TransportSecurityOptions {
  allowInsecureHttp: boolean;
  label: string;
}

function isIpv4Loopback(hostname: string): boolean {
  const parts = hostname.split(".");
  if (parts.length !== 4) return false;
  const octets = parts.map((part) => Number(part));
  return octets.every((octet, index) =>
    Number.isInteger(octet) &&
    octet >= 0 &&
    octet <= 255 &&
    String(octet) === parts[index]
  ) && octets[0] === 127;
}

export function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    isIpv4Loopback(normalized);
}

function plaintextMessage(label: string, host: string, action: "reject" | "warn"): string {
  const prefix = `${label} ${host} uses remote plaintext HTTP`;
  const guidance = "Plaintext HTTP can expose ingest tokens and telemetry. Use HTTPS for remote hosts";
  if (action === "warn") {
    return `${prefix}. ${guidance}; --insecure should only be used for trusted non-production test endpoints.`;
  }
  return `${prefix}. ${guidance}, or pass --insecure only for a trusted non-production test endpoint.`;
}

export function evaluateTransportSecurity(
  rawUrl: string,
  options: TransportSecurityOptions
): TransportSecurityResult {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, error: `${options.label} must be a valid URL.` };
  }

  if (parsed.protocol === "https:") {
    return { ok: true };
  }

  if (parsed.protocol !== "http:") {
    return { ok: false, error: `${options.label} must use HTTPS, or HTTP for localhost/loopback local development.` };
  }

  if (isLoopbackHost(parsed.hostname)) {
    return { ok: true };
  }

  if (options.allowInsecureHttp) {
    return { ok: true, warning: plaintextMessage(options.label, parsed.host, "warn") };
  }

  return { ok: false, error: plaintextMessage(options.label, parsed.host, "reject") };
}
