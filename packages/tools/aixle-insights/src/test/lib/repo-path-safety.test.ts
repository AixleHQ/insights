import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import {
  normalizeRepoPathCandidate,
  isRepoPathWithinRoot,
  safeGitRepoPath,
} from "../../lib/repo-path-safety.js";

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "db90-repo-path-safety-test-"));
}

describe("normalizeRepoPathCandidate", () => {
  it("returns the resolved path for an ordinary absolute path", () => {
    const abs = resolve(sep, "repos", "my-project");
    expect(normalizeRepoPathCandidate(abs)).toBe(abs);
  });

  it("collapses .. segments so traversal cannot survive normalization", () => {
    const traversal = join(resolve(sep, "repos", "my-project"), "..", "..", "etc", "evil");
    expect(normalizeRepoPathCandidate(traversal)).toBe(resolve(sep, "etc", "evil"));
  });

  it("trims surrounding whitespace", () => {
    const abs = resolve(sep, "repos", "my-project");
    expect(normalizeRepoPathCandidate(`  ${abs}  `)).toBe(abs);
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["empty string", ""],
    ["whitespace only", "   "],
  ])("rejects %s", (_label, value) => {
    expect(normalizeRepoPathCandidate(value as string | undefined | null)).toBeNull();
  });

  it("rejects a relative path, which git -C would resolve against our own cwd", () => {
    expect(normalizeRepoPathCandidate("relative/repo")).toBeNull();
    expect(normalizeRepoPathCandidate("../../etc/evil")).toBeNull();
  });

  it("rejects the literal Cursor global-hook placeholder", () => {
    expect(normalizeRepoPathCandidate("unknown")).toBeNull();
  });

  it("rejects an option-shaped value", () => {
    expect(normalizeRepoPathCandidate("--upload-pack=touch /tmp/pwn")).toBeNull();
    expect(normalizeRepoPathCandidate("-C")).toBeNull();
  });

  it("rejects a value containing NUL", () => {
    expect(normalizeRepoPathCandidate(`${resolve(sep, "repos")}\0/evil`)).toBeNull();
  });
});

describe("isRepoPathWithinRoot", () => {
  it("accepts the root itself", () => {
    const root = resolve(sep, "repos", "project");
    expect(isRepoPathWithinRoot(root, root)).toBe(true);
  });

  it("accepts a descendant of the root", () => {
    const root = resolve(sep, "repos", "project");
    expect(isRepoPathWithinRoot(join(root, "packages", "api"), root)).toBe(true);
  });

  it("rejects a sibling whose name merely starts with the root name", () => {
    const root = resolve(sep, "repos", "project");
    expect(isRepoPathWithinRoot(resolve(sep, "repos", "project-evil"), root)).toBe(false);
  });

  it("rejects a traversal that string-prefix matching would accept", () => {
    const root = resolve(sep, "repos", "project");
    // This is the bug: "/repos/project/../../etc/evil".startsWith("/repos/project/") is true.
    expect(isRepoPathWithinRoot(join(root, "..", "..", "etc", "evil"), root)).toBe(false);
  });

  it("rejects an ancestor of the root", () => {
    const root = resolve(sep, "repos", "project");
    expect(isRepoPathWithinRoot(resolve(sep, "repos"), root)).toBe(false);
  });

  describe("with real directories on disk", () => {
    let root: string;
    let outside: string;

    beforeEach(() => {
      root = makeTempDir();
      outside = makeTempDir();
    });

    afterEach(() => {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    });

    it("accepts a real descendant directory", () => {
      const inner = join(root, "packages", "api");
      mkdirSync(inner, { recursive: true });
      expect(isRepoPathWithinRoot(inner, root)).toBe(true);
    });

    it("rejects a symlink inside the root that resolves outside it", () => {
      const target = join(outside, "secret-repo");
      mkdirSync(target, { recursive: true });
      const link = join(root, "innocent");
      symlinkSync(target, link);
      expect(isRepoPathWithinRoot(link, root)).toBe(false);
    });

    it("accepts a symlink that still resolves inside the root", () => {
      const target = join(root, "real");
      mkdirSync(target, { recursive: true });
      const link = join(root, "alias");
      symlinkSync(target, link);
      expect(isRepoPathWithinRoot(link, root)).toBe(true);
    });
  });
});

describe("safeGitRepoPath", () => {
  let dir: string;

  beforeEach(() => {
    dir = makeTempDir();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns the canonical real path for an existing directory", () => {
    expect(safeGitRepoPath(dir)).toBe(realpathSync(dir));
  });

  it("resolves a symlinked directory to its real path so git runs where we checked", () => {
    const target = join(dir, "real");
    mkdirSync(target, { recursive: true });
    const link = join(dir, "alias");
    symlinkSync(target, link);
    expect(safeGitRepoPath(link)).toBe(realpathSync(target));
  });

  it("rejects a path that does not exist", () => {
    expect(safeGitRepoPath(join(dir, "nope"))).toBeNull();
  });

  it("rejects a regular file — Cursor's metadata.workspace is often state.vscdb", () => {
    const file = join(dir, "state.vscdb");
    writeFileSync(file, "not a directory", "utf-8");
    expect(safeGitRepoPath(file)).toBeNull();
  });

  it("rejects a dangling symlink", () => {
    const link = join(dir, "dangling");
    symlinkSync(join(dir, "missing-target"), link);
    expect(safeGitRepoPath(link)).toBeNull();
  });

  it("rejects option-shaped and relative values without touching the filesystem", () => {
    expect(safeGitRepoPath("--upload-pack=touch /tmp/pwn")).toBeNull();
    expect(safeGitRepoPath("relative/repo")).toBeNull();
    expect(safeGitRepoPath("")).toBeNull();
  });
});
