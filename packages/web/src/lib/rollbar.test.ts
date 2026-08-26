import { describe, it, expect, vi } from "vitest"

vi.mock("./config", () => ({
  config: {
    rollbarClientToken: "test-token",
    appEnv: "staging",
  },
}))

import { rollbarConfig } from "./rollbar"

describe("rollbarConfig", () => {
  it("reports the runtime-resolved appEnv as the Rollbar environment, not the Vite build mode", () => {
    expect(rollbarConfig.environment).toBe("staging")
  })

  it("enables reporting only when a client token is configured", () => {
    expect(rollbarConfig.enabled).toBe(true)
  })
})
