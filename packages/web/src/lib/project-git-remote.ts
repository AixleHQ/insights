/**
 * Reads git remote URL from API payloads that may use camelCase.
 */
export function getProjectGitRemoteUrl(project: {
  gitRemoteUrl?: string | null;
}): string {
  const raw = project.gitRemoteUrl ?? "";
  if (typeof raw !== "string") return "";
  return raw;
}

/** True when git remote is null, undefined, or whitespace-only. */
export function isGitRemoteMissing(project: {
  gitRemoteUrl?: string | null;
}): boolean {
  return getProjectGitRemoteUrl(project).trim().length === 0;
}
