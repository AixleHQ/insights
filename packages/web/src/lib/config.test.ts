import { describe, it, expect, afterEach } from "vitest"
import { vi } from "vitest"

async function loadConfig(appConfig?: Record<string, string>) {
  vi.resetModules()
  window.__APP_CONFIG__ = appConfig as typeof window.__APP_CONFIG__
  const { config } = await import("./config")
  return config
}

describe("config.appEnv", () => {
  afterEach(() => {
    delete window.__APP_CONFIG__
  })

  it("uses window.__APP_CONFIG__.appEnv when the entrypoint script injected one", async () => {
    const config = await loadConfig({ appEnv: "staging" })
    expect(config.appEnv).toBe("staging")
  })

  it("falls back to the Vite build mode when no runtime appEnv is injected", async () => {
    const config = await loadConfig(undefined)
    expect(config.appEnv).toBe(import.meta.env.MODE)
  })

  it('falls back to "unknown" (not the build mode) when the runtime appEnv is an empty string (unset container env var)', async () => {
    const config = await loadConfig({ appEnv: "" })
    expect(config.appEnv).toBe("unknown")
  })

  it('falls back to "unknown" when the runtime config object exists but has no appEnv key', async () => {
    const config = await loadConfig({})
    expect(config.appEnv).toBe("unknown")
  })

  it("infers \"staging\" from keycloakUrl when appEnv is missing (APP_ENV unset on that container)", async () => {
    const config = await loadConfig({ keycloakUrl: "https://auth-staging.insights.example.com" })
    expect(config.appEnv).toBe("staging")
  })

  it("infers \"production\" from keycloakUrl when appEnv is missing (APP_ENV unset on that container)", async () => {
    const config = await loadConfig({ keycloakUrl: "https://auth.insights.example.com" })
    expect(config.appEnv).toBe("production")
  })

  it("prefers the authoritative appEnv over keycloakUrl inference when both are present", async () => {
    const config = await loadConfig({ appEnv: "staging", keycloakUrl: "https://auth.insights.example.com" })
    expect(config.appEnv).toBe("staging")
  })

  it('falls back to "unknown" when keycloakUrl does not match a known host and appEnv is missing', async () => {
    const config = await loadConfig({ keycloakUrl: "http://localhost:8080" })
    expect(config.appEnv).toBe("unknown")
  })

  it('falls back to "unknown" when keycloakUrl is malformed and appEnv is missing', async () => {
    const config = await loadConfig({ keycloakUrl: "not-a-valid-url" })
    expect(config.appEnv).toBe("unknown")
  })
})
