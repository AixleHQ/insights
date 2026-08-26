/**
 * Guards for untrusted values that end up in the argv of a spawned process.
 *
 * `execFileSync` prevents *shell* injection but not *argv-option* injection: a
 * value beginning with `-` is parsed by the child as a command-line option. Git
 * remotes and workspace paths are untrusted text — they come from a repo the
 * developer cloned, from Cursor's `workspace.json`, or from a Claude transcript
 * — so every value derived from them must be checked before it reaches `git`
 * or `ssh`. See AIX-546.
 */

/** Longest legal DNS name (253) with headroom for an ssh_config alias. */
const MAX_HOST_LENGTH = 255;

/**
 * Dot-separated labels of alphanumerics, `-` and `_`. A label may not start or
 * end with `-`, which is what blocks option injection (`-oProxyCommand=…`).
 * Whitespace, `=`, quotes, backslashes, newlines and NUL are all excluded.
 * Underscores are allowed because `~/.ssh/config` aliases commonly use them.
 * IPv6 literals are not covered — the SCP/`ssh://` host capture in
 * `project-resolver.ts` cannot produce one, since it excludes `:`.
 */
const HOST_LABEL = "[A-Za-z0-9_](?:[A-Za-z0-9_-]*[A-Za-z0-9_])?";
const HOST_PATTERN = new RegExp(`^${HOST_LABEL}(?:\\.${HOST_LABEL})*$`);

/**
 * True when `host` is safe to pass as an argv element to `ssh`. Accepts real
 * hostnames, IPv4 literals, and `~/.ssh/config` host aliases.
 */
export function isSafeSshHost(host: string): boolean {
  if (host.length === 0 || host.length > MAX_HOST_LENGTH) return false;
  return HOST_PATTERN.test(host);
}

/**
 * True when `value` is safe to pass as a filesystem-path argv element (e.g.
 * after `git -C`). Deliberately permissive about path *content* — real
 * workspace paths contain spaces, dashes and drive letters. It only rejects
 * what makes the child misread the value as an option, plus embedded NUL.
 *
 * This is an argv guard, not a containment check: verifying the path points
 * somewhere legitimate is AIX-547.
 */
export function isSafeSpawnPathArg(value: string): boolean {
  if (value.length === 0) return false;
  if (value.startsWith("-")) return false;
  if (value.includes("\0")) return false;
  return true;
}
