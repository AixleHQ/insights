---
name: swagger-sync
description: Reminds to update packages/api/swagger/v1/swagger.yaml in the same commit when editing controllers or routes.rb.
---

# swagger-sync

You are about to edit a Rails controller or route. The DB90 project rule (see CLAUDE.md) requires that **Swagger stay in lockstep with the implementation at all times**.

## Hard rule

If you add, change, or remove:
- a controller action
- a route
- a response shape
- a query parameter
- a path parameter

You MUST update `packages/api/swagger/v1/swagger.yaml` in the **same commit**.

## How to update

1. Locate the path and method in `swagger.yaml` (or add a new entry if the route is new).
2. Keep the response shape in sync with the Alba serializer you're using.
3. Keep query/path parameters aligned with the controller's `params` usage.
4. If you delete an action, remove the corresponding Swagger entry.

## Verification

After your edit, if the user asks you to review or commit, suggest:

> **Next:** run `/review-commit` — `swagger-auditor` will verify the Swagger diff matches the controller diff.

## Tutor mode

If the user asks "how does swagger-sync work?" or "when does this trigger?":
- Trigger: edits to `packages/api/app/controllers/**` or `packages/api/config/routes.rb`.
- What I inject: the hard rule + how-to + pair with `swagger-auditor` agent.
- I don't block anything — I remind. Enforcement is at `swagger-auditor` (PR time) and CI.
- Cap: 200 words.
