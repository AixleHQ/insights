import { describe, it, expect } from "vitest";
import { canViewEventPrompt, showEventsUserColumn } from "./eventAccess";

describe("eventAccess", () => {
  describe("canViewEventPrompt", () => {
    it("allows organization owners", () => {
      expect(canViewEventPrompt("owner")).toBe(true);
    });

    it("denies members, viewers, and admins-by-name", () => {
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
