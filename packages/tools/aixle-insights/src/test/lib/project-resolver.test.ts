import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  resolveProjectId,
  resolveProjectIdForRepoPath,
  getGitRemote,
  getGitRemoteForPath,
  canonicalizeGitRemote,
  lookupProjectByRemote,
  lookupProjectByRepoName,
  repoNameToGitRemoteCandidates,
  enrichCommitProjectAttribution,
} from "../../lib/project-resolver.js";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

import { execFileSync } from "node:child_process";
const mockExecFileSync = vi.mocked(execFileSync);

describe("resolveProjectId", () => {
  const host = "https://app.insights.example.com";
  const token = "db90_testtoken";

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns flag value when flag is provided", async () => {
    const result = await resolveProjectId("flag-uuid", undefined, host, token, false);
    expect(result.projectId).toBe("flag-uuid");
    expect(result.source).toBe("flag");
  });

  it("treats empty string flag as unset and falls through to config", async () => {
    const result = await resolveProjectId("", "config-uuid", host, token, false);
    expect(result.projectId).toBe("config-uuid");
    expect(result.source).toBe("config");
  });

  it("passes allowInsecureHttp through to the underlying lookup", async () => {
    mockExecFileSync.mockReturnValue("git@github.com:org/repo.git\n" as unknown as Buffer);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { project_id: "auto-uuid", name: "My Repo" } }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await resolveProjectId(
      undefined,
      undefined,
      "http://trusted-staging.example",
      token,
      false,
      true
    );

    expect(result.projectId).toBe("auto-uuid");
    expect(mockFetch).toHaveBeenCalled();
  });

  it("treats empty string flag as unset and falls through to none when no config", async () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error("not a git repo");
    });
    const result = await resolveProjectId("", undefined, host, token, false);
    expect(result.projectId).toBeNull();
    expect(result.source).toBe("none");
  });

  it("returns config value when no flag", async () => {
    const result = await resolveProjectId(undefined, "config-uuid", host, token, false);
    expect(result.projectId).toBe("config-uuid");
    expect(result.source).toBe("config");
  });

  it("treats empty string config as unset", async () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error("not a git repo");
    });
    const result = await resolveProjectId(undefined, "", host, token, false);
    expect(result.projectId).toBeNull();
    expect(result.source).toBe("none");
  });

  it("flag wins over config", async () => {
    const result = await resolveProjectId("flag-uuid", "config-uuid", host, token, false);
    expect(result.projectId).toBe("flag-uuid");
    expect(result.source).toBe("flag");
  });

  it("auto-detects project from git remote when no flag or config", async () => {
    mockExecFileSync.mockReturnValue("git@github.com:org/repo.git\n" as unknown as Buffer);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { project_id: "auto-uuid", name: "My Repo" } }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await resolveProjectId(undefined, undefined, host, token, false);
    expect(result.projectId).toBe("auto-uuid");
    expect(result.source).toBe("auto-detect");
  });

  it("returns auto-detect-not-found when git remote resolves but API returns 404", async () => {
    mockExecFileSync.mockReturnValue("git@github.com:org/unknown.git\n" as unknown as Buffer);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await resolveProjectId(undefined, undefined, host, token, false);
    expect(result.projectId).toBeNull();
    expect(result.source).toBe("auto-detect-not-found");
  });

  it("returns none when execFileSync throws (not a git repo)", async () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error("not a git repo");
    });
    const result = await resolveProjectId(undefined, undefined, host, token, false);
    expect(result.projectId).toBeNull();
    expect(result.source).toBe("none");
  });

  it("returns none when network error occurs during lookup", async () => {
    mockExecFileSync.mockReturnValue("git@github.com:org/repo.git\n" as unknown as Buffer);
    const mockFetch = vi.fn().mockRejectedValue(new Error("network error"));
    vi.stubGlobal("fetch", mockFetch);

    const result = await resolveProjectId(undefined, undefined, host, token, false);
    expect(result.projectId).toBeNull();
    expect(result.source).toBe("none");
  });

  it("resolves project from an explicit repo path", async () => {
    const repoDir = mkdtempSync(join(tmpdir(), "db90-pr-repo-"));
    try {
      mockExecFileSync.mockReturnValue("git@github.com:org/repo.git\n" as unknown as Buffer);
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: { project_id: "path-uuid", name: "Path Repo" } }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await resolveProjectIdForRepoPath(repoDir, host, token, false);
      expect(result.projectId).toBe("path-uuid");
      expect(result.source).toBe("auto-detect");
      expect(mockExecFileSync).toHaveBeenCalledWith(
        "git",
        ["-C", realpathSync(repoDir), "remote", "get-url", "origin"],
        expect.any(Object)
      );
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });
});

describe("getGitRemote", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns trimmed remote URL on success", () => {
    mockExecFileSync.mockReturnValue("git@github.com:org/repo.git\n" as unknown as Buffer);
    expect(getGitRemote(false)).toBe("git@github.com:org/repo.git");
  });

  it("returns null when execFileSync throws", () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error("fatal: not a git repository");
    });
    expect(getGitRemote(false)).toBeNull();
  });

  it("returns null when output is empty string", () => {
    mockExecFileSync.mockReturnValue("" as unknown as Buffer);
    expect(getGitRemote(false)).toBeNull();
  });

  it("returns trimmed remote URL for an explicit repo path", () => {
    const repoDir = mkdtempSync(join(tmpdir(), "db90-pr-repo-"));
    try {
      mockExecFileSync.mockReturnValue("git@github.com:org/repo.git\n" as unknown as Buffer);
      expect(getGitRemoteForPath(repoDir, false)).toBe("git@github.com:org/repo.git");
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });
});

describe("canonicalizeGitRemote", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("rewrites an SCP-style SSH host alias to its resolved hostname", () => {
    mockExecFileSync.mockReturnValue(
      "user git\nhostname github.com\nport 22\n" as unknown as Buffer
    );
    expect(canonicalizeGitRemote("git@github-work:org/repo.git", false)).toBe(
      "git@github.com:org/repo.git"
    );
    expect(mockExecFileSync).toHaveBeenCalledWith("ssh", ["-G", "github-work"], expect.anything());
  });

  it("rewrites an ssh:// URL host alias to its resolved hostname", () => {
    mockExecFileSync.mockReturnValue("hostname gitlab.com\n" as unknown as Buffer);
    expect(canonicalizeGitRemote("ssh://git@gl-work:8022/group/proj.git", false)).toBe(
      "ssh://git@gitlab.com/group/proj.git"
    );
  });

  it("leaves the remote unchanged when the host resolves to itself", () => {
    mockExecFileSync.mockReturnValue("hostname github.com\n" as unknown as Buffer);
    expect(canonicalizeGitRemote("git@github.com:org/repo.git", false)).toBe(
      "git@github.com:org/repo.git"
    );
  });

  it("leaves the remote unchanged when ssh -G cannot be run", () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error("ssh: not found");
    });
    expect(canonicalizeGitRemote("git@github-work:org/repo.git", false)).toBe(
      "git@github-work:org/repo.git"
    );
  });

  it("leaves HTTPS remotes untouched", () => {
    expect(canonicalizeGitRemote("https://github.com/org/repo.git", false)).toBe(
      "https://github.com/org/repo.git"
    );
    expect(mockExecFileSync).not.toHaveBeenCalled();
  });
});

describe("repoNameToGitRemoteCandidates", () => {
  it("expands owner/repo to GitHub HTTPS and SSH remotes", () => {
    expect(repoNameToGitRemoteCandidates("acme/demo")).toEqual([
      "https://github.com/acme/demo",
      "git@github.com:acme/demo.git",
    ]);
  });

  it("passes through full git remote URLs unchanged", () => {
    expect(repoNameToGitRemoteCandidates("git@github.com:org/repo.git")).toEqual([
      "git@github.com:org/repo.git",
    ]);
  });

  it("returns empty for blank input", () => {
    expect(repoNameToGitRemoteCandidates("  ")).toEqual([]);
  });
});

describe("lookupProjectByRepoName", () => {
  const host = "https://app.insights.example.com";
  const token = "db90_testtoken";

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("tries HTTPS candidate first and returns on match", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { project_id: "proj-from-slug", name: "Demo" } }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await lookupProjectByRepoName("org/repo", host, token, false);
    expect(result).toEqual({ project_id: "proj-from-slug", name: "Demo" });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain(encodeURIComponent("https://github.com/org/repo"));
  });

  it("falls through to SSH when HTTPS returns 404", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { project_id: "proj-ssh", name: "SSH" } }),
      });
    vi.stubGlobal("fetch", mockFetch);

    const result = await lookupProjectByRepoName("org/repo", host, token, false);
    expect(result).toEqual({ project_id: "proj-ssh", name: "SSH" });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe("enrichCommitProjectAttribution", () => {
  const host = "https://app.insights.example.com";
  const token = "db90_testtoken";

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("skips repo lookup when project_id was set via flag or config", async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    const payloads = [
      {
        event_type: "commit",
        project_id: "explicit-proj",
        metadata: { source: "recent_commit", repo_name: "org/repo" },
      },
    ];
    await enrichCommitProjectAttribution(payloads, {
      projectIdSource: "flag",
      host,
      token,
      verbose: false,
    });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(payloads[0].project_id).toBe("explicit-proj");
  });

  it("overrides commit project_id from metadata.repo_name lookup", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { project_id: "proj-from-commit", name: "Repo" } }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const payloads = [
      {
        event_type: "commit",
        project_id: "wrong-cwd-proj",
        metadata: { source: "recent_commit", repo_name: "org/repo" },
      },
      {
        event_type: "chat",
        project_id: "wrong-cwd-proj",
        metadata: {},
      },
    ];
    await enrichCommitProjectAttribution(payloads, {
      projectIdSource: "auto-detect",
      host,
      token,
      verbose: false,
    });
    expect(payloads[0].project_id).toBe("proj-from-commit");
    expect(payloads[1].project_id).toBe("wrong-cwd-proj");
  });
});

describe("lookupProjectByRemote", () => {
  const host = "https://app.insights.example.com";
  const token = "db90_testtoken";

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns project data on 200 response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { project_id: "proj-uuid", name: "Test Project" } }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await lookupProjectByRemote("git@github.com:org/repo.git", host, token, false);
    expect(result).toEqual({ project_id: "proj-uuid", name: "Test Project" });
  });

  it("returns not-found on 404", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    vi.stubGlobal("fetch", mockFetch);

    const result = await lookupProjectByRemote("git@github.com:org/repo.git", host, token, false);
    expect(result).toBe("not-found");
  });

  it("returns null on non-ok non-404 response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal("fetch", mockFetch);

    const result = await lookupProjectByRemote("git@github.com:org/repo.git", host, token, false);
    expect(result).toBeNull();
  });

  it("returns null on network error", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("network error"));
    vi.stubGlobal("fetch", mockFetch);

    const result = await lookupProjectByRemote("git@github.com:org/repo.git", host, token, false);
    expect(result).toBeNull();
  });

  it("encodes git_remote param in URL", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    vi.stubGlobal("fetch", mockFetch);

    await lookupProjectByRemote("git@github.com:org/repo with spaces.git", host, token, false);
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain(encodeURIComponent("git@github.com:org/repo with spaces.git"));
  });

  it("strips trailing slash from host", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    vi.stubGlobal("fetch", mockFetch);

    await lookupProjectByRemote("git@github.com:org/repo.git", "https://app.insights.example.com/", token, false);
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toMatch(/^https:\/\/app\.insights\.example\.com\/api\//);
    expect(calledUrl).not.toContain("//api");
  });
});

describe("lookupProjectByRemote — transport security", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    // Restore the per-test console.error spy so its call history does not leak
    // into sibling tests. vi.spyOn re-spying shares one spy across tests under
    // vitest >= 4, so without this the loopback test sees the reject/warning
    // calls from the two tests above and fails on `not.toHaveBeenCalled()`.
    vi.restoreAllMocks();
  });

  it("rejects a remote http host and never calls fetch", async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await lookupProjectByRemote(
      "git@github.com:org/repo.git",
      "http://attacker.example",
      "tok",
      false
    );

    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("attacker.example"));
  });

  it("allows a remote http host when allowInsecureHttp is true, with a warning", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { project_id: "proj-uuid", name: "Test Project" } }),
    });
    vi.stubGlobal("fetch", mockFetch);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await lookupProjectByRemote(
      "git@github.com:org/repo.git",
      "http://trusted-staging.example",
      "tok",
      false,
      true
    );

    expect(result).toEqual({ project_id: "proj-uuid", name: "Test Project" });
    expect(mockFetch).toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("Warning:"));
  });

  it("still allows loopback http with allowInsecureHttp defaulted to false", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    vi.stubGlobal("fetch", mockFetch);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await lookupProjectByRemote(
      "git@github.com:org/repo.git",
      "http://localhost:3000",
      "tok",
      false
    );

    expect(result).toBe("not-found");
    expect(errSpy).not.toHaveBeenCalled();
  });
});
