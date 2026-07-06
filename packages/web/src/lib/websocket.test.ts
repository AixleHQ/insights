import { describe, it, expect, afterEach, vi } from "vitest";
import { buildCableUrl } from "./websocket";

function stubLocation(protocol: string, host: string): void {
  vi.stubGlobal("location", { protocol, host } as Location);
}

describe("buildCableUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("derives a same-origin ws:// URL from the page origin on HTTP", () => {
    stubLocation("http:", "localhost:5173");
    expect(buildCableUrl()).toBe("ws://localhost:5173/cable");
  });

  it("uses wss:// on HTTPS (production)", () => {
    stubLocation("https:", "app.example.com");
    expect(buildCableUrl()).toBe("wss://app.example.com/cable");
  });

  it("never points at the hardcoded localhost:3000 dev API", () => {
    stubLocation("https:", "app.example.com");
    expect(buildCableUrl()).not.toContain("localhost:3000");
  });

  it("mounts cable at the root path, not under /api/v1", () => {
    stubLocation("https:", "app.example.com");
    expect(buildCableUrl()).not.toContain("/api/v1");
  });
});
