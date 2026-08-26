import { describe, it, expect, beforeEach, vi } from "vitest";

// glob treats `\` as an escape character on EVERY platform — its docs are
// explicit that "glob patterns should always use `/` as a path separator, even
// on Windows systems". So a pattern built with `path.join` silently matches
// nothing on Windows, because join emits `\` there.
//
// That failure is invisible to the rest of the suite: on POSIX `join` emits `/`,
// so behavioural tests pass either way, and the Windows CI lane only runs
// `npm ci` + `npm run build`, never the tests. These assertions inspect the
// pattern itself, which is the only part observable from POSIX.
const { globSync } = vi.hoisted(() => ({
  globSync: vi.fn((): string[] => []),
}));
vi.mock("glob", () => ({ glob: { sync: globSync } }));

const { findCursorDbs, findStateVscDbs, findCursorTranscriptFiles } =
  await import("../readers/cursor.js");

describe("glob patterns are path-separator safe", () => {
  beforeEach(() => {
    globSync.mockClear();
  });

  it("findCursorDbs builds a forward-slash pattern rooted by cwd", () => {
    findCursorDbs("/base/dir");

    expect(globSync).toHaveBeenCalledTimes(1);
    const [pattern, options] = globSync.mock.calls[0] as [
      string,
      { cwd?: string } | undefined,
    ];
    expect(pattern).not.toContain("\\");
    expect(options?.cwd).toBeTruthy();
  });

  it("findStateVscDbs builds a forward-slash pattern rooted by cwd", () => {
    findStateVscDbs("/base/dir");

    expect(globSync).toHaveBeenCalledTimes(1);
    const [pattern, options] = globSync.mock.calls[0] as [
      string,
      { cwd?: string } | undefined,
    ];
    expect(pattern).not.toContain("\\");
    expect(options?.cwd).toBeTruthy();
  });

  it("findCursorTranscriptFiles builds a forward-slash pattern rooted by cwd", () => {
    findCursorTranscriptFiles(["/base/dir"]);

    expect(globSync).toHaveBeenCalledTimes(1);
    const [pattern, options] = globSync.mock.calls[0] as [
      string,
      { cwd?: string } | undefined,
    ];
    expect(pattern).not.toContain("\\");
    expect(options?.cwd).toBeTruthy();
  });
});
