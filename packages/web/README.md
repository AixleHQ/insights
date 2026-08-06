# Aixle Insights — Web Frontend

React 19 + TypeScript + Vite frontend for the Aixle Insights AI analytics platform.

## Development

```bash
# From repo root
make web        # Start Vite dev server at http://localhost:5173

# Or directly
cd packages/web
npm run dev
```

## Browser Automation & UI Review

The browser MCP is pre-configured in `.mcp.json` at the repo root (`browsermcp` →
`npx @browsermcp/mcp@latest`). Claude Code / Cursor pick it up automatically — no
`claude mcp add` needed.

### One-time setup per machine: install the Chrome extension

Install **Browser MCP** from the [Chrome Web Store](https://chromewebstore.google.com/detail/browser-mcp-automate-your/bjfgambnhccakkhmkepdoekmckoijdlc)
(search for `Browser MCP`).

Once installed:
- The agent connects to your **already-running Chrome** (with your existing Keycloak sessions).
- No new blank browser window opens — it drives your real browser profile locally.
- Nothing leaves your machine; the extension talks to the local MCP server over a WebSocket.

### How it works

```
Chrome (you're logged in) + Browser MCP extension
        ↕ (extension bridges the connection over a local WebSocket)
npx @browsermcp/mcp@latest
        ↕ (stdio MCP protocol)
Claude Code / Cursor
```

Click the Browser MCP icon in the Chrome toolbar to (re)connect the tab you want the
agent to drive. The agent can then navigate, click, screenshot, and inspect the real
app at `http://localhost:5173` as a logged-in user.

### Verify the connection

Ask the agent: *"Take a screenshot of http://localhost:5173"* — if it returns a
screenshot of your logged-in app, the extension is connected.

### Tool reference

| Tool | When the agent uses it | Setup |
|---|---|---|
| **Browser MCP** (`@browsermcp/mcp`) | All browser automation — screenshots, navigation, interaction | Install Chrome extension (above) |
| **`ui-visual-reviewer` agent** | Visual regression after component changes | None — uses Browser MCP above |

---

## Tech Stack

- **React 19** + **TypeScript** (strict mode)
- **Vite** for bundling and dev server
- **shadcn/ui** (Radix UI) for components — prefer existing components over custom
- **TanStack Query** (React Query) for data fetching — no raw `fetch` in components
- **React Router 7** for routing
- **Tailwind CSS v4** for styling — use design tokens, no raw hex values
- **Vitest** + React Testing Library for unit/component tests

## Linting & Testing

```bash
make lint-web     # ESLint
make test-web     # Vitest
```

## Formatting Utilities

All numeric, currency, and date display must go through `src/lib/formatters.ts`. Never use inline `toFixed()`, `toLocaleString()`, or `Intl.NumberFormat` in components or pages.

**Numbers & currency**

| Helper | Input | Output |
|---|---|---|
| `formatCost(n)` | any USD amount | `$0.00` · `$0.0012` (micro) · `$1,234.56` (normal) |
| `formatTokens(n)` | token count | `842` · `125.0K` · `1.2M` |
| `formatCount(n)` | integer count | `1,234` (en-US grouped) |
| `formatPercentage(n)` | fraction | `0.123` → `12.3%`; nullish → `—` |
| `formatPercent(n, decimals=1)` | already-computed percent | `12.3` → `12.3%` |
| `formatAiPercentage(n)` | AI-contribution percent | `60` → `60%`; `66.67` → `66.67%` |
| `formatPerMillion(n)` | per-million USD rate | `$3.00`; nullish → `—` |
| `formatFileSize(bytes)` | byte count | `B` / `KB` / `MB`; nullish → `—` |

**Dates & time**

| Helper | Input | Output |
|---|---|---|
| `formatDateTime(iso)` | ISO timestamp | medium date + short time (en-US); invalid → `—` |
| `formatEventDate(iso)` | ISO timestamp | calendar date in UTC (e.g. `Jun 22, 2026`) for day-granularity events |
| `formatLongUsDate(date)` | `Date` | `June 22, 2026`; invalid → `—` |
| `periodLabel(period)` | `DashboardPeriod` | `All time` / `June 2026` |

**Strings & labels**

| Helper | Purpose |
|---|---|
| `truncateModelName(name)` | truncates long model names to 30 chars + `…` |
| `getEventActorLabel(event)` | display label for an event's actor (user email or attribution) |
| `isDayGranularityEvent(toolName)` | whether an event shows a calendar date vs. relative time |
| `EventAttribution` / `EventAttributionType` | attribution constants + type |

```ts
import { formatCost, formatTokens, formatPercentage } from "@/lib/formatters";

formatCost(0)            // "$0.00"
formatCost(0.00123)      // "$0.0012"
formatCost(1234.56)      // "$1,234.56"
formatTokens(842)        // "842"
formatTokens(125000)     // "125.0K"
formatPercentage(0.123)  // "12.3%"
```

Need a new display type? First check the table above — a helper may already exist
(`formatPercentage`, `formatCount`, `formatDateTime`, …). If not, add a named export to
`formatters.ts` — never inline it at the call site.

## Environment

Copy `.env.example` to `.env.development` (or `.env`) and fill in the values.

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | API base path. `/api/v1` in dev (via the Vite proxy); full URL in production |
| `VITE_INGEST_BASE_URL` | Direct API base used in shell-hook snippets (bypasses the Vite proxy) |
| `VITE_ADMIN_URL` | Admin panel URL used to redirect back after stopping impersonation |
| `VITE_KEYCLOAK_URL` | Keycloak base URL (e.g. `http://localhost:8080`) |
| `VITE_KEYCLOAK_REALM` | Keycloak realm |
| `VITE_KEYCLOAK_CLIENT_ID` | Keycloak SPA client ID |
| `E2E_TEST_EMAIL` | **Required for `npm run test:e2e*`** — login used by Playwright E2E specs |
| `E2E_TEST_PASSWORD` | **Required for `npm run test:e2e*`** — password for the E2E login |

The `E2E_TEST_*` variables are only needed when running the Playwright end-to-end
tests; the app and unit tests run without them.
