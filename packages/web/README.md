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

All numeric display must go through `src/lib/formatters.ts`. Never use inline `toFixed()`, `toLocaleString()`, or `Intl.NumberFormat` in components or pages.

| Helper | Input | Output |
|---|---|---|
| `formatCost(n)` | any USD amount | `$0.00` · `$0.0012` (micro) · `$1,234.56` (normal) |
| `formatTokens(n)` | token count | `842` · `125.0K` · `1.2M` |

```ts
import { formatCost, formatTokens } from "@/lib/formatters";

formatCost(0)          // "$0.00"
formatCost(0.00123)    // "$0.0012"
formatCost(1234.56)    // "$1,234.56"
formatTokens(842)      // "842"
formatTokens(125000)   // "125.0K"
formatTokens(1200000)  // "1.2M"
```

If a new numeric type needs display (percentages, durations, event counts), add a named export to `formatters.ts` — do not inline it at the call site.
