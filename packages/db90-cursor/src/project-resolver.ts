import { execSync } from "node:child_process";

export interface ProjectResolution {
  projectId: string | null;
  source: "flag" | "config" | "auto-detect" | "auto-detect-not-found" | "none";
}

export interface LookupResult {
  project_id: string;
  name: string;
}

/** Coerce empty string to undefined so "" is treated as "not set" */
function coerce(val: string | undefined): string | undefined {
  return val === "" ? undefined : val;
}

export async function resolveProjectId(
  flagValue: string | undefined,
  configValue: string | undefined,
  host: string,
  token: string,
  verbose: boolean
): Promise<ProjectResolution> {
  const flag = coerce(flagValue);
  const config = coerce(configValue);

  if (flag !== undefined) return { projectId: flag, source: "flag" };
  if (config !== undefined) return { projectId: config, source: "config" };

  const gitRemote = getGitRemote(verbose);
  if (gitRemote === null) return { projectId: null, source: "none" };

  const result = await lookupProjectByRemote(gitRemote, host, token, verbose);
  if (result === "not-found") return { projectId: null, source: "auto-detect-not-found" };
  if (result !== null) return { projectId: result.project_id, source: "auto-detect" };
  return { projectId: null, source: "none" };
}

export function getGitRemote(verbose: boolean): string | null {
  try {
    const out = execSync("git remote get-url origin", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5000,
    }).trim();
    return out || null;
  } catch {
    if (verbose) console.log("[verbose] Could not determine git remote");
    return null;
  }
}

export async function lookupProjectByRemote(
  gitRemote: string,
  host: string,
  token: string,
  verbose: boolean
): Promise<LookupResult | "not-found" | null> {
  const url = `${host.replace(/\/$/, "")}/api/v1/projects/lookup?git_remote=${encodeURIComponent(gitRemote)}`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 404) {
      if (verbose) console.log(`[verbose] No project found for git remote: ${gitRemote}`);
      return "not-found";
    }
    if (!res.ok) {
      if (verbose) console.log(`[verbose] Project lookup failed: HTTP ${res.status}`);
      return null;
    }
    const body = (await res.json()) as { data: LookupResult };
    return body.data;
  } catch {
    if (verbose)
      console.log("[verbose] Project lookup network error — proceeding without project attribution");
    return null;
  }
}
