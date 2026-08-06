import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { ErrorResponse } from "oidc-client-ts";
import { AuthProvider, useAuth } from "./AuthContext";
import { LOGOUT_BROADCAST_KEY } from "../lib/auth";

// Capture the UserManager event handlers AuthProvider registers, so tests can fire the
// silent-renew-error event directly and observe the resulting auth state. Hoisted so the
// vi.mock factory below (which is itself hoisted) can reference them safely.
const { handlers, mockManager, authedUser } = vi.hoisted(() => {
  const handlers: Record<string, (arg?: unknown) => void> = {};
  const mockManager = {
    settings: {
      authority: "http://localhost:8080/realms/db90",
      client_id: "db90-web",
    },
    removeUser: vi.fn(async () => {
      handlers.userUnloaded?.();
    }),
    events: {
      addUserLoaded: (cb: (u: unknown) => void) => (handlers.userLoaded = cb),
      addUserUnloaded: (cb: () => void) => (handlers.userUnloaded = cb),
      addAccessTokenExpired: (cb: () => void) => (handlers.accessTokenExpired = cb),
      addSilentRenewError: (cb: (e: unknown) => void) => (handlers.silentRenewError = cb),
      addUserSignedOut: (cb: () => void) => (handlers.userSignedOut = cb),
      removeUserLoaded: () => {},
      removeUserUnloaded: () => {},
      removeAccessTokenExpired: () => {},
      removeSilentRenewError: () => {},
      removeUserSignedOut: () => {},
    },
  };
  const authedUser = {
    expired: false,
    access_token: "tok",
    profile: { sub: "sub-1", email: "user@example.com" },
  };
  return { handlers, mockManager, authedUser };
});

vi.mock("../lib/auth", async () => {
  const actual = await vi.importActual<typeof import("../lib/auth")>("../lib/auth");
  return {
    ...actual, // keep the real isDeadSessionError / getUserProfile
    getUserManager: () => mockManager,
    getUser: vi.fn().mockResolvedValue(authedUser),
    silentRenew: vi.fn().mockResolvedValue(null),
  };
});

vi.mock("../lib/rollbar", () => ({ reportAuthError: vi.fn() }));

function AuthProbe() {
  const { isAuthenticated } = useAuth();
  return <div data-testid="auth">{String(isAuthenticated)}</div>;
}

async function renderAuthed() {
  render(
    <AuthProvider>
      <AuthProbe />
    </AuthProvider>
  );
  await waitFor(() => expect(screen.getByTestId("auth").textContent).toBe("true"));
}

describe("AuthContext — silent renew error handling", () => {
  beforeEach(() => {
    for (const k of Object.keys(handlers)) delete handlers[k];
  });

  it("drops to unauthenticated on a dead-session (invalid_grant) silent-renew error", async () => {
    await renderAuthed();

    act(() => {
      handlers.silentRenewError(
        new ErrorResponse({ error: "invalid_grant", error_description: "Token is not active" })
      );
    });

    await waitFor(() => expect(screen.getByTestId("auth").textContent).toBe("false"));
  });

  it("stays authenticated on a transient (network) silent-renew error", async () => {
    await renderAuthed();

    act(() => {
      handlers.silentRenewError(new TypeError("Failed to fetch"));
    });

    // Give any (unwanted) state update a chance to flush, then assert it stayed true.
    await Promise.resolve();
    expect(screen.getByTestId("auth").textContent).toBe("true");
  });
});

describe("AuthContext — cross-tab logout", () => {
  beforeEach(() => {
    for (const k of Object.keys(handlers)) delete handlers[k];
    vi.mocked(mockManager.removeUser).mockClear();
  });

  it("clears auth when the logout broadcast key is written in another tab", async () => {
    await renderAuthed();

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: LOGOUT_BROADCAST_KEY,
          newValue: String(1700000000000),
          oldValue: null,
        })
      );
    });

    await waitFor(() => expect(mockManager.removeUser).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId("auth").textContent).toBe("false"));
  });

  it("ignores storage events for unrelated keys", async () => {
    await renderAuthed();

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "unrelated-key",
          newValue: null,
          oldValue: "x",
        })
      );
    });

    await Promise.resolve();
    expect(mockManager.removeUser).not.toHaveBeenCalled();
    expect(screen.getByTestId("auth").textContent).toBe("true");
  });

  it("clears auth on userSignedOut (OP session ended)", async () => {
    await renderAuthed();

    act(() => {
      handlers.userSignedOut?.();
    });

    await waitFor(() => expect(mockManager.removeUser).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId("auth").textContent).toBe("false"));
  });
});
