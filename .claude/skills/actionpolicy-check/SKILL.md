---
name: actionpolicy-check
description: Ensures authorize! is called at the start of each Rails controller action (Aixle Insights uses ActionPolicy, not Pundit/CanCan).
---

# actionpolicy-check

Aixle Insights uses **ActionPolicy** for authorization. Every controller action must call `authorize!` at the top.

## Rule

At the **first non-whitespace line** of every controller action:

```ruby
def show
  authorize! current_organization, to: :show?
  # ... rest of the action
end
```

## Patterns

- `<resource>` is usually `current_organization`, `current_project`, or a specific record.
- `<action>` is a predicate method (e.g. `show?`, `update?`, `destroy?`) defined in the corresponding policy under `app/policies/`.
- Policies inherit from `ApplicationPolicy`.

## Do NOT use

- `authorize_resource` (CanCan) — wrong gem
- Pundit's `authorize @resource` syntax — wrong gem
- Manual permission checks (`if current_user.admin?`) — bypasses the policy layer

## What to do

- If you're adding a new action, ensure the policy file has a matching predicate method.
- If you're modifying an action, don't accidentally remove the `authorize!` call.
- If you're reviewing a diff, flag any action that's missing `authorize!`.

## Tutor mode

If the user asks "how does actionpolicy-check work?" or "when does this trigger?":
- Trigger: edits to `packages/api/app/controllers/**/*_controller.rb`.
- What I inject: the `authorize!` rule + anti-patterns to avoid.
- I don't block anything — I remind. Enforcement is at PR review time (`/review-architecture`, `/review-commit`) and optionally a RuboCop cop.
- Cap: 200 words.
