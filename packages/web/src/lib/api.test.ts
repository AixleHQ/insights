import { describe, it, expect } from "vitest";
import { ApiError, getApiErrorMessage } from "./api";

describe("getApiErrorMessage", () => {
  it("returns a friendly message for 413, ignoring any parsed body", () => {
    // The reverse proxy rejects oversized bodies before Rails sees the request and
    // returns its own HTML error page, so data is always null in practice — but the
    // 413 branch must win even if something upstream did provide JSON.
    const error = new ApiError("Payload too large", 413, { message: "should be ignored" });
    expect(getApiErrorMessage(error, "fallback")).toBe(
      "File is too large. Please try a smaller file.",
    );
  });

  it("extracts the errors hash from a validation error", () => {
    const error = new ApiError("Validation error", 422, {
      errors: { avatar: [ "must be under 5MB" ] },
    });
    expect(getApiErrorMessage(error, "fallback")).toBe("avatar must be under 5MB");
  });

  it("extracts a top-level message field", () => {
    const error = new ApiError("Request failed", 400, { message: "file must be jpeg, png, gif, or webp and up to 5MB" });
    expect(getApiErrorMessage(error, "fallback")).toBe(
      "file must be jpeg, png, gif, or webp and up to 5MB",
    );
  });

  it("extracts a top-level error field", () => {
    const error = new ApiError("Request failed", 400, { error: "file is required" });
    expect(getApiErrorMessage(error, "fallback")).toBe("file is required");
  });

  it("falls back when data can't be parsed (e.g. an HTML error page)", () => {
    const error = new ApiError("Request failed with status 500", 500, null);
    expect(getApiErrorMessage(error, "fallback")).toBe("fallback");
  });

  it("falls back for non-ApiError values", () => {
    expect(getApiErrorMessage(new Error("boom"), "fallback")).toBe("fallback");
  });
});
