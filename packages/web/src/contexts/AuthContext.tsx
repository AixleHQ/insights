import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import {
  getUserManager,
  login as authLogin,
  logout as authLogout,
  getUser,
  getAccessToken as getAuthAccessToken,
  getUserProfile,
  silentRenew,
  directLogin as authDirectLogin,
  type User,
  type UserProfile,
} from "../lib/auth";

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  profile: UserProfile | null;
  error: Error | null;
}

interface AuthContextValue extends AuthState {
  login: () => Promise<void>;
  logout: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
  directLogin: (username: string, password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    user: null,
    profile: null,
    error: null,
  });

  // Track whether initAuth has completed so OIDC events fired during init are ignored.
  // Using a ref (not state) to avoid re-renders and ensure the flag is visible
  // synchronously inside event handlers registered in the same effect.
  const initDoneRef = useRef(false);

  // Single effect: register OIDC event listeners BEFORE running initAuth so no
  // events are missed, but suppress userUnloaded / accessTokenExpired until init
  // completes — otherwise a transient OIDC check during storage read can flip
  // isAuthenticated to false and trigger a redirect to /login mid-initialization.
  useEffect(() => {
    const manager = getUserManager();

    const handleUserLoaded = (user: User) => {
      setState({
        isAuthenticated: true,
        isLoading: false,
        user,
        profile: getUserProfile(user),
        error: null,
      });
    };

    const handleUserUnloaded = () => {
      console.log("[AuthContext] userUnloaded event, initDone:", initDoneRef.current);
      if (!initDoneRef.current) return;
      setState({
        isAuthenticated: false,
        isLoading: false,
        user: null,
        profile: null,
        error: null,
      });
    };

    const handleAccessTokenExpired = () => {
      console.log("[AuthContext] accessTokenExpired event, initDone:", initDoneRef.current);
      if (!initDoneRef.current) return;
      setState((prev) => ({
        ...prev,
        isAuthenticated: false,
        user: null,
        profile: null,
      }));
    };

    const handleSilentRenewError = (error: Error) => {
      console.error("[AuthContext] Silent renew error:", error);
      setState((prev) => ({ ...prev, error }));
    };

    manager.events.addUserLoaded(handleUserLoaded);
    manager.events.addUserUnloaded(handleUserUnloaded);
    manager.events.addAccessTokenExpired(handleAccessTokenExpired);
    manager.events.addSilentRenewError(handleSilentRenewError);

    const initAuth = async () => {
      try {
        let user = await getUser();

        // If no user in storage, or stored token is expired, attempt silent renew.
        // This is the normal path for a fresh page load when the user already has
        // a valid Keycloak session — the access token may not be in localStorage
        // yet but the SSO session cookie is present, so signinSilent() succeeds.
        if (!user || user.expired) {
          console.log("[AuthContext] No valid token in storage, attempting silent renew...");
          // silentRenew() deduplicates concurrent calls (React StrictMode double-mount)
          user = await silentRenew();
          if (!user) {
            console.log("[AuthContext] Silent renew returned no user, treating as unauthenticated");
          }
        }

        if (user && !user.expired) {
          setState({
            isAuthenticated: true,
            isLoading: false,
            user,
            profile: getUserProfile(user),
            error: null,
          });
        } else {
          setState({
            isAuthenticated: false,
            isLoading: false,
            user: null,
            profile: null,
            error: null,
          });
        }
      } catch (error) {
        setState({
          isAuthenticated: false,
          isLoading: false,
          user: null,
          profile: null,
          error: error instanceof Error ? error : new Error("Auth initialization failed"),
        });
      } finally {
        initDoneRef.current = true;
      }
    };

    initAuth();

    return () => {
      manager.events.removeUserLoaded(handleUserLoaded);
      manager.events.removeUserUnloaded(handleUserUnloaded);
      manager.events.removeAccessTokenExpired(handleAccessTokenExpired);
      manager.events.removeSilentRenewError(handleSilentRenewError);
    };
  }, []);

  const login = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      await authLogin();
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error : new Error("Login failed"),
      }));
    }
  }, []);

  const logout = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true }));
    try {
      await authLogout();
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error : new Error("Logout failed"),
      }));
    }
  }, []);

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    if (!state.user) return null;
    // Use the auth library's getAccessToken which handles token refresh
    return getAuthAccessToken();
  }, [state.user]);

  const directLogin = useCallback(async (username: string, password: string) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const user = await authDirectLogin(username, password);
      setState({
        isAuthenticated: true,
        isLoading: false,
        user,
        profile: getUserProfile(user),
        error: null,
      });
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error : new Error("Direct login failed"),
      }));
      throw error;
    }
  }, []);

  const value: AuthContextValue = {
    ...state,
    login,
    logout,
    getAccessToken,
    directLogin,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

// Hook for checking if user has required roles
// eslint-disable-next-line react-refresh/only-export-components
export function useRequireAuth(): AuthContextValue & { isReady: boolean } {
  const auth = useAuth();
  return {
    ...auth,
    isReady: !auth.isLoading && auth.isAuthenticated,
  };
}
