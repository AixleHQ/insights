import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { api } from '../lib/api';
import { queryClient } from '../lib/queryClient';
import { queryKeys, useCurrentUser } from '../hooks/useApi';

export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'db90_theme';
const VALID_THEMES: readonly Theme[] = ['light', 'dark', 'system'];

function isValidTheme(value: string | null): value is Theme {
  return VALID_THEMES.includes(value as Theme);
}

function readStoredTheme(): Theme {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return isValidTheme(stored) ? stored : 'system';
}

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveTheme(theme: Theme): ResolvedTheme {
  return theme === 'system' ? getSystemTheme() : theme;
}

function applyTheme(resolved: ResolvedTheme) {
  document.documentElement.classList.toggle('dark', resolved === 'dark');
}

interface ThemeProviderProps {
  children: ReactNode;
  initialTheme?: Theme;
}

// Syncs the server-persisted theme preference on first authenticated load.
// Rendered inside ThemeContext.Provider so it can call useTheme().
function ThemeSyncFromServer() {
  const { theme, setTheme } = useTheme();
  const { data: currentUser } = useCurrentUser();
  const hasSynced = useRef(false);

  useEffect(() => {
    if (hasSynced.current || !currentUser) return;
    hasSynced.current = true;
    const serverTheme = currentUser.settings?.theme;
    if (isValidTheme(serverTheme) && serverTheme !== theme) {
      setTheme(serverTheme);
    }
  }, [currentUser, theme, setTheme]);

  return null;
}

export function ThemeProvider({ children, initialTheme }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (initialTheme) return initialTheme;
    return readStoredTheme();
  });

  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolveTheme(theme)
  );

  // Apply theme to DOM whenever resolvedTheme changes
  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  // Listen to system preference changes when theme is 'system'
  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      setResolvedTheme(e.matches ? 'dark' : 'light');
    };
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [theme]);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    const resolved = resolveTheme(newTheme);
    setResolvedTheme(resolved);
    localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    // Persist to API (fire-and-forget). Silently ignored if unauthenticated.
    api
      .put(`/users/me/settings/theme`, { value: newTheme })
      .then(() => {
        queryClient.invalidateQueries({ queryKey: queryKeys.user.current });
      })
      .catch(() => {
        // Local state is already updated — API errors are non-fatal
      });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      <ThemeSyncFromServer />
      {children}
    </ThemeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
