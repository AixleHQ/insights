import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { api } from "@/lib/api";

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
  }, []);

  const decodeAndSetToken = (token: string) => {
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
        return;
      }

      setState({
        isImpersonating: true,
        impersonatorEmail: payload.impersonator_email || null,
        token,
      });
    } catch (error) {
      console.error("Failed to decode impersonation token:", error);
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  const startImpersonation = useCallback((token: string) => {
    localStorage.setItem(STORAGE_KEY, token);
    decodeAndSetToken(token);
  }, []);

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
    // Reload to get fresh auth state
    window.location.href = "/";
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
