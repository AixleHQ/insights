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

// AIX-370 A09-6 — the frontend half of the error-echo fix.
//
// The ticket lists A09-6 as riding on A09-1: once the backend stops sending provider
// text, there is nothing for the UI to display. That is true, but it was only ever an
// argument. These pin it.
describe("AI gateway errors are not amplified by the client (AIX-370 A09-6)", () => {
  const PROVIDER_HOST = "api-internal-7f3a.provider.example";
  const PROVIDER_REQUEST_ID = "req_canary_9f8a1b2c3d4e5f60";

  it("shows the backend's generic message for a real AI gateway auth failure", () => {
    // Exactly what the API now returns — see ai_gateway_controller#render_ai_error.
    const error = new ApiError("Authentication with the AI provider failed.", 401, {
      error: "Authentication Failed",
      message: "Authentication with the AI provider failed.",
    });

    expect(getApiErrorMessage(error, "fallback")).toBe(
      "Authentication with the AI provider failed.",
    );
  });

  it("reads only known fields, so extra body keys cannot reach the UI", () => {
    // Defence in depth: if a future backend change ever attached provider detail as a
    // sibling field, the client must still surface only `message`. This is what stops
    // the frontend re-opening A09-6 independently of the backend.
    const error = new ApiError("Authentication with the AI provider failed.", 401, {
      error: "Authentication Failed",
      message: "Authentication with the AI provider failed.",
      upstream_host: PROVIDER_HOST,
      request_id: PROVIDER_REQUEST_ID,
    });

    const shown = getApiErrorMessage(error, "fallback");

    expect(shown).toBe("Authentication with the AI provider failed.");
    expect(shown).not.toContain(PROVIDER_HOST);
    expect(shown).not.toContain(PROVIDER_REQUEST_ID);
  });
});
