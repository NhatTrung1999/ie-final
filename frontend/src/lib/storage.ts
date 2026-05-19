const TOKEN_KEY = 'ie-video-token';
const REFRESH_TOKEN_KEY = 'ie-video-refresh-token';
const USERNAME_KEY = 'ie-video-username';
const CATEGORY_KEY = 'ie-video-category';
const FACTORY_KEY = 'ie-video-factory';
const ROLE_KEY = 'ie-video-role';
const THEME_KEY = 'ie-video-theme';
const DEFAULT_FACTORY = 'LYV';
const FACTORIES = new Set(['LYV', 'LHG', 'LVL', 'LYM']);

export type ThemeMode = 'light' | 'dark';

export type SessionUser = {
  username: string;
  category: string;
  factory: string;
  role: string;
};

export function getStoredToken() {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(TOKEN_KEY) || '';
}

export function getStoredRefreshToken() {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(REFRESH_TOKEN_KEY) || '';
}

export function getStoredSessionUser(): SessionUser {
  if (typeof window === 'undefined') {
    return {
      username: 'Administrator',
      category: 'FF28',
      factory: DEFAULT_FACTORY,
      role: 'user',
    };
  }

  return {
    username: window.localStorage.getItem(USERNAME_KEY) || 'Administrator',
    category: window.localStorage.getItem(CATEGORY_KEY) || 'FF28',
    factory: normalizeFactory(window.localStorage.getItem(FACTORY_KEY)),
    role: window.localStorage.getItem(ROLE_KEY) || 'user',
  };
}

export function persistSession(
  token: string,
  user: SessionUser,
  refreshToken?: string
) {
  if (typeof window === 'undefined') return;

  window.localStorage.setItem(TOKEN_KEY, token);
  if (refreshToken) {
    window.localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  }
  window.localStorage.setItem(USERNAME_KEY, user.username);
  window.localStorage.setItem(CATEGORY_KEY, user.category);
  window.localStorage.setItem(FACTORY_KEY, normalizeFactory(user.factory));
  window.localStorage.setItem(ROLE_KEY, user.role);
}

export function clearStoredSession() {
  if (typeof window === 'undefined') return;

  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  window.localStorage.removeItem(USERNAME_KEY);
  window.localStorage.removeItem(CATEGORY_KEY);
  window.localStorage.removeItem(FACTORY_KEY);
  window.localStorage.removeItem(ROLE_KEY);
}

export function getStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light';

  const storedTheme = window.localStorage.getItem(THEME_KEY);
  if (storedTheme === 'light' || storedTheme === 'dark') {
    return storedTheme;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function persistTheme(theme: ThemeMode) {
  if (typeof window === 'undefined') return;

  window.localStorage.setItem(THEME_KEY, theme);
}

function normalizeFactory(factory?: string | null) {
  const normalized = factory?.trim().toUpperCase();
  return normalized && FACTORIES.has(normalized) ? normalized : DEFAULT_FACTORY;
}
