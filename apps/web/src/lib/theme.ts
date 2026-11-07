import { useCallback, useState } from 'react';

export type Theme = 'day' | 'night';
const KEY = 'cropcash-theme';

function read(): Theme {
  return document.documentElement.dataset.theme === 'night' ? 'night' : 'day';
}

/** Day/night theme. Saved per device; storage may be unavailable, so failures are ignored. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(read);
  const toggle = useCallback(() => {
    const next: Theme = read() === 'night' ? 'day' : 'night';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* private mode or blocked storage */
    }
    setTheme(next);
  }, []);
  return { theme, toggle };
}
