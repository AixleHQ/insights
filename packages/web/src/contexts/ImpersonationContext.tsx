import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { api, IMPERSONATION_EXPIRED_EVENT } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

interface ImpersonationState {
  isImpersonating: boolean;
  impersonatorEmail: string | null;
  token: string | null;
}

interface ImpersonationContextValue extends ImpersonationState {
  startImpersonation: (token: string) => void;
  stopImpersonation: () => Promise<void>;
}

const STORAGE_KEY = "impersonation_token";

const ImpersonationContext = createContext<ImpersonationContextValue | null>(null);

export function ImpersonationProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ImpersonationState>({
    isImpersonating: false,
    impersonatorEmail: null,
    token: null,
  });

  const decodeAndSetToken = useCallback((token: string) => {
    try {
      // Decode JWT to get impersonator info
      const parts = token.split(".");
      if (parts.length !== 3) {
        throw new Error("Invalid token format");
      }

      const payload = JSON.parse(atob(parts[1]));

      // Check if token is expired
      if (payload.exp && payload.exp < Date.now() / 1000) {
        localStorage.removeItem(STORAGE_KEY);
        setState({ isImpersonating: false, impersonatorEmail: null, token: null });
        return;
      }

      setState({
        isImpersonating: true,
        impersonatorEmail: payload.impersonator_email || null,
        token,
      });
      // Flush all cached data so subsequent queries fetch as the impersonated user
      queryClient.clear();
    } catch (error) {
      console.error("Failed to decode impersonation token:", error);
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  // Keep React state in sync when api.ts removes the token on expiry.
  // api.ts detects expiry in getAuthToken() and dispatches IMPERSONATION_EXPIRED_EVENT
  // (same-tab) + removes the localStorage key (cross-tab storage event covers that case).
  useEffect(() => {
    const clearImpersonation = () => {
      setState({ isImpersonating: false, impersonatorEmail: null, token: null });
      queryClient.clear();
    };

    const handleExpiredEvent = () => {
      if (state.isImpersonating) clearImpersonation();
    };

    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue === null && state.isImpersonating) {
        clearImpersonation();
      }
    };

    window.addEventListener(IMPERSONATION_EXPIRED_EVENT, handleExpiredEvent);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(IMPERSONATION_EXPIRED_EVENT, handleExpiredEvent);
      window.removeEventListener("storage", handleStorage);
    };
  }, [state.isImpersonating]);

  // Check for impersonation token on mount
  useEffect(() => {
    // Check URL for impersonation token
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get("impersonate");

    if (urlToken) {
      // Store the token and remove from URL
      localStorage.setItem(STORAGE_KEY, urlToken);
      window.history.replaceState({}, "", window.location.pathname);
      decodeAndSetToken(urlToken);
    } else {
      // Check localStorage for existing token
      const storedToken = localStorage.getItem(STORAGE_KEY);
      if (storedToken) {
        decodeAndSetToken(storedToken);
      }
    }
  }, [decodeAndSetToken]);

  const startImpersonation = useCallback((token: string) => {
    localStorage.setItem(STORAGE_KEY, token);
    decodeAndSetToken(token);
  }, [decodeAndSetToken]);

  const stopImpersonation = useCallback(async () => {
    try {
      await api.post("/users/me/stop_impersonation");
    } catch (error) {
      console.error("Failed to log impersonation end:", error);
    }
    localStorage.removeItem(STORAGE_KEY);
    setState({
      isImpersonating: false,
      impersonatorEmail: null,
      token: null,
    });
    // Redirect back to admin panel so the admin's Keycloak session is preserved.
    // Navigating to "/" would trigger an OIDC flow as the impersonated user.
    // Falls back to a relative path that works in any environment if VITE_ADMIN_URL is not set.
    const adminUrl = import.meta.env.VITE_ADMIN_URL ?? "/admin/users";
    window.location.href = adminUrl;
  }, []);

  return (
    <ImpersonationContext.Provider
      value={{
        ...state,
        startImpersonation,
        stopImpersonation,
      }}
    >
      {children}
    </ImpersonationContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useImpersonation(): ImpersonationContextValue {
  const context = useContext(ImpersonationContext);
  if (!context) {
    throw new Error("useImpersonation must be used within an ImpersonationProvider");
  }
  return context;
}
