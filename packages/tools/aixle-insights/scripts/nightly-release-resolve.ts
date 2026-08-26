#!/usr/bin/env node
/**
 * AIX-739 — resolve logic for the automated nightly npm build workflow
 * (.github/workflows/npm-nightly-builds.yml).
 *
 * npm's dist-tag is the source of truth for "what's published" on a channel —
 * never a sorted git tag list (a real, permanent stray tag from a failed
 * guard test, cli-mcp-v9.9.9-rc.1, sorts above every real version and would
 * otherwise corrupt version computation). Git tags are used only for an
 * exact-match lookup against the dist-tag's own version string.
 *
 * The pure functions below (bumpPatch, computeNextVersion, findExactMatchTag,
 * classifyPhase) are unit tested in nightly-release-resolve.test.ts. main()
 * is the CLI wrapper that does the real git/npm/gh shelling-out and is not
 * unit tested, matching this package's existing scripts/ convention
 * (audit-local-stores.ts, verify-cursor-dry-run.ts are untested wrappers over
 * tested logic) — its correctness is instead verified by a real dry run
 * against live branch state.
 *
 * Usage:
 *   tsx scripts/nightly-release-resolve.ts --channel stable
 *   tsx scripts/nightly-release-resolve.ts --channel staging
 */
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";

export type Channel = "stable" | "staging";
export type ChannelSuffix = "" | "-staging";
export type DistTagKey = "latest" | "staging";

export interface ChannelConfig {
  channel: Channel;
  branch: string;
  suffix: ChannelSuffix;
  distTag: DistTagKey;
}

export const CHANNELS: Record<Channel, ChannelConfig> = {
  stable: { channel: "stable", branch: "develop", suffix: "", distTag: "latest" },
  staging: { channel: "staging", branch: "staging", suffix: "-staging", distTag: "staging" },
};

/**
 * Strips any -<prerelease> suffix and bumps the patch component.
 * "0.2.1" -> "0.2.2"; "0.2.7-staging" -> "0.2.8" (suffix stripped, not
 * re-added — computeNextVersion re-appends the channel's own suffix).
 */
export function bumpPatch(version: string): string {
  const core = version.split("-")[0];
  const parts = core.split(".").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    throw new Error(`bumpPatch: not a valid X.Y.Z version: "${version}"`);
  }
  const [major, minor, patch] = parts;
  return `${major}.${minor}.${patch + 1}`;
}

/**
 * Each channel's next version is derived from that channel's own current
 * dist-tag only — the two channels have independent version counters, not a
 * shared version space (confirmed against real tag history: stable stayed at
 * 0.2.1 while staging independently incremented 0.2.1-staging -> 0.2.7-staging
 * six times with no corresponding stable movement).
 */
export function computeNextVersion(
  currentDistTagVersion: string,
  suffix: ChannelSuffix
): string {
  return `${bumpPatch(currentDistTagVersion)}${suffix}`;
}

/**
 * Exact-string lookup only — never "sort tags, take the highest". A stray
 * tag like cli-mcp-v9.9.9-rc.1 (a failed guard test, never deleted) sorts
 * above every real version and must never be selected by this lookup.
 */
export function findExactMatchTag(tags: string[], version: string): string | null {
  const target = `cli-mcp-v${version}`;
  return tags.includes(target) ? target : null;
}

export type Classification =
  | "no-tag-or-version"
  | "up-to-date"
  | "ready-to-tag"
  | "tag-exists-unpublished"
  | "version-published-tag-or-release-incomplete"
  | "drift";

export interface ClassifyInput {
  /** This channel's current published version, or null if nothing has ever been published on it. */
  channelDistTagVersion: string | null;
  /** Whether cli-mcp-v<channelDistTagVersion> exists in the local git tag list. */
  exactMatchTagExists: boolean;
  /** Skip-check result: new package-relevant commits since the exact-match tag. */
  hasNewCommitsSincePreviousTag: boolean;
  /** Whether cli-mcp-v<computedNextVersion> already exists (a prior partial run). */
  nextVersionTagExists: boolean;
  /** Whether the computed next version is already on the npm registry. */
  nextVersionPublished: boolean;
  /** Whether the channel's dist-tag already equals the computed next version. */
  distTagPointsToNext: boolean;
  /** Whether a GitHub Release already exists for cli-mcp-v<computedNextVersion>. */
  releaseExists: boolean;
}

export interface ClassifyResult {
  classification: Classification;
}

/**
 * The resumable-phase classifier. Every partial-failure shape has a defined
 * resume path; nothing needs to persist between runs — each run re-derives
 * the classification fresh from the npm registry and git, which is itself
 * the recovery mechanism. "drift" and "no-tag-or-version" are never resolved
 * automatically — they always need a human, never a guessed fallback.
 */
export function classifyPhase(input: ClassifyInput): ClassifyResult {
  const {
    channelDistTagVersion,
    exactMatchTagExists,
    hasNewCommitsSincePreviousTag,
    nextVersionTagExists,
    nextVersionPublished,
    distTagPointsToNext,
    releaseExists,
  } = input;

  if (channelDistTagVersion === null) {
    return { classification: "no-tag-or-version" };
  }

  if (!exactMatchTagExists) {
    // Registry says this version is published, but no git tag matches it —
    // registry and git have drifted. Never fall back to a best-effort diff.
    return { classification: "drift" };
  }

  if (nextVersionPublished && !distTagPointsToNext) {
    return { classification: "drift" };
  }

  if (nextVersionPublished && distTagPointsToNext) {
    return releaseExists
      ? { classification: "up-to-date" }
      : { classification: "version-published-tag-or-release-incomplete" };
  }

  if (nextVersionTagExists) {
    return { classification: "tag-exists-unpublished" };
  }

  return hasNewCommitsSincePreviousTag
    ? { classification: "ready-to-tag" }
    : { classification: "up-to-date" };
}

// ---------------------------------------------------------------------------
// CLI wrapper — real I/O, not unit tested. See file header.
// ---------------------------------------------------------------------------

const PACKAGE_PATHS = [
  "packages/tools/aixle-insights",
  "packages/tools/package.json",
  "packages/tools/package-lock.json",
];

function parseChannelArg(argv: string[]): Channel {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--channel" && argv[i + 1]) {
      const value = argv[i + 1];
      if (value === "stable" || value === "staging") return value;
      throw new Error(`--channel must be "stable" or "staging", got "${value}"`);
    }
  }
  throw new Error("Missing required --channel <stable|staging> argument");
}

function sh(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { encoding: "utf-8" }).trim();
}

/**
 * Git pathspecs given on the command line (e.g. "packages/tools/aixle-insights")
 * are resolved relative to the current working directory, not the repo root.
 * Since this script is invoked with cwd set to the package directory itself
 * (packages/tools/aixle-insights), a bare `git log -- packages/tools/aixle-insights`
 * would look for a nonexistent nested path and silently return no commits —
 * caught by a local smoke test before this ever reached CI. `-C <repoRoot>`
 * makes every git invocation here independent of the caller's cwd.
 */
function git(args: string[], repoRoot: string): string {
  return sh("git", ["-C", repoRoot, ...args]);
}

/**
 * A not-found *answer*, as opposed to a probe that could not be answered at all.
 *
 * Matched against the specific markers each tool emits — `npm` uses `E404` /
 * `404` / "no match found", `gh release view` uses "release not found" — rather
 * than a bare /not found/, which would also swallow DNS-style failures such as
 * "server not found" and silently turn "could not reach the registry" into
 * "this version does not exist".
 */
export function looksLikeNotFound(stderr: string): boolean {
  return /\bE404\b|\b404\b|no match found|could not be found|release not found/i.test(
    stderr,
  );
}

/**
 * Returns null (not throws) on a non-zero exit — used for existence checks.
 *
 * Deliberately does NOT delegate to sh(). At these call sites a non-zero exit is
 * usually the *expected* answer ("not published yet", "no Release yet"), and
 * sh() inherits stderr, so every happy-path run printed a full `npm error code
 * E404 / npm error 404 No match found for version X` block into the Actions log
 * — indistinguishable at a glance from a real failure.
 *
 * But suppressing stderr for *every* non-zero exit is worse than the noise it
 * removes: a registry auth failure, a 429, a network drop, or a `gh` outage all
 * exit non-zero too, and would then be silently reported as "not published".
 * That is not just lost diagnostics — the caller uses this to decide whether a
 * version already exists, so an unreachable registry could be misread as
 * "nothing published yet". stderr is therefore captured (never inherited) and
 * re-emitted only when it does NOT look like a genuine not-found answer.
 */
function shOrNull(cmd: string, args: string[]): string | null {
  try {
    return execFileSync(cmd, args, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (err) {
    const stderr = String(
      (err as { stderr?: Buffer | string } | undefined)?.stderr ?? "",
    );
    if (!looksLikeNotFound(stderr)) {
      console.error(
        `[resolve] probe failed for \`${cmd} ${args.join(" ")}\` — this is NOT a ` +
          `not-found result, so the answer below ("does not exist") may be wrong:`,
      );
      console.error(stderr.trim() || "(no stderr captured)");
    }
    return null;
  }
}

function writeOutput(key: string, value: string): void {
  const outFile = process.env.GITHUB_OUTPUT;
  if (outFile) {
    appendFileSync(outFile, `${key}=${value}\n`);
  } else {
    console.log(`[no GITHUB_OUTPUT set] ${key}=${value}`);
  }
}

function main(): void {
  const channel = parseChannelArg(process.argv.slice(2));
  const config = CHANNELS[channel];

  const repoRoot = sh("git", ["rev-parse", "--show-toplevel"]);

  // `--prefer-online` on every registry read in this file, not just for tidiness:
  // npm's own cache serves packuments without revalidating, and CI restores a
  // warm ~/.npm via actions/setup-node's `cache: "npm"`. A stale read here is
  // not cosmetic — the entire classification hangs off it, and reading a
  // pre-publish dist-tag makes the resolver compute a version that already
  // exists. See ARD.md decision on post-publish verification.
  const distTagsJson = sh("npm", ["view", "--prefer-online", "@aixle/insights", "dist-tags", "--json"]);
  const distTags: Record<string, string | undefined> = JSON.parse(distTagsJson);
  const channelDistTagVersion = distTags[config.distTag] ?? null;

  const tagListRaw = git(["tag", "-l", "cli-mcp-v*"], repoRoot);
  const tags = tagListRaw.length > 0 ? tagListRaw.split("\n") : [];

  let exactMatchTagExists = false;
  let hasNewCommitsSincePreviousTag = false;
  let previousTag: string | null = null;

  if (channelDistTagVersion !== null) {
    previousTag = findExactMatchTag(tags, channelDistTagVersion);
    exactMatchTagExists = previousTag !== null;
    if (exactMatchTagExists) {
      const log = git(
        ["log", `${previousTag}..HEAD`, "--oneline", "--", ...PACKAGE_PATHS],
        repoRoot
      );
      hasNewCommitsSincePreviousTag = log.length > 0;
    }
  }

  let computedNextVersion = "";
  let nextVersionTagExists = false;
  let nextVersionPublished = false;
  let distTagPointsToNext = false;
  let releaseExists = false;

  if (channelDistTagVersion !== null && exactMatchTagExists) {
    computedNextVersion = computeNextVersion(channelDistTagVersion, config.suffix);
    nextVersionTagExists = tags.includes(`cli-mcp-v${computedNextVersion}`);
    nextVersionPublished =
      shOrNull("npm", [
        "view",
        "--prefer-online",
        `@aixle/insights@${computedNextVersion}`,
        "version",
      ]) !== null;
    if (nextVersionPublished) {
      // Without --prefer-online this was only *named* fresh — a warm cache made
      // it re-read the same packument the top-of-main call already fetched.
      const freshDistTagsJson = sh("npm", [
        "view",
        "--prefer-online",
        "@aixle/insights",
        "dist-tags",
        "--json",
      ]);
      const freshDistTags: Record<string, string | undefined> = JSON.parse(freshDistTagsJson);
      distTagPointsToNext = freshDistTags[config.distTag] === computedNextVersion;
      releaseExists = shOrNull("gh", ["release", "view", `cli-mcp-v${computedNextVersion}`]) !== null;
    }
  }

  const { classification } = classifyPhase({
    channelDistTagVersion,
    exactMatchTagExists,
    hasNewCommitsSincePreviousTag,
    nextVersionTagExists,
    nextVersionPublished,
    distTagPointsToNext,
    releaseExists,
  });

  writeOutput("classification", classification);
  writeOutput("channel", channel);
  writeOutput("branch", config.branch);
  writeOutput("dist_tag_key", config.distTag);
  writeOutput("computed_version", computedNextVersion);
  writeOutput("previous_tag", previousTag ?? "");
  writeOutput("previous_version", channelDistTagVersion ?? "");
  // Exported so the workflow's release-notes step filters on exactly the same
  // paths that decided a release was warranted. Hardcoding a narrower set there
  // silently omitted real triggering changes (a packages/tools/package.json bump
  // can trigger a build but would never appear in the notes).
  writeOutput("package_paths", PACKAGE_PATHS.join(" "));

  console.log(
    `[${channel}] dist-tag=${channelDistTagVersion ?? "(none)"} previousTag=${previousTag ?? "(none)"} ` +
      `computedNext=${computedNextVersion || "(n/a)"} classification=${classification}`
  );

  if (classification === "no-tag-or-version" || classification === "drift") {
    console.error(
      `[${channel}] Refusing to proceed automatically: classification="${classification}". ` +
        "This needs a human to reconcile the npm registry and git tag history — never guessing a fallback."
    );
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
