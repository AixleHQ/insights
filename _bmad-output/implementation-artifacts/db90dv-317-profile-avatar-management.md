# Story: AIX-317 — Profile Avatar Management Issues

Status: done

## Story

As a logged-in user,
I want to upload an avatar image from my device and remove my existing avatar,
so that I can manage my profile picture without needing to host images externally.

## Acceptance Criteria

1. **AC1 — File Upload:** On the Profile settings page (`/profile`), users can upload an avatar image directly from their device (JPEG, PNG, GIF, WebP). After upload, the new avatar is immediately visible.
2. **AC2 — Avatar Removal:** Users can remove their current avatar. After removal, the UI reverts to the default initials-based fallback. The avatar is removed from the server (not merely hidden in the UI).
3. **AC3 — URL Input preserved:** The existing "Avatar URL" text input remains as an alternative way to set an avatar. It must continue to work correctly.
4. **AC4 — Clearing URL field removes avatar:** When the user clears the Avatar URL field and saves, `avatar_url` is set to `null` in the DB (currently broken — empty string becomes `undefined` and is never sent).
5. **AC5 — API endpoints:** Two new endpoints exist: `POST /api/v1/users/me/avatar` (multipart upload) and `DELETE /api/v1/users/me/avatar`.
6. **AC6 — Swagger in sync:** `swagger.yaml` is updated with the two new endpoints in the same commit.
7. **AC7 — Existing tests pass:** All existing RSpec request specs for `PATCH /api/v1/users/me` continue to pass without modification.

## Tasks / Subtasks

### Backend

- [x] **Task 1: Install Active Storage** (AC5, AC1, AC2)
  - [x] Run `bundle exec rails active_storage:install` from `packages/api/` — generates migration
  - [x] Run `bundle exec rails db:migrate`
  - [x] Verify `active_storage_blobs`, `active_storage_attachments`, `active_storage_variant_records` tables exist in `db/structure.sql`

- [x] **Task 2: Configure MinIO storage service** (AC1, AC2)
  - [x] Add `minio` service to `packages/api/config/storage.yml`
  - [x] Update `config/environments/development.rb` to use `:minio` (or keep `:local` for simplicity — see Dev Notes)
  - [x] Keep `test.rb` on `:test` (Disk) — do NOT change

- [x] **Task 3: Update User model** (AC1, AC2)
  - [x] Add `has_one_attached :avatar_file` to `packages/api/app/models/user.rb`
  - [x] Add `resolved_avatar_url` helper method (see Dev Notes for logic)

- [x] **Task 4: Update serializers** (AC1, AC2, AC3)
  - [x] `UserSerializer`: replace `avatar_url` attribute with `resolved_avatar_url`
  - [x] `UserMinimalSerializer`: same
  - [x] `ProjectMembershipSerializer`: update `avatar_url` block to use `membership.user.resolved_avatar_url`

- [x] **Task 5: Add avatar routes** (AC5)
  - [x] In `packages/api/config/routes.rb` (inside the `v1` namespace, near other `users/me` routes):
    ```ruby
    post   "users/me/avatar", to: "users#upload_avatar"
    delete "users/me/avatar", to: "users#destroy_avatar"
    ```

- [x] **Task 6: Add controller actions** (AC1, AC2, AC5)
  - [x] Add `upload_avatar` action to `UsersController`
  - [x] Add `destroy_avatar` action to `UsersController`
  - [x] Both must call `authorize! current_user, to: :update?`
  - [x] Add `:upload_avatar` and `:destroy_avatar` to `user_params`-independent flow (no `user_params` needed)

- [x] **Task 7: Fix avatar_url null clearing bug** (AC4)
  - [x] In `user_params`, ensure `nil` is passed through for `avatar_url` when explicitly provided as `null`/empty
  - [x] No change needed on backend — Rails `update(avatar_url: nil)` already works; the bug is frontend-only

- [x] **Task 8: Update Swagger** (AC6)
  - [x] Add `POST /api/v1/users/me/avatar` with `multipart/form-data` request body
  - [x] Add `DELETE /api/v1/users/me/avatar` with 200 response referencing `User` schema

- [x] **Task 9: Update request specs** (AC5, AC7)
  - [x] Add `describe 'POST /api/v1/users/me/avatar'` block to `packages/api/spec/requests/api/v1/users_spec.rb`
  - [x] Add `describe 'DELETE /api/v1/users/me/avatar'` block
  - [x] Verify existing specs still pass

### Frontend

- [x] **Task 10: Fix avatar_url null clearing bug** (AC4)
  - [x] In `packages/web/src/hooks/useApi.ts` — change mutation type: `avatar_url?: string | null`
  - [x] In `packages/web/src/pages/UserSettings.tsx` — `handleSave`: send `avatar_url: avatarUrl || null` (not `avatarUrl || undefined`)

- [x] **Task 11: Add useUploadAvatar and useDeleteAvatar hooks** (AC1, AC2)
  - [x] `useUploadAvatar` — `POST /users/me/avatar` with `FormData` via `apiRequest`
  - [x] `useDeleteAvatar` — `DELETE /users/me/avatar` via `api.delete`
  - [x] Both invalidate `queryKeys.user.current` on success

- [x] **Task 12: Update UserSettings UI** (AC1, AC2, AC3)
  - [x] In edit mode: add `<input type="file" accept="image/*">` (hidden, triggered by a Button)
  - [x] Add "Remove avatar" button (visible only when avatar is set)
  - [x] Keep existing Avatar URL field
  - [x] Show upload progress/loading state while uploading
  - [x] Use existing shadcn `Button`, `Label`, `Avatar`, `AvatarImage`, `AvatarFallback` components only

### Review Findings

- [x] [Review][Patch] Remove unrelated schema drift from structure dump (unexpected `is_active` drop and orphan migration version) [packages/api/db/structure.sql]
- [x] [Review][Patch] Prevent file-upload response URL from being persisted via `avatar_url` input state [packages/web/src/pages/UserSettings.tsx:115]
- [x] [Review][Patch] Eliminate race between immediate avatar delete and profile save requests [packages/web/src/pages/UserSettings.tsx:127]
- [x] [Review][Patch] Enforce avatar MIME/type constraints server-side and align client accept list to AC formats [packages/api/app/controllers/api/v1/users_controller.rb:148]

## Dev Notes

### Critical: Root cause of the delete bug (AC4)

**File:** `packages/web/src/pages/UserSettings.tsx` line 112-114

```typescript
// BROKEN — empty string becomes `undefined`, never sent in PATCH body
updateUser.mutate({
  name: name || undefined,
  avatar_url: avatarUrl || undefined,  // ← BUG: should be `|| null`
});
```

```typescript
// FIXED
updateUser.mutate({
  name: name || undefined,
  avatar_url: avatarUrl || null,  // null → Rails treats as NULL in DB
});
```

**File:** `packages/web/src/hooks/useApi.ts` line 195 — update type signature:
```typescript
mutationFn: (data: { name?: string; avatar_url?: string | null }) =>
```

### Active Storage installation

Run from `packages/api/` (NOT repo root):
```bash
bundle exec rails active_storage:install
bundle exec rails db:migrate
```

The generated migration creates 3 tables. Check `db/structure.sql` after migration to confirm they appear.

**Important:** Active Storage is already configured in all environments (`config.active_storage.service = :local`). The gem `aws-sdk-s3` and `image_processing` are already in Gemfile. No Gemfile changes needed.

### Storage service decision

For **development/staging/production**, decide between `:local` (disk on server) and MinIO:

- **Simplest path (recommended for this bug fix):** Keep `:local` for all non-test environments. Files stored in `storage/` on disk. Zero infrastructure change.
- **Full MinIO path:** Only needed if we want S3-compatible storage. Requires creating an `avatars` bucket in MinIO and env vars. Premature for a bug fix ticket.

**Decision: Keep `:local` for all envs. MinIO integration is out of scope for AIX-317.**

### User model changes

```ruby
# packages/api/app/models/user.rb
has_one_attached :avatar_file

def resolved_avatar_url
  return rails_blob_url(avatar_file) if avatar_file.attached?
  avatar_url
end
```

**Note:** `rails_blob_url` requires `include Rails.application.routes.url_helpers` in the model, or use the controller pattern. Alternative: use `avatar_file.url` which works directly on the attached blob. Check existing model helpers in the codebase.

**Better alternative** — keep resolved_avatar_url simple and let the serializer call it:
```ruby
def resolved_avatar_url
  avatar_file.attached? ? avatar_file.url : avatar_url
end
```

`avatar_file.url` works because `aws-sdk-s3` is loaded and Active Storage generates URLs correctly for Disk service too (via `/rails/active_storage/blobs/...` routes).

### Serializer changes

**UserSerializer** (`packages/api/app/serializers/user_serializer.rb`):
```ruby
# BEFORE
attributes :id, :email, :name, :avatar_url, :global_admin

# AFTER
attributes :id, :email, :name, :global_admin
attribute :avatar_url do |user|
  user.resolved_avatar_url
end
```

**Same pattern** for `UserMinimalSerializer` and the `avatar_url` block in `ProjectMembershipSerializer`.

**Alba key transform:** Alba automatically camelizes keys (`avatar_url` → `avatarUrl`). The attribute name `:avatar_url` in `attributes` / `attribute :avatar_url` ensures the frontend receives `avatarUrl`. Do NOT rename the attribute.

### Controller actions

```ruby
# POST /api/v1/users/me/avatar
def upload_avatar
  authorize! current_user, to: :update?

  unless params[:file].present?
    return render json: { error: "file is required" }, status: :unprocessable_content
  end

  current_user.avatar_file.attach(params[:file])
  current_user.user_settings.load
  render_resource(current_user, UserSerializer)
end

# DELETE /api/v1/users/me/avatar
def destroy_avatar
  authorize! current_user, to: :update?

  current_user.avatar_file.purge if current_user.avatar_file.attached?
  current_user.update!(avatar_url: nil)
  current_user.user_settings.load
  render_resource(current_user, UserSerializer)
end
```

**Important:** `current_user.user_settings.load` is called before `render_resource` in every existing action in this controller (see `me` and `update` actions). Must preserve this pattern.

### Routes

Add to `packages/api/config/routes.rb` in the `v1` namespace block, near line 28 (after existing `users/me` routes):
```ruby
post   "users/me/avatar", to: "users#upload_avatar"
delete "users/me/avatar", to: "users#destroy_avatar"
```

### Swagger update (MANDATORY)

Add two paths to `packages/api/swagger/v1/swagger.yaml` after the existing `PATCH /api/v1/users/me` block:

```yaml
  /api/v1/users/me/avatar:
    post:
      summary: Upload user avatar
      tags:
        - Users
      requestBody:
        required: true
        content:
          multipart/form-data:
            schema:
              type: object
              required:
                - file
              properties:
                file:
                  type: string
                  format: binary
      responses:
        '200':
          description: Avatar uploaded
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    $ref: '#/components/schemas/User'
        '422':
          $ref: '#/components/responses/ValidationError'
    delete:
      summary: Delete user avatar
      tags:
        - Users
      responses:
        '200':
          description: Avatar deleted
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    $ref: '#/components/schemas/User'
```

### Frontend hooks

```typescript
// packages/web/src/hooks/useApi.ts — add after useUpdateCurrentUser

export function useUploadAvatar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return api.post<{ data: CurrentUser }>("/users/me/avatar", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.user.current });
    },
  });
}

export function useDeleteAvatar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.delete<{ data: CurrentUser }>("/users/me/avatar"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.user.current });
    },
  });
}
```

**Note:** Check how `api.post` handles `FormData` in `packages/web/src/lib/api.ts`. Axios auto-sets `Content-Type: multipart/form-data` with boundary when passed FormData — the explicit header override may not be needed (or may break the boundary). Verify the existing API client behavior before adding the header manually.

### Frontend UI changes (UserSettings.tsx)

In the editing block (`isEditing` branch), replace the avatar section:

```tsx
{/* Replace current avatar preview block */}
<div className="flex items-center gap-4">
  <Avatar size="lg" className="size-16">
    <AvatarImage src={avatarUrl || undefined} />
    <AvatarFallback>{initials}</AvatarFallback>
  </Avatar>
  <div className="flex flex-col gap-2">
    <p className="text-sm text-muted-foreground">Avatar preview</p>
    <div className="flex gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploadAvatar.isPending}
      >
        {uploadAvatar.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
        Upload image
      </Button>
      {(avatarUrl || currentUser?.avatarUrl) && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleRemoveAvatar}
          disabled={deleteAvatar.isPending}
        >
          Remove
        </Button>
      )}
    </div>
    <input
      ref={fileInputRef}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={handleFileChange}
    />
  </div>
</div>
```

Use `useRef<HTMLInputElement>(null)` for the hidden file input. Handle file selection in `handleFileChange`:
```typescript
function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0];
  if (!file) return;
  uploadAvatar.mutate(file, {
    onSuccess: (res) => {
      setAvatarUrl(res.data.data.avatarUrl ?? "");
    },
    onError: () => setError("Failed to upload image. Please try again."),
  });
}

function handleRemoveAvatar() {
  setAvatarUrl("");
}
```

**Important:** `handleRemoveAvatar` only clears local state. The actual server-side delete happens when `handleSave` is called with `avatar_url: null`. Alternatively, hook `useDeleteAvatar` directly to the Remove button for immediate server deletion — but this requires more care with save/cancel state. **Recommended:** keep delete server-side only via PATCH with `avatar_url: null` for simplicity, and use the new `DELETE /avatar` endpoint only if a dedicated "Remove avatar" immediate-action UX is desired.

### Anti-patterns to avoid

1. **Do NOT** use `fetch` or `axios` directly in components. Use `api` from `packages/web/src/lib/api.ts`.
2. **Do NOT** create a new serializer framework. Extend existing Alba serializers.
3. **Do NOT** modify `user_params` to allow file uploads — the file upload goes through a separate action that reads `params[:file]` directly.
4. **Do NOT** skip `authorize! current_user, to: :update?` in new controller actions.
5. **Do NOT** forget `current_user.user_settings.load` before `render_resource` (pattern from existing actions).
6. **Do NOT** change `test.rb` Active Storage config — it must stay `:test`.
7. **Do NOT** introduce `ActiveModelSerializers`, `Blueprinter`, or any non-Alba serializer.
8. **Do NOT** hardcode localhost URLs in frontend. Vite proxies `/api` to Rails.

### Project Structure Notes

| File | Action |
|------|--------|
| `packages/api/db/migrate/YYYYMMDD_active_storage_create_*.rb` | CREATED by Rails generator |
| `packages/api/db/structure.sql` | UPDATED by `db:migrate` |
| `packages/api/app/models/user.rb` | UPDATE: add `has_one_attached`, `resolved_avatar_url` |
| `packages/api/app/serializers/user_serializer.rb` | UPDATE: use `resolved_avatar_url` |
| `packages/api/app/serializers/user_minimal_serializer.rb` | UPDATE: use `resolved_avatar_url` |
| `packages/api/app/serializers/project_membership_serializer.rb` | UPDATE: use `resolved_avatar_url` |
| `packages/api/app/controllers/api/v1/users_controller.rb` | UPDATE: add `upload_avatar`, `destroy_avatar` |
| `packages/api/config/routes.rb` | UPDATE: add 2 avatar routes |
| `packages/api/swagger/v1/swagger.yaml` | UPDATE: add 2 endpoints |
| `packages/api/spec/requests/api/v1/users_spec.rb` | UPDATE: add avatar upload/delete specs |
| `packages/web/src/hooks/useApi.ts` | UPDATE: fix type + add 2 hooks |
| `packages/web/src/pages/UserSettings.tsx` | UPDATE: fix null bug + add upload UI |

### References

- Jira ticket: [AIX-317](AIX-317)
- Current controller: `packages/api/app/controllers/api/v1/users_controller.rb`
- Current serializers: `packages/api/app/serializers/user_serializer.rb`, `user_minimal_serializer.rb`, `project_membership_serializer.rb`
- Current frontend hook: `packages/web/src/hooks/useApi.ts` lines 191–201
- Current UI: `packages/web/src/pages/UserSettings.tsx` `ProfileSection` component (lines 79–216)
- Existing request specs: `packages/api/spec/requests/api/v1/users_spec.rb`
- Bug root: `avatarUrl || undefined` on line ~113 of `UserSettings.tsx` — must be `|| null`
- Active Storage config: all environments already have `config.active_storage.service = :local`
- Gemfile: `aws-sdk-s3` and `image_processing` already present — no Gemfile changes needed
- Recent related commit: `bc35696 [AIX-315] added avatar_url to membersData` — shows `avatar_url` is now included in members data

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.6

### Debug Log References

- Active Storage `url_options` error: solved by adding `before_action :set_active_storage_url_options` in `ApplicationController` that sets `ActiveStorage::Current.url_options = { host: request.base_url }` — this is required for Disk service to generate URLs
- `authenticated_post` in `auth_helper.rb` serializes to JSON, breaking multipart uploads — solved by adding `authenticated_multipart_post` helper that skips `Content-Type` header and passes params directly
- `api.post` in `api.ts` always calls `JSON.stringify(body)` — solved by detecting `FormData` in `apiRequest`'s `buildHeaders` and skipping `Content-Type: application/json` header so browser sets correct multipart boundary

### Completion Notes List

- Installed Active Storage via Docker (`docker compose exec api`) — Rails is running containerised, not locally
- Storage strategy: kept `:local` for all non-test environments per Dev Notes decision; MinIO out of scope
- `resolved_avatar_url` uses `avatar_file.url` (Active Storage blob URL) when attached, falls back to `avatar_url` column
- `ApplicationController` now sets `ActiveStorage::Current.url_options` on every request — needed for URL generation in serializers
- `spec/rails_helper.rb` has a `before(:each, type: :request)` block for `url_options` in test env
- `authenticated_multipart_post` helper added to `spec/support/auth_helper.rb` for file upload specs
- `apiRequest` in `api.ts` now auto-detects `FormData` and omits `Content-Type` header (browser sets multipart boundary)
- `useUploadAvatar` uses `apiRequest` directly (not `api.post`) to send FormData correctly
- Frontend `handleRemoveAvatar` calls `useDeleteAvatar` immediately on click (server-side delete, not deferred to save)
- All 931 backend RSpec examples pass; all 622 frontend Vitest tests pass

### File List

- `packages/api/db/migrate/20260605100843_create_active_storage_tables.active_storage.rb` (CREATED)
- `packages/api/db/structure.sql` (UPDATED — Active Storage tables added)
- `packages/api/app/models/user.rb` (UPDATED — `has_one_attached :avatar_file`, `resolved_avatar_url`)
- `packages/api/app/serializers/user_serializer.rb` (UPDATED — `avatar_url` block using `resolved_avatar_url`)
- `packages/api/app/serializers/user_minimal_serializer.rb` (UPDATED — same)
- `packages/api/app/serializers/project_membership_serializer.rb` (UPDATED — `resolved_avatar_url`)
- `packages/api/app/controllers/application_controller.rb` (UPDATED — `set_active_storage_url_options` before_action)
- `packages/api/app/controllers/api/v1/users_controller.rb` (UPDATED — `upload_avatar`, `destroy_avatar` actions)
- `packages/api/config/routes.rb` (UPDATED — 2 avatar routes)
- `packages/api/swagger/v1/swagger.yaml` (UPDATED — 2 new endpoints)
- `packages/api/spec/requests/api/v1/users_spec.rb` (UPDATED — avatar upload/delete specs)
- `packages/api/spec/support/auth_helper.rb` (UPDATED — `authenticated_multipart_post` helper)
- `packages/api/spec/rails_helper.rb` (UPDATED — `url_options` before hook)
- `packages/api/spec/fixtures/files/avatar.png` (CREATED — minimal PNG for tests)
- `packages/web/src/hooks/useApi.ts` (UPDATED — type fix, `useUploadAvatar`, `useDeleteAvatar`)
- `packages/web/src/lib/api.ts` (UPDATED — FormData detection in `buildHeaders`)
- `packages/web/src/pages/UserSettings.tsx` (UPDATED — upload/remove UI, null fix)
- `packages/web/src/pages/UserSettings.test.tsx` (UPDATED — mock new hooks)

## Change Log

- 2026-06-05: Installed Active Storage, added avatar upload/delete endpoints, fixed avatar_url null clearing bug, added file upload UI (Date: 2026-06-05)
