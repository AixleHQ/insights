import { realpathSync, statSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";
import { isSafeSpawnPathArg } from "./spawn-arg-safety.js";

/**
 * Containment for untrusted filesystem paths that end up in `git -C <path>`.
 *
 * Every repo path this package resolves is untrusted text: Cursor's
 * `workspace.json` `folder`, a composer's `workspaceIdentifier.uri.fsPath`, a
 * hook's `workspace_roots[0]`, or a Claude transcript's `cwd`. None is validated
 * by its producer — `fileUriToPath` (`readers/cursor.ts:189`) even passes a
 * non-`file://` value straight through.
 *
 * `execFileSync` stops shell injection, but not `git -C ../../../elsewhere`: git
 * would read that directory's `.git/config` and this package would ship the
 * remote it found to the Aixle Insights API. See AIX-547.
 *
 * Semantics are ported from `validatedRealPathWithinRoot`
 * (`readers/cursor-sqlite.ts:23`), which already guards the Cursor SQLite
 * reader the same way.
 */

function realPathOrNull(path: string): string | null {
  try {
    return realpathSync(path);
  } catch {
    return null;
  }
}

/**
 * Normalize an untrusted repo-path candidate. Pure — never touches the
 * filesystem, so it is safe to call on every payload in a sync.
 *
 * Returns an absolute, `..`-collapsed path, or null when the value cannot be a
 * legitimate workspace path. Rejecting relative values is deliberate: `git -C`
 * would resolve a relative path against *this* process's cwd, which has nothing
 * to do with where the value came from. It also rejects Cursor's literal
 * `"unknown"` placeholder for global hook events.
 */
export function normalizeRepoPathCandidate(value: string | undefined | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  // Rejects empty, NUL-containing, and option-shaped values (AIX-546).
  if (!isSafeSpawnPathArg(trimmed)) return null;
  if (!isAbsolute(trimmed)) return null;
  return resolve(trimmed);
}

/**
 * True when `candidate` is `root` itself or lives beneath it.
 *
 * Compares with a trailing `sep` so `/repos/project-evil` is not treated as
 * inside `/repos/project`, and resolves symlinks so a link inside the root
 * cannot point out of it.
 *
 * When either side does not exist, `realpathSync` throws and the normalized
 * paths are compared instead. That loses nothing — a path that does not exist
 * cannot be a symlink, and `resolve()` has already collapsed `..` — and it keeps
 * containment usable for scope filtering, which legitimately runs against
 * payload paths naming directories this machine no longer has.
 */
export function isRepoPathWithinRoot(candidate: string, root: string): boolean {
  const normalizedCandidate = resolve(candidate);
  const normalizedRoot = resolve(root);
  const realCandidate = realPathOrNull(normalizedCandidate);
  const realRoot = realPathOrNull(normalizedRoot);

  // Compare like with like: mixing a realpath against a normalized path would
  // false-negative on macOS, where /var is a symlink to /private/var.
  const bothResolve = realCandidate !== null && realRoot !== null;
  const left = bothResolve ? realCandidate : normalizedCandidate;
  const right = bothResolve ? realRoot : normalizedRoot;

  if (left === right) return true;
  const rootWithSep = right.endsWith(sep) ? right : `${right}${sep}`;
  return left.startsWith(rootWithSep);
}

/**
 * The last check before `git -C <path>` runs. Requires the value to resolve to a
 * real directory: a missing path, a dangling symlink, or a regular file is not a
 * workspace. (Cursor's `metadata.workspace` is often the `state.vscdb` file
 * itself, which git would only error on anyway.)
 *
 * Returns the canonical real path so `git` runs against exactly what was
 * checked, narrowing the window between the check and the spawn.
 */
export function safeGitRepoPath(value: string | undefined | null): string | null {
  const normalized = normalizeRepoPathCandidate(value);
  if (normalized === null) return null;

  const real = realPathOrNull(normalized);
  if (real === null) return null;

  try {
    if (!statSync(real).isDirectory()) return null;
  } catch {
    return null;
  }
  return real;
}
