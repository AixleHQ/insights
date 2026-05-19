# Manual end-to-end checklist — @db90/telemetry-mcp + Claude Code

Use this checklist on a **clean machine** (or a fresh user account) that has Claude Code installed and **no prior DB90 MCP setup**.

## Preconditions

- Node.js 20+ and network access for `npx` and Keycloak.
- DB90 API and Keycloak reachable (local docker-compose or shared dev URLs).
- Claude Code installed and able to start.

## Steps

1. **Install / run the package**
   - From any directory: `npx -y @db90/telemetry-mcp init --keycloak-url <ISSUER> [--host <API>]`
   - Or install the package globally / from a monorepo checkout per team docs.

2. **Complete device login**
   - Follow the printed browser URL and user code; finish Keycloak login.

3. **Confirm CLI outcome**
   - Expect: credentials saved, Claude user MCP config updated under `~/.claude.json` (top-level `mcpServers.db90`), and the line: `Restart Claude Code to activate`.

4. **Restart Claude Code**
   - Fully quit and reopen Claude Code.

5. **Verify MCP**
   - In Claude Code, open `/mcp` (or the MCP tools panel) and confirm **db90** is listed.

6. **Run a real session**
   - Use Claude Code normally so transcripts exist and the MCP server can sync.

7. **Verify DB90 dashboard**
   - Within **five minutes**, confirm the session / usage appears in the DB90 dashboard for the expected organization.

## Observed results (fill during run)

| Date | Operator | API / Keycloak | Claude Code version | Dashboard verified (Y/N) | Notes |
| --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |

## Troubleshooting

- **`init` reports a conflicting `db90` MCP entry:** Inspect `~/.claude.json` → `mcpServers.db90`. Re-run with `init --force` only if you intend to replace that entry.
- **MCP not listed after restart:** Confirm `~/.claude.json` exists and contains `mcpServers.db90` with `command`/`args` as installed by `init` (on Windows, `command` is `cmd` and `args` begin with `/c`, `npx`, …).
- **Auth OK but install error:** Fix the reported path/permissions issue and re-run `init` — saved credentials are not removed on install failure.
