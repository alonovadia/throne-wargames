export type Theme = 'dark' | 'light';

const storageKey = 'throne-wargames-theme';

export function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';

  try {
    return window.localStorage.getItem(storageKey) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;

  try {
    window.localStorage.setItem(storageKey, theme);
  } catch {
    // Theme still applies for this session when storage is unavailable.
  }
}