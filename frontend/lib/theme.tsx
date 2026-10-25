'use client';
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { IconMoon, IconSun } from '@/components/Icons';

export type ThemeMode = 'light' | 'dark' | 'system';
const KEY = 'callsheet.theme';

/** Runs before the page paints (see app/layout.tsx), so there is no white flash in dark mode. */
export const THEME_BOOT_SCRIPT = `(function(){try{var m=localStorage.getItem('${KEY}')||'system';var d=m==='dark'||(m==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',d?'dark':'light');var b=JSON.parse(localStorage.getItem('callsheet.brand')||'null');if(b&&b.color)document.documentElement.style.setProperty('--brand',b.color);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

interface ThemeState {
  mode: ThemeMode;
  resolved: 'light' | 'dark';
  setMode: (m: ThemeMode) => void;
  toggle: () => void;
}
const Ctx = createContext<ThemeState>({ mode: 'system', resolved: 'light', setMode: () => {}, toggle: () => {} });
export const useTheme = () => useContext(Ctx);

function readMode(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    setModeState(readMode());
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemDark(mq.matches);
    const on = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const resolved: 'light' | 'dark' = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolved);
    const meta = document.querySelector('meta[name="theme-color"]');
    const color = resolved === 'dark' ? '#0d131b' : '#f4f6fa';
    if (meta) meta.setAttribute('content', color);
    else {
      const m = document.createElement('meta');
      m.name = 'theme-color';
      m.content = color;
      document.head.appendChild(m);
    }
  }, [resolved]);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    try {
      localStorage.setItem(KEY, m);
    } catch {
      /* private mode: still works for this visit */
    }
  }, []);

  const toggle = useCallback(() => setMode(resolved === 'dark' ? 'light' : 'dark'), [resolved, setMode]);

  return <Ctx.Provider value={{ mode, resolved, setMode, toggle }}>{children}</Ctx.Provider>;
}

/** Round sun/moon button. Shows what you will switch TO. */
export function ThemeToggle({ className = 'iconbtn', label = false }: { className?: string; label?: boolean }) {
  const { resolved, toggle } = useTheme();
  const dark = resolved === 'dark';
  return (
    <button type="button" className={className} onClick={toggle} aria-label={dark ? 'Switch to day mode' : 'Switch to night mode'} title={dark ? 'Day mode' : 'Night mode'}>
      {label ? (
        <>
          <span className="ico">{dark ? <IconSun /> : <IconMoon />}</span>
          {dark ? 'Day mode' : 'Night mode'}
        </>
      ) : dark ? (
        <IconSun />
      ) : (
        <IconMoon />
      )}
    </button>
  );
}
