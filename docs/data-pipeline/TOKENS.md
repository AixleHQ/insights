# TOKENS.md — db90 event taxonomy reference

> **Baseline reference, May 2026.** Ported from `TOKENS.pdf` (8-page prior research note). Treated as the starting point for the AIX-136 epic: tasks AIX-233 / -234 deepen the per-vendor surface map, tasks AIX-235 / -236 validate and extend the gap analysis (sections 6, 7, 8 below).
>
> Authoritative map of what `tool_events.event_type` values exist, what each source CLI emits, and what richer signal each tool exposes that we don't currently capture.

---

## 1. Rails `event_type` enum

Defined in two places and they must stay in sync:

- Postgres `public.event_type` enum (`packages/api/db/structure.sql`)
- `ToolEvent::EVENT_TYPES` constant (`packages/api/app/models/tool_event.rb:7`)

The 12 allowed values:

| `event_type` | Meaning | Status |
|---|---|---|
| `chat` | Conversational AI request (Composer / Cmd+K / Claude Code chat) | **Active** |
| `completion` | Inline / tab completion (model auto-suggests as you type) | **Active** |
| `edit` | AI-driven file edits | Reserved |
| `commit` | Commit-scoped event (e.g. AI commit message) | **Active** (Cursor `recentCommit` since AIX-235) |
| `review` | Code review (e.g. Cursor BugBot) | Reserved |
| `test` | Test generation | Reserved |
| `debug` | Debug session | Reserved |
| `refactor` | Refactor action | Reserved |
| `documentation` | Doc generation | Reserved |
| `issue` | Issue tracking | Reserved |
| `comment` | Comment thread | Reserved |
| `other` | Catch-all | Reserved |

**"Active"** = at least one CLI emits this value today. **"Reserved"** = enum value exists, no source populates it.

---

## 2. Coverage matrix — feature × tool × capture status

| `event_type` | Cursor — feature | Cursor — capturing? | Claude Code — feature | Claude Code — capturing? |
|---|---|---|---|---|
| `completion` | Tab completion (inline autocomplete) | **Yes** | Not a feature | N/A |
| `chat` | Composer (Cmd+K / Cmd+I) + Chat panel | **Yes** | Every assistant turn in a conversation | **Yes** |
| `edit` | Composer multi-file edits, Cmd+K inline edits | Captured but tagged as `chat` | Tool use: `Edit`, `Write`, `MultiEdit` | Not extracted (rolled into `chat`) |
| `commit` | AI commit-message gen + `aiCodeTracking.recentCommit` row | **Yes** (`event_type: commit`, `metadata.source: recent_commit`) | Tool use: `Bash(git commit ...)` | Not extracted |
| `review` | BugBot (PR review) | No (not in SQLite stores we read) | N/A | N/A |
| `test` | Composer-driven test gen | Lumped into `chat` | Tool use writing `*.spec.*` / `*.test.*` files | Lumped into `chat` |
| `debug` | Chat-driven debugging | Lumped into `chat` | Chat-driven debugging | Lumped into `chat` |
| `refactor` | Composer multi-file refactor | Lumped into `chat` | Tool-use bulk edits | Lumped into `chat` |
| `documentation` | Chat-driven doc generation | Lumped into `chat` | Chat-driven doc generation | Lumped into `chat` |
| `issue` | N/A | N/A | N/A | N/A |
| `comment` | N/A | N/A | N/A | N/A |
| `other` | catch-all | N/A | catch-all | N/A |

**Coverage summary:** Cursor populates **3/12** enum values today (`completion`, `chat`, `commit`); Claude Code populates **1/12** (`chat`). Everything else is reserved enum space.

---

## 3. Source data — what each CLI reads

### 3.1 Cursor (`packages/tools/db90-cursor`)

Four input streams; emit `completion`, `chat`, or `commit`:

| Source | Cursor key / table | Emitted as | `tokens_in` | `tokens_out` |
|---|---|---|---|---|
| Tab completions (daily aggregate) | `state.vscdb` → `ItemTable.aiCodeTracking.dailyStats.v1.5.<DATE>` → `tabSuggestedLines` / `tabAcceptedLines` | `completion` | suggested lines | accepted lines |
| Composer / chat (daily aggregate) | `state.vscdb` → `ItemTable.aiCodeTracking.dailyStats.v1.5.<DATE>` → `composerSuggestedLines` / `composerAcceptedLines` | `chat` | suggested lines | accepted lines |
| Commit snapshot | `state.vscdb` → `ItemTable.aiCodeTracking.recentCommit` (literal key, overwritten on each commit) | `commit` | `linesAdded` | `linesDeleted` |
| Legacy per-request | Workspace `cursor.db` → `CursorRequestFeedback` table | `chat` if `type=1`, else `completion` | `promptTokens` | `generatedTokens` |

**Notes:**
- Dated keys use any `aiCodeTracking.dailyStats.v*.<DATE>` prefix; run `npm run audit:local-stores` (CUR-V11) to list versions on disk. New JSON shapes still need mapper updates (`cursor-6`).
- Daily-stats tokens are **lines, not real tokens**. The mapper multiplies by `tokens_per_line` (default 15) when computing cost.
- Legacy per-request rows DO have real `promptTokens` / `generatedTokens` from the model.

### 3.2 Claude Code (`packages/tools/db90-claude`)

Single input stream: `~/.claude/projects/<sanitized-cwd>/<session-uuid>.jsonl`

| Field read | Emitted as |
|---|---|
| `entry.type == "assistant"` → `message.usage.input_tokens` + `cache_creation_input_tokens` + `cache_read_input_tokens` | `tokens_in` |
| `entry.type == "assistant"` → `message.usage.output_tokens` | `tokens_out` |
| `entry.timestamp` | `occurred_at` |
| `entry.message.model` | `model` |
| `entry.sessionId` | `metadata.claude_session_id` |
| (constant) | `event_type: "chat"` |

`type=user` entries are intentionally skipped — only assistant turns count. Tool-use blocks within an assistant message are flattened (a single `chat` event represents the whole turn, including any embedded `Edit` / `Bash` / etc).

---

## 4. Token semantics — `tokens_in` / `tokens_out` are not the same unit across sources

| Source | `tokens_in` represents | `tokens_out` represents |
|---|---|---|
| Cursor — `dailyStats` (tab) | Lines suggested by tab completion that day | Lines kept |
| Cursor — `dailyStats` (composer) | Lines suggested by composer that day | Lines accepted |
| Cursor — `recentCommit` | Lines added in the last commit | Lines deleted |
| Cursor — legacy `CursorRequestFeedback` | Real prompt tokens | Real generated tokens |
| Claude Code | Input tokens **plus** cache writes **plus** cache reads (full prompt cost) | Real output tokens |

This is why dashboard cost columns are wildly different between rows: a Cursor `chat` row showing **$0.0088** is computed from line counts; a Claude Code `chat` row showing **$19.75** has the entire conversation history loaded as input tokens, billed at $3–15 / Mtok.

---

## 5. Cost models (`metadata.cost_model`)

| `cost_model` value | Used when | Formula |
|---|---|---|
| `estimated_line_count` | Cursor `dailyStats` / `recentCommit` (default) | `lines × tokens_per_line × rate / 1_000_000` |
| `token_count` | Cursor legacy `CursorRequestFeedback` rows | `(tokens_in × input_rate + tokens_out × output_rate) / 1_000_000` |
| `claude_real` | Claude Code (server computes from real usage) | Anthropic's billed pricing per `model` |

Defaults at `packages/tools/db90-cursor/src/mapper.ts:14-16`:

```
tokens_per_line               = 15
completion_output_per_mtok    = $0.60
chat_input_per_mtok           = $3.00
chat_output_per_mtok          = $15.00
```

Per-driver rates can be overridden in `~/.db90-cursor/config.json` → `pricing`.

---

## 6. Beyond the Rails enum — signals available but not captured

Both source tools expose much richer event data than we currently use. The Rails enum is a server-side taxonomy choice, not a hard limit on what the tools can emit.

| Source field / signal | What it means | Maps to Rails enum? | Capturing now? | Notes |
|---|---|---|---|---|
| Cursor — `aiCodeTracking.dailyStats.v1.5.<date>` | Daily line-count totals | `chat` + `completion` | Yes | 5 fields total; we use all 4 line-count ones |
| Cursor — `aiCodeTracking.recentCommit` | Most recent commit's AI %, lines added/deleted, branch, commit hash | `commit` | **Yes** (AIX-235) | One-row, overwritten per commit; wired in `sync.ts` |
| Cursor — `cursorDiskKV` table | Composer/Cmd+K session payloads (per-session granular data, including chat text) | could be `chat` / `edit` + raw prompt text | Not read | ~200K rows on a typical install; schema varies per session; would need a separate parser |
| Cursor — BugBot reviews | AI PR-review activity | `review` | Not read | Stored in Cursor cloud, not local SQLite |
| Cursor — background agent activity | Long-running agent runs | could be `chat` or new type | Not read | No clean local store identified |
| Cursor — per-language stats | Language breakdown of suggestions | metadata | Not exposed | Cursor's `dailyStats` schema doesn't separate by language |
| Claude Code — `message.content[type=text]` (assistant) | Standard chat reply | `chat` | Yes (tokens summed) | |
| Claude Code — `content[type=text]` (user) | The user's prompt text | (raw text, not enum) | **Available on disk, not captured** | See §7 |
| Claude Code — `content[type=thinking]` | Extended-thinking blocks | could be metric | Not extracted | Only contributes to `output_tokens` count |
| Claude Code — `content[type=tool_use]` (Edit/Write/MultiEdit) | File edits | `edit` | Lumped into `chat` | Extractable per-message |
| Claude Code — `content[type=tool_use]` (Bash with `git commit`) | Commit activity | `commit` | Lumped into `chat` | Would need command-string regex |
| Claude Code — `content[type=tool_use]` (Read/Grep/Glob) | Code navigation | metric | Lumped | High volume, low cost — useful for navigation patterns |
| Claude Code — `subagent_type` marker | Sub-agent dispatch | metadata or new `agent_run` event | Lumped | Currently treated as a normal assistant message |
| Claude Code — `skill` marker | Skill invocation | metadata or new `skill_run` event | Lumped | Same |
| Claude Code — `gitBranch` / `cwd` | Per-message branch + dir | metadata | Not extracted | Useful for project attribution |
| Claude Code — `usage.cache_creation_input_tokens` | New cache writes | metric | Captured (as `cacheWrite` in metadata) | |
| Claude Code — `usage.cache_read_input_tokens` | Cache hits | metric | Captured (as `cacheRead` in metadata) | |
| Claude Code — `usage.iterations` | Agent loop count this turn | metric | Not extracted | Useful for autonomy intensity |
| Claude Code — `usage.service_tier` / `speed` / `inference_geo` | Service tier, priority, region | metadata | Not extracted | |
| Claude Code — `entrypoint` | `claude` CLI vs claude.ai/code (Ultraplan) vs IDE plugin | metadata | Not extracted | Would let you slice by surface |
| Claude Code — `version` | Claude Code CLI version | metadata | Not extracted | |
| Claude Code — `stop_reason` (`tool_use` / `end_turn` / `max_tokens` / refusal) | Why the turn ended | metadata or new event | Not extracted | Refusals especially valuable for risk monitoring |

---

## 7. Prompt / response text capture

User prompt text and assistant response text are both technically available but **deliberately not captured**.

| Source | Prompt text available? | Where | Currently captured? |
|---|---|---|---|
| Claude Code | Yes — full transcript | `~/.claude/projects/<dir>/<session>.jsonl`, plain text JSON | **No** — `claude-reader.ts` reads only `usage.*` numbers; `message.content` is skipped |
| Cursor — Composer / chat | Yes (likely) | `cursorDiskKV` → `composerData:<uuid>` and `bubbleId:<uuid>` blobs | **No** |
| Cursor — Tab completion text | Not stored locally | — | N/A |

### What it would take to capture

| Layer | Change |
|---|---|
| Claude Code reader | ~30 lines: extract `message.content[type=text]` for `type=user` and `type=assistant` entries; add `prompt_text` / `response_text` to the payload (`packages/tools/db90-claude/src/claude-reader.ts:155-205`) |
| Cursor reader | New parser: read `cursorDiskKV`, decode `composerData:*` blobs, walk the bubble graph |
| Rails | Add `prompt_text` (TEXT) and `response_text` (TEXT) columns to `tool_events`; `encrypts :prompt_text` |
| Storage | ~2–5 KB per event × 150 engineers × thousands of events/day → single-digit GB/month |

### Implications worth surfacing before greenlighting

1. **Sanitization is mandatory, not optional.** Engineers paste API keys, JWTs, customer data, internal hostnames into prompts. The existing `SanitizationPolicy` (`packages/api/db/seeds.rb:7-35`) defines regex patterns for `api_key`, `aws_secret`, `private_key`, `email`, `phone`, `ssn` — those would have to run server-side on every captured prompt before persistence, with known false-negative risk.
2. **Different regulatory category.** Token counts are telemetry. Prompt content is "monitoring employee communications" under most jurisdictions. SOC 2 / GDPR / state employment law typically require explicit notice and a documented purpose.
3. **Trust impact.** Engineers will type differently if they know prompts are being read. Behavior shift can degrade the value of the data you do collect.
4. **Egress profile changes.** Today's events leaving employee laptops contain only counts. Once prompt text ships, the data is qualitatively different (potentially sensitive customer data). Encryption at rest, retention policy, deletion-on-request all become hard requirements.
5. **Cursor side is harder than Claude Code.** `composerData` blobs are an undocumented internal format that will change between Cursor versions. Parser is a moving target.

### Cheaper alternatives that capture intent without raw text

- **On-device topic classification:** an LLM categorizes each prompt locally into `code_review`, `bug_fix`, `refactor`, etc.; only the category leaves the laptop.
- **Tool-use breakdown:** extract Claude Code's `tool_use` blocks. Tells you which tools engineers are using without ever reading prompt text.
- **Length / cache stats** as intent-richness proxies (already partially captured via `cacheRead` / `cacheWrite`).

---

## 8. High-ROI extension paths

If you want to expand the taxonomy beyond `chat` / `completion` without adding text capture:

1. ~~**Tag Cursor's `recentCommit` as `commit`**~~ — **Done (AIX-235):** `mapper.ts` + `sync.ts` wire Path B with `event_type: commit`.
2. **Extract Claude Code `tool_use` blocks into per-tool child events** — `claude-reader.ts:155-205`: enumerate `message.content[type=tool_use]` and emit one event per tool with appropriate `event_type` mapping (Edit/Write/MultiEdit → `edit`; Bash with `git commit` → `commit`; tests touching `*.spec.*` → `test`).
3. **Surface metadata that doesn't change the schema** — add `entrypoint`, `gitBranch`, `iterations`, `stop_reason`, `service_tier` to `metadata` on existing events. Pure additive change in the reader.
4. **Sub-agent + skill tagging** — set `metadata.subagent_type` / `metadata.skill_name` when those markers are present in the JSONL entry.

None of these require schema changes on the Rails side or any change in egress profile.

---

## 9. References

- `packages/api/app/models/tool_event.rb` — `EVENT_TYPES`, `TOOL_NAMES`, validations
- `packages/api/db/structure.sql` — `public.event_type` ENUM
- `packages/tools/db90-cursor/src/cursor-reader.ts` — Cursor SQLite parsing
- `packages/tools/db90-cursor/src/mapper.ts` — Cursor → `Db90Payload` mapping (line cost model lives here)
- `packages/tools/db90-claude/src/claude-reader.ts` — Claude Code JSONL parsing
- `packages/api/db/seeds.rb:7-35` — sanitization policy reference (would gate any prompt-text feature)
