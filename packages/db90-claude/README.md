# db90-claude

A CLI tool that reads Claude Code's local JSONL transcripts and pushes AI usage events to your [db90](https://db90.io) ingest endpoint. Replaces the fragile Stop-hook/jq approach that assumed `.usage` is always present on stop payloads.

## Installation

> **Note:** The package is not yet published to npm. Use the local development instructions below.

### From the db90 repo (local development)

Build and run directly:

```bash
cd packages/db90-claude
npm install
npm run build
node dist/cli.js --token <token> --host http://localhost:3000
```

Or install globally from the local path so `db90-claude` works anywhere:

```bash
npm install -g ./packages/db90-claude
db90-claude --token <token> --host http://localhost:3000
```

### Once published to npm

```bash
npm install -g db90-claude
# or
npx db90-claude --token <token> --host <host>
```

## Quick Start

1. Obtain an ingest token from your db90 dashboard (Settings → Integrations → Claude Code).

2. Create a config file (recommended — avoids pasting the token on every run):

```bash
mkdir -p ~/.db90-claude
echo '{"token":"your-ingest-token","host":"https://app.db90.io"}' > ~/.db90-claude/config.json
```

3. Run the CLI:

```bash
node dist/cli.js
# or, once published: npx db90-claude
```

4. (Recommended) Schedule it or run with `--watch` for continuous ingestion — see [Scheduling](#scheduling) below.

## First-Run Setup Walkthrough

### Step 1 — Build the package

```bash
cd packages/db90-claude
npm install
npm run build
```

### Step 2 — Dry-run to see what will be sent

Run with `--verbose` and `--dry-run` to see which transcript files are found and what data they contain — without sending anything:

```bash
node dist/cli.js --token <token> --host <host> --verbose --dry-run
```

Expected output:

```
[verbose] Found 12 transcript file(s)
[dry-run] Would send session abc123def:
{
  "tool_name": "claude_code",
  "event_type": "chat",
  "model": "claude-opus-4-5",
  "tokens_in": 18420,
  "tokens_out": 3210,
  "tokens_total": 21630,
  "occurred_at": "2026-04-10T14:23:11.000Z",
  "metadata": {
    "session_id": "abc123def",
    "cache_write_tokens": 2100,
    "cache_read_tokens": 8300
  }
}
```

### Step 3 — Send events

Remove `--dry-run` to post:

```bash
node dist/cli.js --token <token> --host <host>
# Sent: 12, Failed: 0, Skipped: 0
```

### Step 4 — Verify idempotency

Run again immediately. Sessions whose `.jsonl` file size has not changed since the last successful send are skipped:

```bash
node dist/cli.js --token <token> --host <host>
# Sent: 0, Failed: 0, Skipped: 12
```

### Step 5 — Create the config file

To avoid passing `--token` and `--host` on every run:

```bash
mkdir -p ~/.db90-claude
echo '{"token":"your-ingest-token","host":"https://app.db90.io"}' > ~/.db90-claude/config.json
```

### Step 6 — Schedule automatic runs or use --watch

See [Scheduling](#scheduling) below.

## Configuration

Options can be set via CLI flags, environment variables, or a config file. Priority order: **CLI flags > environment variables > config file**.

### Config file

Create `~/.db90-claude/config.json`:

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
| Dry run | `--dry-run` | — | — | Print events without posting or updating state |
| Watch mode | `--watch` | — | — | Poll for new transcripts on an interval |
| Watch interval | `--watch-interval <secs>` | — | — | Poll interval in seconds (default: 30) |
| Verbose | `--verbose`, `-v` | — | — | Print transcript paths and event counts |

### State file

The CLI stores per-session progress in `~/.db90-claude/state.json` to prevent duplicate posts. Each session is tracked by its Claude session ID and the file size of its `.jsonl` transcript at the time it was last successfully sent.

**Idempotency rule:** a session is skipped if its transcript file size matches the checkpoint stored from the last successful POST. When a session grows (new messages), it is re-processed and re-sent with the updated aggregated totals.

State is only updated after a successful HTTP 2xx response — a failed POST leaves the session eligible for retry on the next run.

## Scheduling

### Watch mode (simplest)

Run continuously with built-in polling:

```bash
db90-claude --watch
# polls every 30 seconds

db90-claude --watch --watch-interval 60
# polls every 60 seconds
```

Keep it running in a terminal, screen session, or as a system service.

### macOS — launchd (recommended for background use)

Create `~/Library/LaunchAgents/io.db90.claude.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>io.db90.claude</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/path/to/db90-claude/dist/cli.js</string>
  </array>
  <key>StartInterval</key>
  <integer>3600</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/db90-claude.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/db90-claude-error.log</string>
</dict>
</plist>
```

Load it:

```bash
launchctl load ~/Library/LaunchAgents/io.db90.claude.plist
```

### Linux/macOS — cron

Run every hour using the config file (no credentials in crontab):

```cron
0 * * * * /usr/local/bin/node /path/to/db90-claude/dist/cli.js >> /tmp/db90-claude.log 2>&1
```

Or pass credentials inline:

```cron
0 * * * * DB90_TOKEN=your-token DB90_HOST=https://app.db90.io /usr/local/bin/node /path/to/db90-claude/dist/cli.js >> /tmp/db90-claude.log 2>&1
```

## How It Works

Claude Code writes a JSONL transcript file for each conversation session. `db90-claude` reads these files, aggregates token usage, and sends one summary event per session to db90.

### Transcript locations

The CLI searches both paths to cover all Claude Code versions:

| Path | Version |
|---|---|
| `~/.config/claude/projects/<encoded-path>/<session-id>.jsonl` | Claude Code v1.0.30+ |
| `~/.claude/projects/<encoded-path>/<session-id>.jsonl` | Legacy |

### JSONL format

Each line in a transcript is a JSON object. The CLI extracts token usage from `assistant` messages:

```json
{
  "type": "assistant",
  "sessionId": "abc123def",
  "timestamp": "2026-04-10T14:23:11.000Z",
  "message": {
    "model": "claude-opus-4-5",
    "usage": {
      "input_tokens": 8000,
      "output_tokens": 3210,
      "cache_creation_input_tokens": 2100,
      "cache_read_input_tokens": 8300
    }
  }
}
```

All four usage fields are summed across every assistant message in a session. `tokens_in` includes `input_tokens + cache_creation_input_tokens + cache_read_input_tokens` (the total tokens the model processed on input). Cache fields are also stored separately in `metadata` for analysis.

### Pipeline

1. Discover all `.jsonl` files under both transcript directory roots
2. For each file, compare its current size against the checkpoint in `~/.db90-claude/state.json`
3. If the file size is unchanged, skip (already sent)
4. Stream and parse the file; aggregate all token usage fields per session ID
5. POST the aggregated summary to `{host}/api/v1/ingest/events` with Bearer token
6. On HTTP 2xx, update the per-session checkpoint with the new file size (atomic write)

### Ingest payload shape

```json
{
  "tool_name": "claude_code",
  "event_type": "chat",
  "model": "claude-opus-4-5",
  "tokens_in": 18420,
  "tokens_out": 3210,
  "tokens_total": 21630,
  "occurred_at": "2026-04-10T14:23:11.000Z",
  "metadata": {
    "session_id": "abc123def",
    "cache_write_tokens": 2100,
    "cache_read_tokens": 8300
  }
}
```

## Requirements

- Node.js 18+ (uses built-in `fetch`)
- Claude Code installed with at least one completed conversation
