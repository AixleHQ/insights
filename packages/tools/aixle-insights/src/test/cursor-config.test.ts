import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DEFAULT_CURSOR_PRICING } from "../readers/cursor.js";
import {
  loadCursorConfig,
  parseCursorPricing,
  resolveCursorPricing,
} from "../cursor-config.js";

describe("parseCursorPricing", () => {
  it("extracts valid numeric rates", () => {
    const result = parseCursorPricing({
      pricing: {
        tokens_per_line: 20,
        completion_output_per_mtok: 0.5,
        chat_input_per_mtok: 2,
        chat_output_per_mtok: 10,
      },
    });
    expect(result).toEqual({
      tokens_per_line: 20,
      completion_output_per_mtok: 0.5,
      chat_input_per_mtok: 2,
      chat_output_per_mtok: 10,
    });
  });

  it("ignores invalid and negative values", () => {
    const result = parseCursorPricing({
      pricing: {
        tokens_per_line: -1,
        completion_output_per_mtok: "",
        chat_input_per_mtok: "bad",
        chat_output_per_mtok: 12,
      },
    });
    expect(result).toEqual({ chat_output_per_mtok: 12 });
  });

  it("returns undefined when pricing block is missing", () => {
    expect(parseCursorPricing({})).toBeUndefined();
  });
});

describe("resolveCursorPricing", () => {
  it("merges file config over defaults", () => {
    const dir = mkdtempSync(join(tmpdir(), "aixle-insights-pricing-"));
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "config.json"),
      JSON.stringify({ pricing: { tokens_per_line: 25 } }),
      "utf-8"
    );

    expect(resolveCursorPricing(undefined, dir)).toEqual({
      ...DEFAULT_CURSOR_PRICING,
      tokens_per_line: 25,
    });
  });

  it("lets explicit overrides win over file config", () => {
    const dir = mkdtempSync(join(tmpdir(), "aixle-insights-pricing-"));
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "config.json"),
      JSON.stringify({ pricing: { tokens_per_line: 25 } }),
      "utf-8"
    );

    expect(resolveCursorPricing({ tokens_per_line: 30 }, dir).tokens_per_line).toBe(30);
    expect(loadCursorConfig(dir)).toEqual({ tokens_per_line: 25 });
  });
});
