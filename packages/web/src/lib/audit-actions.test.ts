import { describe, it, expect } from "vitest";
import { AUDIT_ACTION_LABELS, AUDIT_ACTION_OPTIONS } from "./audit-actions";

describe("AUDIT_ACTION_LABELS", () => {
  it("maps every expected action to a human-readable label", () => {
    const expectedActions = [
      "settings.create",
      "settings.update",
      "settings.delete",
      "connector.create",
      "connector.update",
      "connector.delete",
      "connector.test",
      "connector.sync",
      "member.invited",
      "member.role_changed",
      "member.removed",
      "impersonation.started",
      "impersonation.ended",
    ];

    for (const action of expectedActions) {
      expect(AUDIT_ACTION_LABELS[action]).toBeDefined();
      expect(typeof AUDIT_ACTION_LABELS[action]).toBe("string");
      expect(AUDIT_ACTION_LABELS[action].length).toBeGreaterThan(0);
    }
  });

  it("contains no empty labels", () => {
    for (const [key, label] of Object.entries(AUDIT_ACTION_LABELS)) {
      expect(label.trim(), `Label for "${key}" should not be empty`).not.toBe("");
    }
  });
});

describe("AUDIT_ACTION_OPTIONS", () => {
  it('starts with "All Actions" option', () => {
    expect(AUDIT_ACTION_OPTIONS[0]).toEqual({ value: "all", label: "All Actions" });
  });

  it("includes one option per action label plus All Actions", () => {
    const labelCount = Object.keys(AUDIT_ACTION_LABELS).length;
    expect(AUDIT_ACTION_OPTIONS).toHaveLength(labelCount + 1);
  });

  it("has value and label on every option", () => {
    for (const option of AUDIT_ACTION_OPTIONS) {
      expect(option).toHaveProperty("value");
      expect(option).toHaveProperty("label");
      expect(typeof option.value).toBe("string");
      expect(typeof option.label).toBe("string");
    }
  });

  it("derives option labels from AUDIT_ACTION_LABELS", () => {
    const derived = AUDIT_ACTION_OPTIONS.slice(1);
    for (const option of derived) {
      expect(AUDIT_ACTION_LABELS[option.value]).toBe(option.label);
    }
  });
});
