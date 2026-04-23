# db90-cursor

A CLI tool that reads Cursor IDE's local SQLite telemetry database and pushes AI usage events to your [db90](https://db90.io) ingest endpoint.

## Installation

> **Note:** The package is not yet published to npm. Use the local development instructions below.

### From the db90 repo (local development)

Build and run directly:

```bash
cd packages/db90-cursor
npm install
npm run build
node dist/cli.js --token <token> --host http://localhost:3000
```

Or install globally from the local path so `db90-cursor` works anywhere:

```bash
npm install -g ./packages/db90-cursor
db90-cursor --token <token> --host http://localhost:3000
```

### Once published to npm

```bash
npm install -g db90-cursor
# or
npx db90-cursor --token <token> --host <host>
```

## Quick Start

1. Obtain an ingest token from your db90 dashboard (Settings → Integrations → Cursor).

2. Create a config file (recommended — avoids pasting the token on every run):

```bash
mkdir -p ~/.db90-cursor
echo '{"token":"your-ingest-token","host":"https://app.db90.io"}' > ~/.db90-cursor/config.json
```

3. Run the CLI:

```bash
node dist/cli.js
# or, once published: db90-cursor
```

4. (Recommended) Schedule it to run automatically — see [Scheduling](#scheduling) below.

## First-Run Setup Walkthrough

This section documents the real-world setup process, including schema discovery and history backfill.

### Step 1 — Build the package

```bash
cd packages/db90-cursor
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

If no flag or config value is set, the CLI runs `git remote get-url origin` in the current directory and calls `GET /api/v1/projects/lookup` to find a matching project. This requires the project to have a `git_remote_url` set in db90 that matches the repo's remote exactly (same protocol — SSH or HTTPS).

If the git remote is found but no matching project exists in db90, the CLI exits with an error:

```
Error: No project found matching the git remote for this repository.
Create one at https://app.db90.io/projects or pass --project-id <uuid> explicitly.
```

If there is no git remote at all (not in a git repo, or no `origin` configured), attribution is silently skipped and events are sent without a project ID.

Use `--verbose` to see which source was used:

```
[verbose] Project attribution: 3f2a1b... (source: auto-detect)
[verbose] Project attribution: none (source: none)
```

### Testing project attribution locally

1. Set `git_remote_url` on a project via the Rails console:

```ruby
# docker compose exec api rails console
project = Project.active.first
project.update!(git_remote_url: "git@github.com:your-org/your-repo.git")
```

2. Verify the lookup endpoint works:

```bash
curl "http://localhost:3000/api/v1/projects/lookup?git_remote=git@github.com:your-org/your-repo.git" \
  -H "Authorization: Bearer <ingest-token>"
# → {"data":{"project_id":"...","name":"..."}}
```

3. Run the CLI from the matching repo with `--dry-run --verbose`:

```bash
cd ~/your-repo
db90-cursor --token <token> --host http://localhost:3000 --dry-run --verbose
# [verbose] Project attribution: <uuid> (source: auto-detect)
# dry-run JSON includes "project_id": "<uuid>"
```

4. Test from a non-git directory — attribution should be skipped gracefully:

```bash
cd /tmp
db90-cursor --token <token> --host http://localhost:3000 --dry-run --verbose
# [verbose] Could not determine git remote
# no project_id in payload
```

## Requirements

- Node.js 18+ (uses built-in `fetch`)
- Cursor IDE installed with telemetry data
