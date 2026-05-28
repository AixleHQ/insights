# CUR-V13 — Cursor hooks feasibility (verification only)

Logs redacted hook stdin to `~/.cursor/db90-hooks-feasibility.ndjson`. **Does not POST to db90.**

```bash
npm run install:hooks-feasibility   # writes ~/.cursor/hooks.json
# Restart Cursor, use Agent/Composer once
npm run verify:hooks-feasibility
```

Smoke test without Cursor: `npm run verify:hooks-feasibility -- --smoke`
