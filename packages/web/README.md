# DB90 — Web Frontend

React 19 + TypeScript + Vite frontend for the DB90 AI analytics platform.

## Development

```bash
# From repo root
make web        # Start Vite dev server at http://localhost:5173

# Or directly
cd packages/web
npm run dev
```

## Browser Automation & UI Review

The browser MCP is pre-configured in `.mcp.json` at the repo root. Claude Code picks it up automatically — no `claude mcp add` needed.

### One-time setup per machine: install the Chrome extension

Install **Playwright MCP Bridge** from the Chrome Web Store. Search for `Playwright MCP Bridge` by Microsoft.

Once installed:
- Claude Code connects to your **already-running Chrome** (with your existing Keycloak sessions).
- No new blank browser window opens.
- No port to configure — it uses a stdio connection via `npx @playwright/mcp`.

### How it works

```
Chrome (you're logged in) + Playwright MCP Bridge extension
        ↕ (extension bridges the connection)
npx @playwright/mcp@latest --extension --browser chrome
        ↕ (stdio MCP protocol)
Claude Code
```

Claude can then navigate, click, screenshot, and inspect the real app at `http://localhost:5173` as a logged-in user.

### Verify the connection

In Claude Code, ask: *"Take a screenshot of http://localhost:5173"* — if Chrome opens to that URL and Claude returns a screenshot, the extension is connected.

### Tool reference

| Tool | When Claude uses it | Setup |
|---|---|---|
| **Playwright MCP** (`@playwright/mcp --extension`) | All browser automation — screenshots, navigation, interaction | Install Chrome extension (above) |
| **`playwright-cli` skill** | Reference for browser automation commands inside Claude sessions | None — always available |
| **`ui-visual-reviewer` agent** | Visual regression after component changes | None — uses Playwright MCP above |

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
