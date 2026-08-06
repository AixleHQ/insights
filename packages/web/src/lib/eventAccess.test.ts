import { describe, it, expect } from "vitest";
import { canViewEventPrompt, showEventsUserColumn } from "./eventAccess";

describe("eventAccess", () => {
  describe("canViewEventPrompt", () => {
    it("allows organization owners", () => {
      expect(canViewEventPrompt("owner")).toBe(true);
    });

    it("allows global admins even without owner role", () => {
      expect(canViewEventPrompt("member", true)).toBe(true);
      expect(canViewEventPrompt(null, true)).toBe(true);
    });

    it("denies members, viewers, and admins-by-name without global flag", () => {
      expect(canViewEventPrompt("member")).toBe(false);
      expect(canViewEventPrompt("viewer")).toBe(false);
      expect(canViewEventPrompt("admin")).toBe(false);
    });

    it("denies null or undefined roles", () => {
      expect(canViewEventPrompt(null)).toBe(false);
      expect(canViewEventPrompt(undefined)).toBe(false);
    });
  });

  describe("showEventsUserColumn", () => {
    it("matches canViewEventPrompt (owner only)", () => {
      expect(showEventsUserColumn("owner")).toBe(true);
      expect(showEventsUserColumn("member")).toBe(false);
      expect(showEventsUserColumn(null)).toBe(false);
    });
  });
});
