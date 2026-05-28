import { execFileSync } from "node:child_process";

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

export async function resolveProjectIdForRepoPath(
  repoPath: string,
  host: string,
  token: string,
  verbose: boolean
): Promise<ProjectResolution> {
  const gitRemote = getGitRemoteForPath(repoPath, verbose);
  if (gitRemote === null) return { projectId: null, source: "none" };

  const result = await lookupProjectByRemote(gitRemote, host, token, verbose);
  if (result === "not-found") return { projectId: null, source: "auto-detect-not-found" };
  if (result !== null) return { projectId: result.project_id, source: "auto-detect" };
  return { projectId: null, source: "none" };
}

export function getGitRemote(verbose: boolean): string | null {
  try {
    const out = execFileSync("git", ["remote", "get-url", "origin"], {
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

export function getGitRemoteForPath(repoPath: string, verbose: boolean): string | null {
  try {
    const out = execFileSync("git", ["-C", repoPath, "remote", "get-url", "origin"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5000,
    }).trim();
    return out || null;
  } catch {
    if (verbose) console.log(`[verbose] Could not determine git remote for path: ${repoPath}`);
    return null;
  }
}

function isLookupResponse(body: unknown): body is { data: LookupResult } {
  if (typeof body !== "object" || body === null) return false;
  const d = (body as Record<string, unknown>).data;
  if (typeof d !== "object" || d === null) return false;
  const data = d as Record<string, unknown>;
  return typeof data.project_id === "string" && typeof data.name === "string";
}

/**
 * Cursor `recentCommit.repoName` is typically `owner/repo` (GitHub-style slug), not a full
 * git remote. Expand to remotes the API lookup understands (`Project.normalize_git_remote`).
 */
export function repoNameToGitRemoteCandidates(repoName: string): string[] {
  const trimmed = repoName.trim();
  if (!trimmed) return [];
  if (trimmed.includes("://") || trimmed.includes("@")) {
    return [trimmed];
  }
  if (/^[\w.-]+\/[\w.-]+(\/[\w.-]+)*$/.test(trimmed)) {
    return [`https://github.com/${trimmed}`, `git@github.com:${trimmed}.git`];
  }
  return [];
}

export async function lookupProjectByRepoName(
  repoName: string,
  host: string,
  token: string,
  verbose: boolean
): Promise<LookupResult | "not-found" | null> {
  const candidates = repoNameToGitRemoteCandidates(repoName);
  if (candidates.length === 0) {
    if (verbose) console.log(`[verbose] Cannot derive git remote from repo_name: ${repoName}`);
    return "not-found";
  }
  for (const candidate of candidates) {
    const result = await lookupProjectByRemote(candidate, host, token, verbose);
    if (result === "not-found") continue;
    return result;
  }
  return "not-found";
}

/** Payload shape shared by db90-cursor and telemetry-mcp commit mappers. */
export interface CommitAttributionPayload {
  event_type?: string;
  project_id?: string;
  metadata?: { source?: string; repo_name?: string };
}

/**
 * For recent-commit events, prefer DB90 project lookup from Cursor's `metadata.repo_name`
 * unless the user set `--project-id` or config `project_id` (explicit attribution).
 * Daily stats / legacy rows keep batch (CWD) attribution only.
 */
export async function enrichCommitProjectAttribution(
  payloads: CommitAttributionPayload[],
  options: {
    projectIdSource?: ProjectResolution["source"];
    host: string;
    token: string;
    verbose?: boolean;
  }
): Promise<void> {
  const explicit =
    options.projectIdSource === "flag" || options.projectIdSource === "config";
  if (explicit) return;

  for (const payload of payloads) {
    if (payload.event_type !== "commit" && payload.metadata?.source !== "recent_commit") {
      continue;
    }
    const repoName = payload.metadata?.repo_name;
    if (!repoName) continue;

    const result = await lookupProjectByRepoName(
      repoName,
      options.host,
      options.token,
      options.verbose ?? false
    );
    if (result && typeof result === "object" && "project_id" in result) {
      payload.project_id = result.project_id;
      if (options.verbose) {
        console.log(
          `[verbose] Commit project attribution from metadata.repo_name=${repoName}: ${result.project_id}`
        );
      }
    }
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
    const body: unknown = await res.json();
    if (!isLookupResponse(body)) {
      if (verbose) console.log("[verbose] Unexpected response shape from project lookup");
      return null;
    }
    return body.data;
  } catch {
    if (verbose)
      console.log("[verbose] Project lookup network error — proceeding without project attribution");
    return null;
  }
}
