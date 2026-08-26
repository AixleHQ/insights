import { describe, it, expect, vi, afterEach } from "vitest"

async function loadModule() {
  vi.resetModules()
  return await import("./aixle-cli")
}

function setHostname(hostname: string) {
  // jsdom's window.location is not writable; redefining the property is the
  // supported way to stub it for a single assertion.
  Object.defineProperty(window, "location", {
    value: { ...window.location, hostname },
    writable: true,
    configurable: true,
  })
}

const originalLocation = window.location

describe("resolveAixleChannelTarget", () => {
  it("uses the plain package spec for the stable channel", async () => {
    const { resolveAixleChannelTarget } = await loadModule()
    expect(resolveAixleChannelTarget("stable").packageSpec).toBe("@aixle/insights")
  })

  it("uses the @staging dist-tag for the staging channel", async () => {
    const { resolveAixleChannelTarget } = await loadModule()
    expect(resolveAixleChannelTarget("staging").packageSpec).toBe("@aixle/insights@staging")
  })

  // This asserts the CURRENT phase, deliberately. Production is not live yet, so both
  // channels point at the environment serving the sheet and differ only by npm package.
  // When `stable` is repointed at the production host, this test SHOULD fail — that is
  // the signal to fill in the production target rather than a regression.
  it("currently resolves both channels to the same host and realm (pre-production)", async () => {
    const { resolveAixleChannelTarget } = await loadModule()
    const stable = resolveAixleChannelTarget("stable")
    const staging = resolveAixleChannelTarget("staging")
    expect(staging.host).toBe(stable.host)
    expect(staging.keycloakUrl).toBe(stable.keycloakUrl)
  })
})

describe("buildAixleInsightsInitCommand", () => {
  it("defaults to the stable channel when no channel is passed", async () => {
    const { buildAixleInsightsInitCommand } = await loadModule()
    const cmd = buildAixleInsightsInitCommand()
    expect(cmd).toContain("npx -y @aixle/insights init")
    expect(cmd).not.toContain("@aixle/insights@staging")
  })

  it("emits the staging spec for the staging channel", async () => {
    const { buildAixleInsightsInitCommand } = await loadModule()
    expect(buildAixleInsightsInitCommand("staging")).toContain(
      "npx -y @aixle/insights@staging init",
    )
  })

  it("always passes both --host and --keycloak-url", async () => {
    const { buildAixleInsightsInitCommand } = await loadModule()
    for (const channel of ["stable", "staging"] as const) {
      const cmd = buildAixleInsightsInitCommand(channel)
      expect(cmd).toContain("--host ")
      expect(cmd).toContain("--keycloak-url ")
    }
  })

  it("changes only the package spec between channels, not the flags", async () => {
    const { buildAixleInsightsInitCommand } = await loadModule()
    const stable = buildAixleInsightsInitCommand("stable")
    const staging = buildAixleInsightsInitCommand("staging")
    // Strip the differing spec; the remainder (flags + values) must be identical.
    expect(staging.replace("@aixle/insights@staging", "@aixle/insights")).toBe(stable)
  })
})

describe("defaultAixleChannel", () => {
  afterEach(() => {
    Object.defineProperty(window, "location", {
      value: originalLocation,
      writable: true,
      configurable: true,
    })
  })

  it("preselects staging when the sheet is served from a staging host", async () => {
    setHostname("staging.insights.example.com")
    const { defaultAixleChannel } = await loadModule()
    expect(defaultAixleChannel()).toBe("staging")
  })

  it("preselects stable on the production host", async () => {
    setHostname("insights.example.com")
    const { defaultAixleChannel } = await loadModule()
    expect(defaultAixleChannel()).toBe("stable")
  })

  it("preselects stable for local development", async () => {
    setHostname("localhost")
    const { defaultAixleChannel } = await loadModule()
    expect(defaultAixleChannel()).toBe("stable")
  })

  it("does not match a host that merely contains the word staging", async () => {
    setHostname("stagingfoo.example.com")
    const { defaultAixleChannel } = await loadModule()
    expect(defaultAixleChannel()).toBe("stable")
  })
})

describe("isAixleChannelSelectable", () => {
  function setAppConfig(appConfig: Record<string, string> | undefined) {
    // config.ts reads window.__APP_CONFIG__ once at module evaluation, so each case
    // sets it before loadModule()'s vi.resetModules() forces a fresh evaluation.
    ;(window as unknown as { __APP_CONFIG__?: unknown }).__APP_CONFIG__ = appConfig
  }

  afterEach(() => {
    setAppConfig(undefined)
  })

  it("hides the channel choice on production", async () => {
    setAppConfig({ appEnv: "production" })
    const { isAixleChannelSelectable } = await loadModule()
    expect(isAixleChannelSelectable()).toBe(false)
  })

  it("offers the channel choice on staging", async () => {
    setAppConfig({ appEnv: "staging" })
    const { isAixleChannelSelectable } = await loadModule()
    expect(isAixleChannelSelectable()).toBe(true)
  })

  // APP_ENV has been observed missing on some containers (AIX-610). config.ts then
  // infers the environment from the Keycloak host, which is set reliably per environment.
  it("still hides the choice when APP_ENV is missing but Keycloak identifies production", async () => {
    setAppConfig({ keycloakUrl: "https://auth.insights.example.com" })
    const { isAixleChannelSelectable } = await loadModule()
    expect(isAixleChannelSelectable()).toBe(false)
  })

  it("offers the choice when APP_ENV is missing but Keycloak identifies staging", async () => {
    setAppConfig({ keycloakUrl: "https://auth-staging.insights.example.com" })
    const { isAixleChannelSelectable } = await loadModule()
    expect(isAixleChannelSelectable()).toBe(true)
  })

  // Fail open: an unidentifiable environment is far likelier to be a dev/preview box than
  // production, and production is detected by two independent signals above.
  it("offers the choice when the environment cannot be identified at all", async () => {
    setAppConfig({ keycloakUrl: "https://auth.example.invalid" })
    const { isAixleChannelSelectable } = await loadModule()
    expect(isAixleChannelSelectable()).toBe(true)
  })

  it("offers the choice in local development, where there is no injected app config", async () => {
    setAppConfig(undefined)
    const { isAixleChannelSelectable } = await loadModule()
    expect(isAixleChannelSelectable()).toBe(true)
  })
})
