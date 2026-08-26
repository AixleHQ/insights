import { describe, it, expect } from "vitest";
import { describeReadFailure } from "../../lib/parse-error.js";

describe("describeReadFailure", () => {
  it("SyntaxError: reason invalid_json, error is the name only (never the message)", () => {
    let err: unknown;
    try {
      JSON.parse("example_local_fixture_1234567890");
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(SyntaxError);
    // Sanity check on the assumption this test protects: V8 really does embed a prefix of
    // the raw input in a SyntaxError message for tokens it doesn't recognize as JSON — even
    // truncated to ~10 chars, that's enough to identify/correlate a real secret.
    expect((err as Error).message).toContain("example_lo");

    const described = describeReadFailure(err);
    expect(described).toEqual({ reason: "invalid_json", error: "SyntaxError" });
    expect(described.error).not.toContain("example_");
  });

  it("errno error (e.g. EACCES): reason unreadable, error is the errno code", () => {
    const err = Object.assign(new Error("EACCES: permission denied, open '/secret/path'"), {
      code: "EACCES",
    });
    expect(describeReadFailure(err)).toEqual({ reason: "unreadable", error: "EACCES" });
  });

  it("generic Error without a code: reason unreadable, error is the error name", () => {
    expect(describeReadFailure(new TypeError("boom"))).toEqual({
      reason: "unreadable",
      error: "TypeError",
    });
  });

  it("non-Error thrown value: reason unreadable, error is a fixed fallback string", () => {
    expect(describeReadFailure("just a string")).toEqual({
      reason: "unreadable",
      error: "unknown_error",
    });
  });
});
