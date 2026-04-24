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
  "cost_usd": 0.137625,
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
| Cost pricing | — | — | `pricing` | Per-model rate overrides for cost estimation (see [Cost Estimation](#cost-estimation)) |
| Dry run | `--dry-run` | — | — | Print events without posting or updating state |
| Watch mode | `--watch` | — | — | Poll for new transcripts on an interval |
| Watch interval | `--watch-interval <secs>` | — | — | Poll interval in seconds (default: 30) |
| Verbose | `--verbose`, `-v` | — | — | Print transcript paths and event counts |

### State file

The CLI stores per-session progress in `~/.db90-claude/` to prevent duplicate posts. Each session is tracked by its Claude session ID and the file size of its `.jsonl` transcript at the time it was last successfully sent.

**One state file per host + token.** The state file is named `state-<hostname>-<token-hash>.json` (e.g. `state-app.db90.io-a1b2c3d4.json`). This means switching organisations or hosts automatically starts with a clean slate — sessions posted to org A are never skipped when you start posting to org B.

**Idempotency rule:** a session is skipped if its transcript file size matches the checkpoint stored from the last successful POST. When a session grows (new messages), it is re-processed and re-sent with the updated aggregated totals.

State is only updated after a successful HTTP 2xx response — a failed POST leaves the session eligible for retry on the next run.

**To force a full re-send** (e.g. after switching tokens or recovering from a corrupted state), delete the relevant state file:

```bash
# List all state files
ls ~/.db90-claude/state-*.json

# Delete a specific one, or all of them
rm ~/.db90-claude/state-app.db90.io-a1b2c3d4.json
```

## Cost Estimation

`db90-claude` ships baked-in per-million-token rates for the most common Claude models used in Claude Code. It computes an estimated `cost_usd` for each session using the formula:

```
cost_usd = (base_input_tokens × rate_in
           + output_tokens    × rate_out
           + cache_write_tokens × rate_cache_write
           + cache_read_tokens  × rate_cache_read) / 1_000_000
```

where `base_input_tokens = tokens_in − cache_write_tokens − cache_read_tokens`.

The result is rounded to 6 decimal places and sent in the ingest payload. The db90 Cost KPI cards and financial reports use this value to show estimated spend.

### When `cost_usd` is null

`cost_usd` is sent as `null` and a `[warn]` is printed in `--verbose` mode when:

| Situation | Verbose warning |
|---|---|
| Model ID not in the default pricing table (e.g. a future dated variant) | `[warn] Model "…" not in pricing table — add it to config.json` |
| Model IS in config but missing one or more rate fields (new model ID with partial override) | `[warn] Incomplete pricing for "…" — all four *_per_mtok fields required for new model IDs` |
| Transcript has usage but recorded no model at all (rare) | `[warn] Session … has usage but no model` |

### Overriding or adding rates

You can update rates or add new model IDs without reinstalling by adding a `pricing` key to `~/.db90-claude/config.json`. Your config is **deep-merged** with the defaults on a per-model basis:

- **Partial override** — supply only the fields you want to change for an existing model; missing fields fall back to the default:
  ```json
  {
    "token": "...",
    "host": "https://app.db90.io",
    "pricing": {
      "claude-opus-4-6": { "input_per_mtok": 12.00 }
    }
  }
  ```
- **New model ID** — supply all four rate fields:
  ```json
  {
    "token": "...",
    "host": "https://app.db90.io",
    "pricing": {
      "claude-future-model-20990101": {
        "input_per_mtok": 5.00,
        "output_per_mtok": 20.00,
        "cache_write_per_mtok": 6.25,
        "cache_read_per_mtok": 0.50
      }
    }
  }
  ```
  If any of the four fields is missing for a new model ID, `cost_usd` will be `null` for that model and a verbose warning will fire.

### Known limitations

- **Multi-model sessions:** Claude Code may use different models within the same conversation. `db90-claude` records only the last-seen model per session and computes cost as if all tokens used that model. This is a session-level approximation and may over- or under-count costs for sessions that mixed Opus and Sonnet turns.
- **Estimates only:** `cost_usd` values are estimates based on public Anthropic list prices. Authoritative billing figures come from the Anthropic dashboard. Rate source: <https://www.anthropic.com/pricing> (verify when updating rates).

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
  "cost_usd": 0.137625,
  "occurred_at": "2026-04-10T14:23:11.000Z",
  "metadata": {
    "session_id": "abc123def",
    "cache_write_tokens": 2100,
    "cache_read_tokens": 8300
  }
}
```

`cost_usd` is always present. It is `null` when the model is not in the pricing table (see [Cost Estimation](#cost-estimation)).

## Project Attribution

Events can be attributed to a db90 project so they appear in project-scoped analytics. Resolution follows this priority order: **CLI flag > config file > git-remote auto-detect**.

### Option 1 — CLI flag

```bash
db90-claude --token <token> --host <host> --project-id <project-uuid>
```

### Option 2 — Config file

Add `project_id` to `~/.db90-claude/config.json`:

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
db90-claude --token <token> --host <host> --dry-run --verbose
# [verbose] Project attribution: <uuid> (source: auto-detect)
```

If the remote is found but no project matches, the CLI exits with:

```
Error: No project found matching the git remote for this repository.
Create one at <host>/projects or pass --project-id <uuid> explicitly.
```

If you are not in a git repo (or there is no `origin` remote), attribution is skipped silently and events are sent without a project ID.

## Requirements

- Node.js 18+ (uses built-in `fetch`)
- Claude Code installed with at least one completed conversation
