# db90-cursor

A CLI tool that reads Cursor IDE's local SQLite telemetry database and pushes AI usage events to your [db90](https://db90.io) ingest endpoint.

## Integration with db90-rails

This CLI posts your Cursor usage to a running db90-rails backend. Setup splits into three roles — do the steps matching your role, skip the others.

### If you are a Developer (install + ingest your own data)

1. Ask your Rails admin for an ingest token — or create one yourself via **Settings → Integrations → Cursor → Connect** in your org's dashboard.
2. Pick your environment host:
   | Environment | `DB90_HOST` value |
   |---|---|
   | Local (Vite proxy)   | `http://localhost:5173` |
   | Local (direct Rails) | `http://localhost:3000` |
   | Staging              | `https://insights.example.com` |
   | Production           | `https://app.db90.io` |
3. Run once:
   ```bash
   export DB90_TOKEN=<your-token>
   export DB90_HOST=<environment-url>
   npx @db90/cursor --dry-run --verbose   # preview what would be sent
   npx @db90/cursor                        # real send
   ```
4. (Recommended) Schedule via cron or launchd (see [Scheduling](#scheduling)). Cursor has no long-lived watch mode; run on a timer.

### If you are a Rails Admin (issue tokens to developers)

1. Verify the developer's user exists in your org (**Settings → Members**).
2. Have them go to **Settings → Integrations → Cursor → Connect**, which generates a `UserToolAccount`-scoped ingest token tied to their user. They copy the token from the modal (shown once — not recoverable).
3. To **revoke**: **Settings → Integrations** → find the tool account → **Deactivate**. The CLI starts returning 401 within seconds.
4. To **see who is ingesting**: **Settings → Integrations** lists every active `UserToolAccount` for your org with last-used timestamps.
5. Events auto-attribute to a project when the CLI is run inside a git repo whose `origin` remote matches any project's `git_remote_url`. Configure at **Settings → Projects**. See [Project Attribution](#project-attribution).

### If you are a Platform Owner (manage npm + release infra)

Out of scope for this README. See `CLAUDE.md` → "Release secrets" in the repo for `NPM_TOKEN` rotation policy and named owners, and `packages/tools/RELEASING.md` for the release runbook.

## Or install once with the MCP server

Prefer a "set and forget" experience? Install [`@db90/mcp`](https://www.npmjs.com/package/@db90/mcp) instead — it auto-forwards usage telemetry from every Claude Code and Cursor session, no cron / launchd needed:

```bash
npx -y @db90/mcp init
```

The instructions below cover the standalone CLI for users who prefer cron / launchd or a lighter install.

## Installation

```bash
npx @db90/cursor --token <token> --host <host>
```

After install, the on-disk command is still `db90-cursor`, preserving existing scripts and aliases.

### From the db90 repo (local development)

Build and run directly:

```bash
cd packages/tools/db90-cursor
npm install
npm run build
node dist/cli.js --token <token> --host http://localhost:3000
```

Or install globally from the local path so `db90-cursor` works anywhere:

```bash
npm install -g ./packages/tools/db90-cursor
db90-cursor --token <token> --host http://localhost:3000
```

### From npm (recommended)

```bash
npx @db90/cursor --token <token> --host <host>
```

The on-disk command is `db90-cursor` after `npx` resolves the package.

## Quick Start

1. Obtain an ingest token from your db90 dashboard (Settings → Integrations → Cursor).

2. Create a config file (recommended — avoids pasting the token on every run):

```bash
mkdir -p ~/.db90-cursor
echo '{"token":"your-ingest-token","host":"https://app.db90.io"}' > ~/.db90-cursor/config.json
```

3. Run the CLI:

```bash
npx @db90/cursor
```

4. (Recommended) Schedule it to run automatically — see [Scheduling](#scheduling) below.

## First-Run Setup Walkthrough

This section documents the real-world setup process, including schema discovery and history backfill.

### Step 1 — Build the package

```bash
cd packages/tools/db90-cursor
npm install
npm run build
```

### Step 2 — Diagnose what Cursor data is available

Run with `--verbose` and `--dry-run` to see which database files are found and what data they contain — without sending anything:

```bash
node dist/cli.js --token <token> --host <host> --verbose --dry-run
```

Expected output shows paths like:

```
Found 0 legacy cursor.db file(s)
Searching: /Users/<you>/Library/Application Support/Cursor/User
Found 22 state.vscdb file(s)
  [state.vscdb] /Users/<you>/Library/Application Support/Cursor/User/globalStorage/state.vscdb
  tables: ItemTable, ...
  aiCodeTracking keys (20):
    aiCodeTracking.dailyStats.v1.5.2026-02-09 → {"date":"2026-02-09","tabSuggestedLines":6,...}
    aiCodeTracking.dailyStats.v1.5.2026-03-01 → {"tabSuggestedLines":0,"tabAcceptedLines":0,...}
    …
```

If you see `aiCodeTracking` keys — you have data. If all counts are zero for a particular date, that day had no Cursor activity.

### Step 3 — Backfill historical events

On the very first run, there is no saved watermark, so the CLI processes all available history. If you have already run the CLI once (or the state file exists with a recent timestamp), use `--since` to backfill:

```bash
node dist/cli.js --token <token> --host <host> --since 2026-01-01 --dry-run
```

Review the output, then remove `--dry-run` to send:

```bash
node dist/cli.js --token <token> --host <host> --since 2026-01-01
# Sent: 28, Failed: 0
```

### Step 4 — Create the config file

To avoid passing `--token` and `--host` on every run:

```bash
mkdir -p ~/.db90-cursor
echo '{"token":"your-ingest-token","host":"https://app.db90.io"}' > ~/.db90-cursor/config.json
```

Verify it works:

```bash
node dist/cli.js
# Sent: 1, Failed: 0   (or "No new Cursor events found." if nothing new today)
```

### Step 5 — Schedule automatic runs

See [Scheduling](#scheduling) below. After the first successful run, subsequent runs only send events newer than the last processed timestamp.

## Configuration

Options can be set via CLI flags, environment variables, or a config file. Priority order: **CLI flags > environment variables > config file**.

### Config file

Create `~/.db90-cursor/config.json`:

```json
{
  "token": "your-ingest-token",
  "host": "https://app.db90.io",
  "project_id": "optional-project-uuid"
}
```

### Options

| Option | CLI flag | Environment variable | Config file key | Description |
|---|---|---|---|---|
| Ingest token | `--token <token>` | `DB90_TOKEN` | `token` | db90 ingest token (required) |
| db90 host | `--host <url>` | `DB90_HOST` | `host` | db90 host URL (required) |
| Project ID | `--project-id <uuid>` | — | `project_id` | Associate events with a project (see [Project Attribution](#project-attribution)) |
| Dry run | `--dry-run` | — | — | Print events without posting |
| Since date | `--since <ISO date>` | — | — | Override saved state; process events since this date |
| Verbose | `--verbose`, `-v` | — | — | Print DB paths, table names, and event counts |

### State file

The CLI stores the timestamp of the last processed event in `~/.db90-cursor/state.json` to avoid re-sending events on subsequent runs. This file is managed automatically.

The watermark is set to the maximum `occurred_at` of all successfully sent events — not the current wall-clock time. This means backfilled or clock-skewed events are never silently skipped.

## Scheduling

### macOS — launchd (recommended)

Create `~/Library/LaunchAgents/io.db90.cursor.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>io.db90.cursor</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/path/to/db90-cursor/dist/cli.js</string>
  </array>
  <key>StartInterval</key>
  <integer>3600</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/db90-cursor.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/db90-cursor-error.log</string>
</dict>
</plist>
```

Load it:

```bash
launchctl load ~/Library/LaunchAgents/io.db90.cursor.plist
```

### Linux/macOS — cron

Run every hour using the config file (no credentials in crontab):

```cron
0 * * * * /usr/local/bin/node /path/to/db90-cursor/dist/cli.js >> /tmp/db90-cursor.log 2>&1
```

Or pass credentials inline:

```cron
0 * * * * DB90_TOKEN=your-token DB90_HOST=https://app.db90.io /usr/local/bin/node /path/to/db90-cursor/dist/cli.js >> /tmp/db90-cursor.log 2>&1
```

## How It Works

Cursor IDE stores AI usage data in SQLite databases on your local machine. `db90-cursor` reads two schemas:

### Current Cursor (v1.5+) — `state.vscdb` / `ItemTable`

Located at:
- **macOS**: `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb`
- **Linux**: `~/.config/Cursor/User/globalStorage/state.vscdb`
- **Windows**: `%APPDATA%\Cursor\User\globalStorage\state.vscdb`

Cursor writes daily aggregate line counts under keys like `aiCodeTracking.dailyStats.v1.5.YYYY-MM-DD`:

```json
{
  "date": "2026-02-09",
  "tabSuggestedLines": 6,
  "tabAcceptedLines": 2,
  "composerSuggestedLines": 43,
  "composerAcceptedLines": 50
}
```

These are mapped as:
- `tabSuggestedLines` / `tabAcceptedLines` → `event_type: "completion"` (tab autocomplete)
- `composerSuggestedLines` / `composerAcceptedLines` → `event_type: "chat"` (Composer/chat)

Because Cursor tracks **line counts, not token counts**, the `tokens_in` / `tokens_out` fields in db90 contain line counts for Cursor events.

### Legacy Cursor — `cursor.db` / `CursorRequestFeedback`

Older Cursor versions stored per-request data in `workspaceStorage/**/cursor.db`. This schema is still read for backward compatibility.

### Pipeline

1. Find all `state.vscdb` and `cursor.db` files matching the above paths
2. Filter entries newer than the last processed timestamp (from `~/.db90-cursor/state.json`)
3. Map each entry to the db90 ingest payload format
4. POST each event to `{host}/api/v1/ingest/events` with your Bearer token
5. On success, update the watermark to `max(occurred_at)` of sent events

## Project Attribution

Events can be attributed to a db90 project so they appear in project-scoped analytics. Resolution follows this priority order: **CLI flag > config file > git-remote auto-detect**.

### Option 1 — CLI flag

```bash
db90-cursor --token <token> --host <host> --project-id <project-uuid>
```

### Option 2 — Config file

Add `project_id` to `~/.db90-cursor/config.json`:

```json
{
  "token": "your-ingest-token",
  "host": "https://app.db90.io",
  "project_id": "your-project-uuid"
}
```

### Option 3 — Auto-detect from git remote

If no flag or config value is set, the CLI runs `git remote get-url origin` in the current directory and calls `GET /api/v1/projects/lookup` to find a matching project. This requires the project to have a **Git Remote URL** set in db90 (via Project Settings) that matches the repo's remote. The `.git` suffix and casing are normalized automatically, so `git@github.com:org/repo.git` and `git@github.com:org/repo` both match.

All lookup failures are non-blocking — events are always sent, just without project attribution:

| Situation | Behavior |
|---|---|
| Git remote matches a db90 project | Events attributed to that project |
| Git remote found but no matching project in db90 | Events sent without project attribution |
| Not in a git repo or no `origin` remote | Events sent without project attribution |
| Network error during lookup | Events sent without project attribution |

Use `--verbose` to see which source was used:

```
[verbose] Project attribution: 3f2a1b... (source: auto-detect)
[verbose] Project attribution: none (source: auto-detect-not-found)
[verbose] Project attribution: none (source: none)
```

### Setup

1. In the db90 app, open the project and go to **Settings → General**.
2. Set the **Git Remote URL** field to the exact output of `git remote get-url origin` from your repo (e.g. `git@github.com:org/repo.git`).
3. Save changes.
4. Run the CLI from that repo — no extra flags needed:

```bash
cd ~/your-repo
db90-cursor --token <token> --host <host> --dry-run --verbose
# [verbose] Project attribution: <uuid> (source: auto-detect)
```

If the remote is found but no project matches, the CLI exits with:

```
Error: No project found matching the git remote for this repository.
Create one at <host>/projects or pass --project-id <uuid> explicitly.
```

If you are not in a git repo (or there is no `origin` remote), attribution is skipped silently and events are sent without a project ID.

## Requirements

- Node.js 20+ (matches the `engines` field; uses built-in `fetch`)
- Cursor IDE installed with telemetry data

## Platform support

`@db90/cursor` depends on [`better-sqlite3`](https://www.npmjs.com/package/better-sqlite3) to read Cursor's local SQLite state files. `better-sqlite3` ships **prebuilt native binaries** for the following platforms, so `npm install` does **not** require a C++ toolchain:

- macOS x64, macOS arm64 (Apple Silicon)
- Linux x64, Linux arm64
- Windows x64

Tested end-to-end on:

- macOS arm64 (darwin 24 / Node 20) — verified via `npm pack` + `npm install <tarball>` + `db90-cursor --help` + `db90-cursor --dry-run --verbose`.

If you are on a platform not in the list above, `npm install` will fall back to building `better-sqlite3` from source and you will need Python 3 + a C++ compiler (`build-essential` on Debian/Ubuntu, Xcode Command Line Tools on macOS, Visual Studio Build Tools on Windows). If you hit build errors, please open an issue.
