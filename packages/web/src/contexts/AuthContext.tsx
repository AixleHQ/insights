import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import {
  getUserManager,
  login as authLogin,
  logout as authLogout,
  getUser,
  getAccessToken as getAuthAccessToken,
  getUserProfile,
  directLogin as authDirectLogin,
  type User,
  type UserProfile,
} from '../lib/auth';

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

  // Initialize auth state
  useEffect(() => {
    const initAuth = async () => {
      try {
        const user = await getUser();
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
          error: error instanceof Error ? error : new Error('Auth initialization failed'),
        });
      }
    };

    initAuth();
  }, []);

  // Set up event listeners
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
      setState({
        isAuthenticated: false,
        isLoading: false,
        user: null,
        profile: null,
        error: null,
      });
    };

    const handleAccessTokenExpired = () => {
      setState((prev) => ({
        ...prev,
        isAuthenticated: false,
        user: null,
        profile: null,
      }));
    };

    const handleSilentRenewError = (error: Error) => {
      console.error('[AuthContext] Silent renew error:', error);
      setState((prev) => ({
        ...prev,
        error,
      }));
    };

    manager.events.addUserLoaded(handleUserLoaded);
    manager.events.addUserUnloaded(handleUserUnloaded);
    manager.events.addAccessTokenExpired(handleAccessTokenExpired);
    manager.events.addSilentRenewError(handleSilentRenewError);

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
        error: error instanceof Error ? error : new Error('Login failed'),
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
        error: error instanceof Error ? error : new Error('Logout failed'),
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
        error: error instanceof Error ? error : new Error('Direct login failed'),
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
    throw new Error('useAuth must be used within an AuthProvider');
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
