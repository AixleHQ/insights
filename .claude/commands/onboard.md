---
description: Guided 10-minute walkthrough of the Aixle Insights Claude tooling for new engineers
---

## Your task

Walk a new engineer through Aixle Insights's Claude tooling with four small, concrete exercises. Keep it conversational and friendly. Stop at each checkpoint and ask them to run the thing themselves before moving on.

### Exercise 1 — Discovery

Tell them:
> "You can always see what's available with `/help-tooling`. Try it now — I'll wait."

Wait for confirmation, then explain the four primitives briefly:
- **Commands** (`/name`) — things you type to start a workflow.
- **Agents** — specialists the model spawns for deep work (reviews, isolated tasks).
- **Skills** — knowledge that auto-loads when you edit certain files (Swagger rules, ActionPolicy reminders, design tokens).
- **Hooks** — harness automation (linting on every edit, etc.).

### Exercise 2 — Add a trivial API endpoint

Tell them:
> "Let's add a dummy `GET /health/ping` endpoint. Ask me to do it — I'll show you the skills in action."

When they ask, walk through:
1. Create a tiny controller action.
2. Point out that the `swagger-sync` skill auto-loaded when the controller was edited.
3. Point out that the `actionpolicy-check` skill reminded about `authorize!`.
4. Show `swagger.yaml` being updated in the same commit.
5. Point out the `on-edit-lint` hook running RuboCop.
6. Suggest they run `/review-commit` to see `swagger-auditor` verify the pair.

**Do not actually commit** — this is a walkthrough, revert any real changes at the end.

### Exercise 3 — Touch a design-system component

Tell them:
> "Now let's peek at the design system flow. Ask me to tweak a color in `button.tsx`."

When they ask:
1. Open the file; note that `design-system-guide` skill auto-loads.
2. Point out how it reminds to use tokens, not arbitrary values.
3. Explain `/migrate-component` is the full orchestrated flow for real migrations (don't run it here — it's heavier).
4. Mention Playwright is the CI-side visual regression safety net.

**Revert any changes** at the end.

### Exercise 4 — Read the architecture map

Tell them:
> "The full architecture diagram, workflow mappings, and tutor layer explanation live in `AGENTS.md` at the repo root. Open it once and you'll have a mental map."

Point out these sections specifically:
- "TL;DR" — the one-table summary
- "When to use what — decision tree"
- "How to work with — common workflows"
- "Learning as you work — the tutor layer"

### Wrap-up

Close with:
> "You're set. Three things to remember:
> 1. Ask any primitive 'how does this work?' — it will explain itself.
> 2. `/help-tooling` for a live catalog anytime.
> 3. Coaching trailers are on by default. If they get noisy, set `DB90_COACHING=false` in `.claude/settings.local.json`.
>
> Welcome to the team!"

### Rules

- Be encouraging, not lecturing.
- Each exercise should take 2-3 minutes.
- Do NOT commit any real changes — revert everything.
- If the engineer is clearly experienced, offer to skip ahead: "If you already know what commands are, say 'skip to 3'."
