import { resolveAixleIngestHost, resolveAixleKeycloakIssuer } from "@/lib/ingest-host";
import { config } from "@/lib/config";

/**
 * The two npm release channels for `@aixle/insights` (AIX-614).
 *
 * - `stable`  — plain `X.Y.Z`, published to the `latest` dist-tag. What everyone runs.
 * - `staging` — `X.Y.Z-staging`, published to the `staging` dist-tag. QA only; a plain
 *               `npm install` never resolves to it, because no ordinary semver range
 *               matches a prerelease.
 */
export type AixleChannel = "stable" | "staging";

/**
 * A channel is a *target*, not just a package name: it pairs the npm spec with the
 * backend that build should talk to.
 *
 * IMPORTANT — both channels currently resolve to the SAME host, deliberately.
 * Production is not live yet, so stable and staging builds are both pointed at the
 * environment serving this sheet and differ only by npm package. Once production
 * launches, `stable` moves to the production host while `staging` stays on QA, and at
 * that point `host` / `keycloakUrl` will differ per channel.
 *
 * Do not "simplify" this by hoisting the shared host back into a single variable — the
 * duplication is what makes that future change a config edit rather than a refactor of
 * the component. `IngestTokenConnectSheet.test.tsx` asserts the two hosts are currently
 * equal, so it fails loudly at launch, which is exactly when the production target
 * needs filling in.
 */
export interface AixleChannelTarget {
  /** npm spec passed to `npx -y <spec> init` */
  packageSpec: string;
  /** value for `--host` */
  host: string;
  /** value for `--keycloak-url` */
  keycloakUrl: string;
}

export function resolveAixleChannelTarget(channel: AixleChannel): AixleChannelTarget {
  const host = resolveAixleIngestHost();
  const keycloakUrl = resolveAixleKeycloakIssuer();

  switch (channel) {
    case "staging":
      return { packageSpec: "@aixle/insights@staging", host, keycloakUrl };
    case "stable":
    default:
      // TODO(production launch): point this at the production host + realm.
      return { packageSpec: "@aixle/insights", host, keycloakUrl };
  }
}

/**
 * Which channel to preselect. The sheet is served by a specific environment, and the
 * build you want is the one matching it — QA on staging wants the staging build.
 *
 * Correct today (staging → staging) and still correct after the production split, so it
 * needs no revisiting.
 */
export function defaultAixleChannel(): AixleChannel {
  return /(^|\.)staging\./.test(window.location.hostname) ? "staging" : "stable";
}

/**
 * Whether to offer the channel choice at all.
 *
 * On production the answer is always `stable` — the staging channel is a QA/dev concern,
 * and surfacing it there asks users to make a decision they have no basis for (AIX-618
 * QA feedback). Everywhere else — staging, local dev, tests — the choice is real and stays.
 *
 * Deliberately "hide unless production" rather than "show only on staging": `appEnv` is
 * `"unknown"` when APP_ENV is missing from the container (AIX-610), and an unidentified
 * environment is far more likely to be a dev/preview box than production. Production itself
 * is detected twice over — explicit APP_ENV, or the `auth.insights.example.com` Keycloak host —
 * so the fail-open case doesn't leak the toggle into prod.
 */
export function isAixleChannelSelectable(): boolean {
  return config.appEnv !== "production";
}

/** `npx -y @aixle/insights init` with the flags required for MCP device-flow setup. */
export function buildAixleInsightsInitCommand(channel: AixleChannel = "stable"): string {
  const { packageSpec, host, keycloakUrl } = resolveAixleChannelTarget(channel);
  return `npx -y ${packageSpec} init --host ${host} --keycloak-url ${keycloakUrl}`;
}
