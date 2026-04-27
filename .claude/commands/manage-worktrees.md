---
allowed-tools: Bash(git worktree:*), Bash(git branch:*), Bash(git status:*), Bash(git log:*), Bash(git fetch:*), Bash(ln:*), Bash(ls:*), Bash(mkdir:*), Bash(rm -rf ../db90-rails-*:*)
description: Create, switch, or clean up git worktrees per ticket; symlinks vendor/ and node_modules/ to skip reinstall.
---

## Context

- Repo root: !`git rev-parse --show-toplevel`
- Current branch: !`git branch --show-current`
- Existing worktrees: !`git worktree list`
- Base branch: develop

## Naming Conventions

- **Branch format:** `feature/AIX-XX-feature-name`
  - `AIX-XX` is the Linear ticket ID (e.g., `AIX-61`)
  - `feature-name` is a short kebab-case description of the work (e.g., `user-auth`, `connector-health`)
  - Examples: `feature/AIX-61-user-auth`, `feature/AIX-72-slack-alerts`
- **Worktree directory format:** `../db90-rails-AIX-XX` (sibling of the repo root)
  - Example: `../db90-rails-AIX-61`
- **Base branch:** always `develop` — never branch from `staging` or `main`

---

## Your task

Read the user's request and determine which action to take:

---

### ACTION: Create a worktree for a ticket

**Trigger:** user says "create a worktree for [TICKET-ID]", "new worktree", "start worktree", or similar.

**Steps:**

1. Extract the ticket ID (e.g., `AIX-61`). If the user didn't provide a short feature name, ask for one before proceeding.

2. Fetch the latest `develop` without switching branches:
   ```
   git fetch origin develop
   ```

3. Build names using the conventions above:
   - Branch: `feature/AIX-XX-feature-name`
   - Directory: `../db90-rails-AIX-XX`

4. Create the worktree from `origin/develop` directly:
   ```
   git worktree add ../db90-rails-AIX-XX -b feature/AIX-XX-feature-name origin/develop
   ```

5. Symlink Rails gems to avoid reinstalling:
   ```
   ln -s $(git rev-parse --show-toplevel)/packages/api/vendor ../db90-rails-AIX-XX/packages/api/vendor
   ```
   Skip if `packages/api/vendor` does not exist in the main repo.

6. Symlink Node modules to avoid reinstalling:
   ```
   ln -s $(git rev-parse --show-toplevel)/packages/web/node_modules ../db90-rails-AIX-XX/packages/web/node_modules
   ```

7. Report a summary:
   - Worktree path
   - Branch name
   - How to open it (use the actual worktree path, e.g. `../db90-rails-AIX-XX`):
     ```
     cd <worktree-path>
     claude
     ```

---

### ACTION: List worktrees

**Trigger:** user says "list worktrees", "show worktrees", "what worktrees do I have", or similar.

Run:
```
git worktree list
```

Display path, branch, and HEAD commit for each. Mark the main worktree clearly.

---

### ACTION: Clean up a worktree

**Trigger:** user says "remove worktree", "delete worktree", "clean up [TICKET-ID or branch]", or similar.

**Steps:**

1. Identify the worktree from `git worktree list`.

2. Check for uncommitted or unpushed work:
   ```
   git -C <worktree-path> status --short
   git -C <worktree-path> log develop..HEAD --oneline
   ```

3. If uncommitted changes or unpushed commits exist, **warn the user** and ask for confirmation before continuing.

4. Remove the worktree:
   ```
   git worktree remove <worktree-path> --force
   ```

5. Delete the branch if merged or user confirms:
   ```
   git branch -d feature/AIX-XX-feature-name
   ```
   Use `-D` only if the user explicitly confirms discarding unmerged work.

6. Confirm removal.

---

### ACTION: Clean up all merged worktrees

**Trigger:** user says "clean up merged worktrees", "prune worktrees", or similar.

**Steps:**

1. List all non-main worktrees from `git worktree list`.
2. For each, check if its branch is merged into `develop`:
   ```
   git branch --merged develop | grep <branch-name>
   ```
3. Remove merged worktrees and their branches automatically.
4. List unmerged worktrees and ask the user before removing each.
5. Run `git worktree prune` to clean stale references.

---

### ACTION: Navigate to / open a worktree

**Trigger:** user says "switch to worktree [TICKET-ID]", "open worktree", "navigate to worktree", "how do I start working on [TICKET-ID]", or similar.

1. Find the matching worktree path from `git worktree list`.
2. Tell the user they can get the exact path by running:
   ```
   git worktree list
   ```
3. Then open a new terminal tab, navigate to the worktree, and start Claude:
   ```
   cd <worktree-path>
   claude
   ```
4. Remind them that Claude will automatically pick up the branch context from the directory.

---

## Notes

- The `vendor/` and `node_modules/` symlinks share installed dependencies from the main repo. **Do not run `bundle install` or `npm install` in the worktree** unless a gem or package was added on that branch — in that case, remove the symlink first and install independently.
- All worktrees share the same `.git` history — commits, fetches, and branches are visible everywhere.
