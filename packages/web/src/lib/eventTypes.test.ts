import { describe, expect, it } from "vitest";
import {
  EVENT_TYPE_LABEL,
  dbTypesForCategory,
  labelForEventType,
} from "./eventTypes";

describe("labelForEventType", () => {
  it("maps known DB values to display labels", () => {
    expect(labelForEventType("chat")).toBe("Prompt");
    expect(labelForEventType("tool_use")).toBe("Function Call");
    expect(labelForEventType("edit")).toBe("Edit");
  });

  it("falls back to humanized unknown types", () => {
    expect(labelForEventType("unknown_type")).toBe("unknown type");
  });
});

describe("dbTypesForCategory", () => {
  it("expands UI categories to DB event_type values", () => {
    expect(dbTypesForCategory("prompt")).toEqual(["chat"]);
    expect(dbTypesForCategory("file_operation")).toEqual([
      "edit",
      "refactor",
      "documentation",
      "test",
      "debug",
    ]);
  });

});

describe("EVENT_TYPE_LABEL", () => {
  it("covers all 14 DB-backed event types with non-empty labels", () => {
    const dbValues = [
      "chat",
      "completion",
      "tool_use",
      "edit",
      "refactor",
      "documentation",
      "test",
      "debug",
      "commit",
      "review",
      "other",
      "issue",
      "comment",
      "sprint",
    ] as const;

    for (const value of dbValues) {
      expect(EVENT_TYPE_LABEL[value]).toBeTruthy();
    }
  });
});
