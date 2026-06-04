# Story: Fix Auth Race Condition Causing Re-authentication Screen on Direct URL Navigation

**Status:** done
**Type:** Bug Fix
**Priority:** High
**Ticket:** AIX-TBD (verify in Jira before branching)
**Branch:** `feature/AIX-XX-fix-auth-race-reauth-screen`

---

## User Story

**As a** logged-in user,  
**I want** to navigate directly to any application URL (e.g. `/events`) without being prompted to re-authenticate,  
**So that** deep links and browser tab reopens work seamlessly when I already have a valid session.

---

## Problem Statement

When a user opens a direct URL in a new tab, the app displays a re-authentication screen even though the user has a valid OIDC session (Google OAuth via Keycloak).

### Root Cause (confirmed through debugging)

Three separate issues combined to produce the symptom:

**1. Missing `silent_redirect_uri` in `UserManager` settings (primary cause)**

`signinSilent()` in `oidc-client-ts` works by opening a hidden iframe pointing to `silent_redirect_uri`. The page at that URI must call `signinSilentCallback()` which sends the new token back to the parent via `postMessage`. Without `silent_redirect_uri` configured, the library fell back to `redirect_uri` (`/auth/callback`) — a page that cannot handle `postMessage` — so the iframe always timed out with `ErrorTimeout: IFrame timed out without a response`. Silent renew never worked.

**2. `initAuth()` did not attempt `signinSilent()` on fresh page load**

When a user opens a new tab, localStorage has no OIDC token (it's only stored after `/auth/callback` is processed). The old `initAuth` saw `user = null` and immediately set `isAuthenticated: false`, triggering a redirect to `/login`. It never attempted a silent renew against the live Keycloak SSO session cookie.

**3. Two `useEffect` blocks in `AuthContext` created a race with OIDC events**

The event listener `useEffect` registered `handleUserUnloaded` and `handleAccessTokenExpired` independently from `initAuth`. If either event fired before `initAuth` resolved (possible because `oidc-client-ts` starts async session checks on `UserManager` creation), it would flip `isAuthenticated: false` mid-initialization and cause an early redirect.

**4. `useCurrentUser()` fired before auth was initialized (secondary)**

`ThemeSyncFromServer` inside `ThemeProvider` called `useCurrentUser()` immediately on mount with no `enabled` guard, sending `GET /users/me` without a token. This caused a 401 that added noise and could interact with TanStack Query's retry logic.

---

## Acceptance Criteria

```gherkin
Feature: Direct URL navigation for authenticated users

  Scenario: User opens protected page in a new tab
    Given the user has an active authenticated OIDC session (Keycloak SSO cookie present)
    When the user opens /events (or any protected route) directly in a browser tab
    Then the page content loads successfully
    And the user is NOT prompted to re-authenticate

  Scenario: User with no session opens protected page
    Given the user has no active session
    When the user opens /events directly
    Then the user is redirected to /login

  Scenario: Theme sync still works
    Given the user has a server-persisted theme preference (e.g. "dark")
    And the user opens the app
    Then the theme from the server is applied after authentication resolves
```

---

## Implementation

### Files Changed

| File | Change |
|------|--------|
| `packages/web/src/lib/auth.ts` | Add `silent_redirect_uri` to `UserManager` settings; deduplicate concurrent `signinSilent` calls via `signinSilentInFlight` promise |
| `packages/web/src/pages/AuthSilentCallback.tsx` | New page — calls `signinSilentCallback()` inside the iframe to complete silent renew |
| `packages/web/src/App.tsx` | Add `/auth/silent-callback` as a public route |
| `packages/web/src/contexts/AuthContext.tsx` | Merge two `useEffect` blocks into one; suppress OIDC events during `initAuth` via `initDoneRef`; call `signinSilent()` when no token in storage |
| `packages/web/src/hooks/useApi.ts` | Guard `useCurrentUser()` with `enabled: !isLoading && isAuthenticated` |
| `packages/web/src/lib/queryClient.ts` | Smart retry: skip retry on 403/404; one retry with 500ms delay for others |
| `packages/web/src/hooks/useCurrentUser.test.tsx` | New test file (5 tests) for the `enabled` guard |

### Key Changes Explained

**`lib/auth.ts` — `silent_redirect_uri` + deduplication**

```typescript
const settings: UserManagerSettings = {
  // ...
  silent_redirect_uri: `${window.location.origin}/auth/silent-callback`,
  // ...
};

let signinSilentInFlight: Promise<User | null> | null = null;

export async function silentRenew(): Promise<User | null> {
  if (signinSilentInFlight) return signinSilentInFlight;
  const manager = getUserManager();
  signinSilentInFlight = manager.signinSilent()
    .catch((error) => { console.error("[Auth] Silent renew failed:", error); return null; })
    .finally(() => { signinSilentInFlight = null; });
  return signinSilentInFlight;
}
```

**`pages/AuthSilentCallback.tsx` — iframe handler**

```typescript
export function AuthSilentCallback() {
  useEffect(() => {
    getUserManager().signinSilentCallback().catch(console.error);
  }, []);
  return null;
}
```

**`contexts/AuthContext.tsx` — single effect, silent renew on init**

```typescript
const initDoneRef = useRef(false);

useEffect(() => {
  const manager = getUserManager();

  // Register events BEFORE initAuth so no events are missed.
  // Suppress userUnloaded/accessTokenExpired until init completes.
  const handleUserUnloaded = () => {
    if (!initDoneRef.current) return;
    setState({ isAuthenticated: false, isLoading: false, user: null, profile: null, error: null });
  };
  // ... other handlers ...

  const initAuth = async () => {
    try {
      let user = await getUser();
      // Fresh page load: no token in storage but Keycloak SSO cookie may be valid
      if (!user || user.expired) {
        user = await silentRenew(); // deduplicates concurrent StrictMode calls
      }
      setState(user && !user.expired
        ? { isAuthenticated: true, isLoading: false, user, profile: getUserProfile(user), error: null }
        : { isAuthenticated: false, isLoading: false, user: null, profile: null, error: null }
      );
    } finally {
      initDoneRef.current = true;
    }
  };

  initAuth();
  return () => { /* remove listeners */ };
}, []);
```

**`hooks/useApi.ts` — guard**

```typescript
export function useCurrentUser() {
  const { isAuthenticated, isLoading } = useAuth();
  return useQuery({
    queryKey: queryKeys.user.current,
    queryFn: async () => {
      const response = await api.get<{ data: CurrentUser }>("/users/me");
      return response.data;
    },
    enabled: !isLoading && isAuthenticated,
  });
}
```

### Keycloak Configuration

`http://localhost:5173/*` wildcard already covers `/auth/silent-callback` in the local Keycloak realm (`keycloak/realm-import.json`). For staging/production environments, ensure `/auth/silent-callback` is listed as a valid redirect URI in the Keycloak client settings.

---

## Session Record

### What was implemented

- `lib/auth.ts` — `silent_redirect_uri` added; `signinSilentInFlight` deduplication added to `silentRenew()`
- `pages/AuthSilentCallback.tsx` — created (calls `signinSilentCallback()`)
- `App.tsx` — `/auth/silent-callback` route added
- `contexts/AuthContext.tsx` — two `useEffect` merged; `initDoneRef` guard; `signinSilent()` on init
- `hooks/useApi.ts` — `enabled: !isLoading && isAuthenticated` added to `useCurrentUser()`
- `lib/queryClient.ts` — smart retry (no retry on 403/404, `retryDelay: 500`)
- `hooks/useCurrentUser.test.tsx` — 5 unit tests for the `enabled` guard

### Verification

- `make lint-web`: ✅ clean
- `make test-web` (useCurrentUser.test.tsx): ✅ 5/5 passed
- Manual: `/events` in new tab loads without re-auth screen after fix

### Deferred / Out of Scope

- E2E Playwright test for the full auth flow
- `OrgContext` raw-fetch sending `"Bearer null"` when token is null — separate, lower severity
- Other hooks in `useApi.ts` that may lack `enabled` guards (audit separately)
