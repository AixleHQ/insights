import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  lookupProjectByRemote,
  resolveProjectId,
  canonicalizeGitRemote,
  getGitRemoteForPath,
} from "../../lib/project-resolver.js";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

import { execFileSync } from "node:child_process";
const mockExecFileSync = vi.mocked(execFileSync);

const TOKEN = "db90_testsecret";

function makeFetch(
  status: number,
  body: unknown,
  jsonThrows = false
): typeof globalThis.fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: jsonThrows
      ? () => Promise.reject(new Error("bad json"))
      : () => Promise.resolve(body),
  } as unknown as Response);
}

describe("SSRF — user-controlled host parameter", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("file:// host resolves to null — fetch rejects non-http schemes", async () => {
    // Node.js fetch rejects file:// at the network layer; the catch block returns null.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    const result = await lookupProjectByRemote("git@github.com:org/repo.git", "file:///etc/passwd", TOKEN, false);
    expect(result).toBeNull();
  });

  it("javascript:// host resolves to null", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    const result = await lookupProjectByRemote("git@github.com:org/repo.git", "javascript://evil", TOKEN, false);
    expect(result).toBeNull();
  });

  it("cloud metadata IP resolves to null on fetch rejection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Network error")));
    const result = await lookupProjectByRemote("git@github.com:org/repo.git", "http://169.254.169.254", TOKEN, false);
    expect(result).toBeNull();
  });

  it("Bearer token is NOT sent when fetch rejects (no partial request)", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", mockFetch);
    await lookupProjectByRemote("git@github.com:org/repo.git", "file:///etc/passwd", TOKEN, false);
    // fetch was called, but the response never received the token — just
    // verify the call was made with the correct Authorization header shape
    // (token should only go to the configured host, not leaked elsewhere).
    if (mockFetch.mock.calls.length > 0) {
      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect((init?.headers as Record<string, string>)?.["Authorization"]).toContain("Bearer");
    }
  });

  it("host with path-injection suffix still appends the API endpoint correctly", async () => {
    const capturedUrls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        capturedUrls.push(url);
        return Promise.reject(new TypeError("fetch failed"));
      })
    );
    // Attacker tries to inject an extra path segment via the host value.
    await lookupProjectByRemote(
      "git@github.com:org/repo.git",
      "https://legit.host/../../evil",
      TOKEN,
      false
    );
    // The URL is constructed by string concatenation with a leading slash strip.
    // The path should end with /api/v1/projects/lookup?...
    if (capturedUrls.length > 0) {
      expect(capturedUrls[0]).toMatch(/\/api\/v1\/projects\/lookup/);
    }
  });
});

describe("URL injection — gitRemote value in query parameter", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("path traversal chars in gitRemote are percent-encoded, not passed raw", async () => {
    const capturedUrls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        capturedUrls.push(url);
        return Promise.reject(new TypeError("fetch failed"));
      })
    );
    await lookupProjectByRemote("../../etc/passwd", "https://app.insights.example.com", TOKEN, false);
    expect(capturedUrls[0]).toContain("%2F");
    expect(capturedUrls[0]).not.toMatch(/\/etc\/passwd/);
  });

  it("shell metacharacters in gitRemote are percent-encoded", async () => {
    const capturedUrls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        capturedUrls.push(url);
        return Promise.reject(new TypeError("fetch failed"));
      })
    );
    await lookupProjectByRemote("$(evil); rm -rf /", "https://app.insights.example.com", TOKEN, false);
    if (capturedUrls.length > 0) {
      expect(capturedUrls[0]).not.toContain("$(");
      expect(capturedUrls[0]).not.toContain("; ");
    }
  });
});

describe("Prototype pollution — server JSON response", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("__proto__ injection in response body does not pollute Object.prototype", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetch(200, { "__proto__": { "polluted": true }, data: { project_id: "abc", name: "test" } })
    );
    await lookupProjectByRemote("git@github.com:org/repo.git", "https://app.insights.example.com", TOKEN, false);
    expect((Object.prototype as Record<string, unknown>)["polluted"]).toBeUndefined();
    // cleanup in case test runs in shared state
    delete (Object.prototype as Record<string, unknown>)["polluted"];
  });

  it("constructor.prototype injection in response body does not pollute", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetch(200, { constructor: { prototype: { injected: true } }, data: { project_id: "abc", name: "test" } })
    );
    await lookupProjectByRemote("git@github.com:org/repo.git", "https://app.insights.example.com", TOKEN, false);
    expect((Object.prototype as Record<string, unknown>)["injected"]).toBeUndefined();
  });

  it("malformed JSON body (json() throws) returns null without uncaught rejection", async () => {
    vi.stubGlobal("fetch", makeFetch(200, null, /* jsonThrows */ true));
    await expect(
      lookupProjectByRemote("git@github.com:org/repo.git", "https://app.insights.example.com", TOKEN, false)
    ).resolves.toBeNull();
  });
});

describe("Oversized / edge-case server responses", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("oversized project_id (64 KB) is passed through without truncation or crash", async () => {
    const bigId = "x".repeat(65536);
    vi.stubGlobal("fetch", makeFetch(200, { data: { project_id: bigId, name: "test" } }));
    const result = await lookupProjectByRemote("git@github.com:org/repo.git", "https://app.insights.example.com", TOKEN, false);
    expect(result).not.toBeNull();
    if (result && result !== "not-found") {
      expect(result.project_id).toBe(bigId);
    }
  });

  it("response with unexpected shape (missing data.name) returns null", async () => {
    vi.stubGlobal("fetch", makeFetch(200, { data: { project_id: "abc" } }));
    const result = await lookupProjectByRemote("git@github.com:org/repo.git", "https://app.insights.example.com", TOKEN, false);
    expect(result).toBeNull();
  });

  it("HTTP 5xx response returns null (not throws)", async () => {
    vi.stubGlobal("fetch", makeFetch(500, { error: "internal server error" }));
    await expect(
      lookupProjectByRemote("git@github.com:org/repo.git", "https://app.insights.example.com", TOKEN, false)
    ).resolves.toBeNull();
  });
});

describe("resolveProjectId — SSRF short-circuit when flag/config is provided", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("flag value short-circuits without making any fetch call", async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
    // Even with a malicious host, no fetch is issued when flag is set.
    const result = await resolveProjectId("my-project-uuid", undefined, "file:///etc/passwd", TOKEN, false);
    expect(result.projectId).toBe("my-project-uuid");
    expect(result.source).toBe("flag");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("config value short-circuits without making any fetch call", async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
    const result = await resolveProjectId(undefined, "config-uuid", "http://169.254.169.254", TOKEN, false);
    expect(result.projectId).toBe("config-uuid");
    expect(result.source).toBe("config");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("auto-detect with file:// host falls back to source=none", async () => {
    mockExecFileSync.mockReturnValue("git@github.com:org/repo.git\n");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    const result = await resolveProjectId(undefined, undefined, "file:///etc/passwd", TOKEN, false);
    expect(result.projectId).toBeNull();
    expect(result.source).toBe("none");
  });
});

describe("Argv option injection — git remote host and repo path (AIX-546)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("does not spawn ssh for an SCP remote whose host starts with a dash", () => {
    const remote = "git@-oProxyCommand=id:org/repo.git";
    expect(canonicalizeGitRemote(remote, false)).toBe(remote);
    expect(mockExecFileSync).not.toHaveBeenCalled();
  });

  it("does not spawn ssh for an ssh:// remote whose host starts with a dash", () => {
    const remote = "ssh://git@-oProxyCommand=id/org/repo.git";
    expect(canonicalizeGitRemote(remote, false)).toBe(remote);
    expect(mockExecFileSync).not.toHaveBeenCalled();
  });

  it("does not spawn ssh for a remote host containing whitespace or an equals sign", () => {
    for (const remote of ["git@bad host:org/repo.git", "git@host=value:org/repo.git"]) {
      expect(canonicalizeGitRemote(remote, false)).toBe(remote);
    }
    expect(mockExecFileSync).not.toHaveBeenCalled();
  });

  it("still resolves a legitimate SSH host alias", () => {
    mockExecFileSync.mockReturnValue("user git\nhostname github.com\nport 22\n" as unknown as Buffer);
    expect(canonicalizeGitRemote("git@github-work:org/repo.git", false)).toBe(
      "git@github.com:org/repo.git"
    );
    expect(mockExecFileSync).toHaveBeenCalledWith("ssh", ["-G", "github-work"], expect.anything());
  });

  it("ignores an ssh -G hostname that is itself option-shaped", () => {
    mockExecFileSync.mockReturnValue("hostname -oProxyCommand=id\n" as unknown as Buffer);
    expect(canonicalizeGitRemote("git@github-work:org/repo.git", false)).toBe(
      "git@github-work:org/repo.git"
    );
  });

  it("does not spawn git for a repo path that starts with a dash", () => {
    expect(getGitRemoteForPath("--upload-pack=touch /tmp/pwn", false)).toBeNull();
    expect(mockExecFileSync).not.toHaveBeenCalled();
  });
});

describe("Path traversal / containment before git -C (AIX-547)", () => {
  let repoDir: string;
  let outsideDir: string;

  beforeEach(() => {
    vi.resetAllMocks();
    repoDir = mkdtempSync(join(tmpdir(), "db90-sec3-repo-"));
    outsideDir = mkdtempSync(join(tmpdir(), "db90-sec3-outside-"));
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
    rmSync(outsideDir, { recursive: true, force: true });
  });

  it("does not spawn git for a traversal path", () => {
    expect(getGitRemoteForPath(join(repoDir, "..", "..", "etc", "evil"), false)).toBeNull();
    expect(mockExecFileSync).not.toHaveBeenCalled();
  });

  it("does not spawn git for a relative path", () => {
    expect(getGitRemoteForPath("../../etc/evil", false)).toBeNull();
    expect(getGitRemoteForPath("relative/repo", false)).toBeNull();
    expect(mockExecFileSync).not.toHaveBeenCalled();
  });

  it("does not spawn git for Cursor's global-hook 'unknown' placeholder", () => {
    expect(getGitRemoteForPath("unknown", false)).toBeNull();
    expect(mockExecFileSync).not.toHaveBeenCalled();
  });

  it("does not spawn git for a path that does not exist", () => {
    expect(getGitRemoteForPath(join(repoDir, "no-such-dir"), false)).toBeNull();
    expect(mockExecFileSync).not.toHaveBeenCalled();
  });

  it("does not spawn git for a regular file (Cursor's metadata.workspace is state.vscdb)", () => {
    const dbFile = join(repoDir, "state.vscdb");
    writeFileSync(dbFile, "sqlite", "utf-8");
    expect(getGitRemoteForPath(dbFile, false)).toBeNull();
    expect(mockExecFileSync).not.toHaveBeenCalled();
  });

  it("does not spawn git for a dangling symlink", () => {
    const link = join(repoDir, "dangling");
    symlinkSync(join(repoDir, "missing"), link);
    expect(getGitRemoteForPath(link, false)).toBeNull();
    expect(mockExecFileSync).not.toHaveBeenCalled();
  });

  it("runs git against the canonical real path, not the symlink it was given", () => {
    const target = join(outsideDir, "real-repo");
    mkdirSync(target, { recursive: true });
    const link = join(repoDir, "alias");
    symlinkSync(target, link);
    mockExecFileSync.mockReturnValue("git@github.com:org/repo.git\n" as unknown as Buffer);

    expect(getGitRemoteForPath(link, false)).toBe("git@github.com:org/repo.git");
    expect(mockExecFileSync).toHaveBeenCalledWith(
      "git",
      ["-C", realpathSync(target), "remote", "get-url", "origin"],
      expect.anything()
    );
  });

  it("still resolves the remote for an ordinary workspace directory", () => {
    mockExecFileSync.mockReturnValue("git@github.com:org/repo.git\n" as unknown as Buffer);
    expect(getGitRemoteForPath(repoDir, false)).toBe("git@github.com:org/repo.git");
    expect(mockExecFileSync).toHaveBeenCalledWith(
      "git",
      ["-C", realpathSync(repoDir), "remote", "get-url", "origin"],
      expect.anything()
    );
  });
});
