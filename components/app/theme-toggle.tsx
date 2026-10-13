'use client';

import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.dataset.theme === 'dark');
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? 'dark' : 'light';
    localStorage.setItem('inhouse-theme', next ? 'dark' : 'light');
  }

  return (
    <button type="button" onClick={toggle} className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--muted)] shadow-sm hover:bg-[var(--canvas)]" aria-label="Toggle theme" title="Toggle light/dark theme">
      {dark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
