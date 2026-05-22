import { describe, expect, it } from "vitest";
import { SYNC_NOW_INPUT_SCHEMA } from "../server.js";

describe("SYNC_NOW_INPUT_SCHEMA", () => {
  it("rejects unsupported tool enums", () => {
    expect(SYNC_NOW_INPUT_SCHEMA.safeParse({ tools: ["cursor", "github_copilot"] }).success).toBe(false);
  });

  it("rejects stray keys under strict()", () => {
    expect(SYNC_NOW_INPUT_SCHEMA.safeParse({ surprise: true }).success).toBe(false);
  });

  it("allows empty-object input (meaning: sync everything)", () => {
    expect(SYNC_NOW_INPUT_SCHEMA.parse({})).toEqual({});
  });

  it("allows a valid subset filter", () => {
    expect(SYNC_NOW_INPUT_SCHEMA.parse({ tools: ["cursor"] })).toEqual({ tools: ["cursor"] });
  });

  it("rejects duplicate tool filters", () => {
    expect(SYNC_NOW_INPUT_SCHEMA.safeParse({ tools: ["cursor", "cursor"] }).success).toBe(false);
  });
});
