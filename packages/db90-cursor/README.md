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

2. Run the CLI:

```bash
db90-cursor --token <your-ingest-token> --host https://app.db90.io
```

3. (Recommended) Schedule it to run automatically — see [Scheduling](#scheduling) below.

## Configuration

Options can be set via CLI flags, environment variables, or a config file. Priority order: **CLI flags > environment variables > config file**.

### Config file

Create `~/.db90-cursor/config.json`:

```json
{
  "token": "your-ingest-token",
  "host": "https://app.db90.io"
}
```

### Options

| Option | CLI flag | Environment variable | Config file key | Description |
|---|---|---|---|---|
| Ingest token | `--token <token>` | `DB90_TOKEN` | `token` | db90 ingest token (required) |
| db90 host | `--host <url>` | `DB90_HOST` | `host` | db90 host URL (required) |
| Dry run | `--dry-run` | — | — | Print events without posting |
| Since date | `--since <ISO date>` | — | — | Override saved state; process events since this date |

### State file

The CLI stores the timestamp of the last processed event in `~/.db90-cursor/state.json` to avoid re-sending events on subsequent runs. This file is managed automatically.

## Scheduling

### macOS — launchd

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
    <string>/usr/local/bin/db90-cursor</string>
    <string>--token</string>
    <string>your-ingest-token</string>
    <string>--host</string>
    <string>https://app.db90.io</string>
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

Run every hour:

```cron
0 * * * * DB90_TOKEN=your-token DB90_HOST=https://app.db90.io /usr/local/bin/db90-cursor >> /var/log/db90-cursor.log 2>&1
```

Or using the config file (no env vars needed):

```cron
0 * * * * /usr/local/bin/db90-cursor >> /var/log/db90-cursor.log 2>&1
```

## How It Works

1. Finds all Cursor SQLite databases at `~/.cursor/User/workspaceStorage/**/cursor.db`
2. Queries events newer than the last processed timestamp (from `~/.db90-cursor/state.json`)
3. Maps each event to the db90 ingest payload format
4. POSTs each event to `{host}/api/v1/ingest/events` with your token
5. On success, updates the saved state to avoid re-sending

## Requirements

- Node.js 18+ (uses built-in `fetch`)
- Cursor IDE installed with telemetry data
