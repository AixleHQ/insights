import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolveProjectId, getGitRemote, lookupProjectByRemote } from "../project-resolver.js";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

import { execFileSync } from "node:child_process";
const mockExecFileSync = vi.mocked(execFileSync);

describe("resolveProjectId", () => {
  const host = "https://app.db90.io";
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
});

describe("lookupProjectByRemote", () => {
  const host = "https://app.db90.io";
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

    await lookupProjectByRemote("git@github.com:org/repo.git", "https://app.db90.io/", token, false);
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toMatch(/^https:\/\/app\.db90\.io\/api\//);
    expect(calledUrl).not.toContain("//api");
  });
});
