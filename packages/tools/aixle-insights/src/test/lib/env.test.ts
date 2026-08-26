import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readBooleanEnvWithDeprecatedAlias,
  readEnvWithDeprecatedAlias,
  warnDeprecatedEnvVar,
} from "../../lib/env.js";

const CURRENT = "AIXLE_INSIGHTS_TEST_VAR";
const DEPRECATED = "DB90_TEST_VAR";

afterEach(() => {
  delete process.env[CURRENT];
  delete process.env[DEPRECATED];
});

describe("readEnvWithDeprecatedAlias", () => {
  it("returns undefined when neither var is set", () => {
    expect(readEnvWithDeprecatedAlias({ current: CURRENT, deprecated: DEPRECATED })).toBeUndefined();
  });

  it("returns the current value when only the current var is set", () => {
    process.env[CURRENT] = "current-value";
    expect(readEnvWithDeprecatedAlias({ current: CURRENT, deprecated: DEPRECATED })).toBe("current-value");
  });

  it("falls back to the deprecated value when the current var is unset", () => {
    process.env[DEPRECATED] = "deprecated-value";
    expect(readEnvWithDeprecatedAlias({ current: CURRENT, deprecated: DEPRECATED })).toBe("deprecated-value");
  });

  it("prefers the current value when both are set", () => {
    process.env[CURRENT] = "current-value";
    process.env[DEPRECATED] = "deprecated-value";
    expect(readEnvWithDeprecatedAlias({ current: CURRENT, deprecated: DEPRECATED })).toBe("current-value");
  });

  it("trims whitespace from both names", () => {
    process.env[DEPRECATED] = "  deprecated-value  ";
    expect(readEnvWithDeprecatedAlias({ current: CURRENT, deprecated: DEPRECATED })).toBe("deprecated-value");
  });

  it("treats an empty/whitespace-only current value as unset and falls back", () => {
    process.env[CURRENT] = "   ";
    process.env[DEPRECATED] = "deprecated-value";
    expect(readEnvWithDeprecatedAlias({ current: CURRENT, deprecated: DEPRECATED })).toBe("deprecated-value");
  });

  it("calls onDeprecatedUse only when the deprecated var supplies the value", () => {
    const onDeprecatedUse = vi.fn();
    process.env[DEPRECATED] = "deprecated-value";
    readEnvWithDeprecatedAlias({ current: CURRENT, deprecated: DEPRECATED, onDeprecatedUse });
    expect(onDeprecatedUse).toHaveBeenCalledWith(DEPRECATED, CURRENT);
  });

  it("does not call onDeprecatedUse when the current var supplies the value", () => {
    const onDeprecatedUse = vi.fn();
    process.env[CURRENT] = "current-value";
    process.env[DEPRECATED] = "deprecated-value";
    readEnvWithDeprecatedAlias({ current: CURRENT, deprecated: DEPRECATED, onDeprecatedUse });
    expect(onDeprecatedUse).not.toHaveBeenCalled();
  });

  it("does not call onDeprecatedUse when neither var is set", () => {
    const onDeprecatedUse = vi.fn();
    readEnvWithDeprecatedAlias({ current: CURRENT, deprecated: DEPRECATED, onDeprecatedUse });
    expect(onDeprecatedUse).not.toHaveBeenCalled();
  });
});

describe("readBooleanEnvWithDeprecatedAlias", () => {
  it.each(["1", "true", "yes", "TRUE", "Yes"])("treats %s as true", (raw) => {
    process.env[CURRENT] = raw;
    expect(readBooleanEnvWithDeprecatedAlias({ current: CURRENT, deprecated: DEPRECATED })).toBe(true);
  });

  it.each(["0", "false", "no", "", undefined])("treats %s as false", (raw) => {
    if (raw !== undefined) process.env[CURRENT] = raw;
    expect(readBooleanEnvWithDeprecatedAlias({ current: CURRENT, deprecated: DEPRECATED })).toBe(false);
  });

  it("falls back to the deprecated var for boolean parsing", () => {
    process.env[DEPRECATED] = "true";
    expect(readBooleanEnvWithDeprecatedAlias({ current: CURRENT, deprecated: DEPRECATED })).toBe(true);
  });
});

describe("warnDeprecatedEnvVar", () => {
  it("logs a message naming both the deprecated and current var", () => {
    const log = vi.fn();
    warnDeprecatedEnvVar(DEPRECATED, CURRENT, log);
    expect(log).toHaveBeenCalledWith(`Warning: ${DEPRECATED} is deprecated; use ${CURRENT} instead.`);
  });

  it("defaults to console.error when no log function is given", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    warnDeprecatedEnvVar(DEPRECATED, CURRENT);
    expect(errorSpy).toHaveBeenCalledWith(`Warning: ${DEPRECATED} is deprecated; use ${CURRENT} instead.`);
    errorSpy.mockRestore();
  });
});
