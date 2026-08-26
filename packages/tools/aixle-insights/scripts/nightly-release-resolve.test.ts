import { describe, it, expect } from "vitest";
import {
  bumpPatch,
  computeNextVersion,
  findExactMatchTag,
  classifyPhase,
  looksLikeNotFound,
  type ClassifyInput,
} from "./nightly-release-resolve.js";

// A real, permanent stray tag in this repo: a deliberate guard test that
// failed before publishing (cli-mcp-v9.9.9-rc.1). It sorts above every real
// version and must never be selected by any lookup here.
const STRAY_TAG = "cli-mcp-v9.9.9-rc.1";

function baseInput(overrides: Partial<ClassifyInput> = {}): ClassifyInput {
  return {
    channelDistTagVersion: "0.2.7-staging",
    exactMatchTagExists: true,
    hasNewCommitsSincePreviousTag: false,
    nextVersionTagExists: false,
    nextVersionPublished: false,
    distTagPointsToNext: false,
    releaseExists: false,
    ...overrides,
  };
}

describe("bumpPatch", () => {
  it("bumps a plain X.Y.Z version", () => {
    expect(bumpPatch("0.2.1")).toBe("0.2.2");
  });

  it("strips a -staging suffix before bumping, without re-adding it", () => {
    expect(bumpPatch("0.2.7-staging")).toBe("0.2.8");
  });

  it("throws on a non-semver string", () => {
    expect(() => bumpPatch("not-a-version")).toThrow();
  });

  it("throws on a version with the wrong number of components", () => {
    expect(() => bumpPatch("1.2")).toThrow();
  });
});

describe("computeNextVersion", () => {
  it("computes the next stable version independently of staging's version", () => {
    // Real observed state: stable frozen at 0.2.1 while staging is far ahead
    // at 0.2.7-staging. The next stable version must come only from stable's
    // own dist-tag (0.2.1 -> 0.2.2), never influenced by staging's 0.2.7.
    expect(computeNextVersion("0.2.1", "")).toBe("0.2.2");
  });

  it("computes the next staging version independently of stable's version", () => {
    expect(computeNextVersion("0.2.7-staging", "-staging")).toBe("0.2.8-staging");
  });

  it("re-appends the staging suffix even though bumpPatch strips it internally", () => {
    expect(computeNextVersion("0.2.0-staging", "-staging")).toBe("0.2.1-staging");
  });
});

describe("findExactMatchTag", () => {
  it("finds the tag matching a channel's current dist-tag version", () => {
    const tags = ["cli-mcp-v0.2.6-staging", "cli-mcp-v0.2.7-staging", STRAY_TAG];
    expect(findExactMatchTag(tags, "0.2.7-staging")).toBe("cli-mcp-v0.2.7-staging");
  });

  it("never selects the stray high-sorting tag, even though it sorts highest", () => {
    const tags = [STRAY_TAG, "cli-mcp-v0.2.1"];
    // Looking up 0.2.1 must return the real tag, not be confused by 9.9.9-rc.1
    // sorting above it — this function does exact string matching only, no sort.
    expect(findExactMatchTag(tags, "0.2.1")).toBe("cli-mcp-v0.2.1");
  });

  it("returns null when no tag matches, rather than falling back to the stray tag", () => {
    const tags = [STRAY_TAG, "cli-mcp-v0.2.1"];
    expect(findExactMatchTag(tags, "9.9.8")).toBeNull();
  });

  it("returns null on an empty tag list", () => {
    expect(findExactMatchTag([], "0.2.1")).toBeNull();
  });
});

describe("classifyPhase", () => {
  it("no-tag-or-version: channel has never published anything", () => {
    const result = classifyPhase(
      baseInput({ channelDistTagVersion: null, exactMatchTagExists: false })
    );
    expect(result.classification).toBe("no-tag-or-version");
  });

  it("drift: dist-tag has a version but no git tag matches it by exact string", () => {
    const result = classifyPhase(baseInput({ exactMatchTagExists: false }));
    expect(result.classification).toBe("drift");
  });

  it("up-to-date: no new commits since the previous tag", () => {
    const result = classifyPhase(
      baseInput({ hasNewCommitsSincePreviousTag: false, nextVersionTagExists: false })
    );
    expect(result.classification).toBe("up-to-date");
  });

  it("ready-to-tag: new commits exist and nothing has been tagged for the next version yet", () => {
    const result = classifyPhase(
      baseInput({ hasNewCommitsSincePreviousTag: true, nextVersionTagExists: false })
    );
    expect(result.classification).toBe("ready-to-tag");
  });

  it("tag-exists-unpublished: a prior run tagged the next version but never published it", () => {
    const result = classifyPhase(
      baseInput({
        hasNewCommitsSincePreviousTag: true,
        nextVersionTagExists: true,
        nextVersionPublished: false,
      })
    );
    expect(result.classification).toBe("tag-exists-unpublished");
  });

  it("version-published-tag-or-release-incomplete: published with the right dist-tag, but no GitHub Release yet", () => {
    const result = classifyPhase(
      baseInput({
        nextVersionTagExists: true,
        nextVersionPublished: true,
        distTagPointsToNext: true,
        releaseExists: false,
      })
    );
    expect(result.classification).toBe("version-published-tag-or-release-incomplete");
  });

  it("up-to-date: published, dist-tag correct, and the Release already exists (fully resumed/complete)", () => {
    const result = classifyPhase(
      baseInput({
        nextVersionTagExists: true,
        nextVersionPublished: true,
        distTagPointsToNext: true,
        releaseExists: true,
      })
    );
    expect(result.classification).toBe("up-to-date");
  });

  it("drift: published, but the dist-tag does not point to the new version", () => {
    const result = classifyPhase(
      baseInput({
        nextVersionTagExists: true,
        nextVersionPublished: true,
        distTagPointsToNext: false,
      })
    );
    expect(result.classification).toBe("drift");
  });

  it("classifies stable and staging independently on the same inputs shape (no cross-channel interference)", () => {
    const stableResult = classifyPhase(
      baseInput({ channelDistTagVersion: "0.2.1", hasNewCommitsSincePreviousTag: true })
    );
    const stagingResult = classifyPhase(
      baseInput({ channelDistTagVersion: "0.2.7-staging", hasNewCommitsSincePreviousTag: true })
    );
    expect(stableResult.classification).toBe("ready-to-tag");
    expect(stagingResult.classification).toBe("ready-to-tag");
  });
});

describe("looksLikeNotFound", () => {
  // The probes this guards feed "does this version/Release already exist?".
  // Treating an *unanswerable* probe as "does not exist" is the dangerous
  // direction: an unreachable or rate-limited registry would read as "nothing
  // published yet". So the bar for staying silent is a definite not-found
  // answer — everything else must surface its stderr.

  it("recognises npm's 404 markers as a real not-found answer", () => {
    expect(
      looksLikeNotFound(
        "npm error code E404\nnpm error 404 No match found for version 0.2.9-staging",
      ),
    ).toBe(true);
  });

  it("recognises gh's missing-release answer", () => {
    expect(looksLikeNotFound("release not found")).toBe(true);
  });

  it.each([
    ["auth failure", "npm error code E401\nnpm error 401 Unauthorized"],
    ["rate limit", "npm error code E429\nnpm error 429 Too Many Requests"],
    [
      "DNS failure",
      "npm error code ENOTFOUND\nnpm error getaddrinfo ENOTFOUND registry.npmjs.org",
    ],
    ["generic outage", "Error: server not found"],
    ["empty stderr", ""],
  ])("does NOT silence a %s — it is not a not-found answer", (_label, stderr) => {
    expect(looksLikeNotFound(stderr)).toBe(false);
  });

  it("does not let ENOTFOUND masquerade as not-found via a bare substring", () => {
    // "ENOTFOUND" contains "NOTFOUND"; an unanchored /not found/ would have
    // matched a DNS error and silently reported "version does not exist".
    expect(looksLikeNotFound("getaddrinfo ENOTFOUND")).toBe(false);
  });
});
