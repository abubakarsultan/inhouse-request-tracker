'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

export default function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [active, setActive] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const safetyTimer = useRef<number | null>(null);

  function start() {
    setFinishing(false);
    setActive(true);
    if (safetyTimer.current) window.clearTimeout(safetyTimer.current);
    safetyTimer.current = window.setTimeout(() => {
      setFinishing(true);
      window.setTimeout(() => { setActive(false); setFinishing(false); }, 180);
    }, 8000);
  }

  useEffect(() => {
    const onCustom = () => start();
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      try {
        const url = new URL(anchor.href, window.location.href);
        if (url.origin !== window.location.origin) return;
        const current = `${window.location.pathname}${window.location.search}`;
        const next = `${url.pathname}${url.search}`;
        if (current === next && !url.hash) return;
        start();
      } catch {
        // Ignore malformed hrefs; navigation will surface its own error.
      }
    };
    window.addEventListener('rankviz:navigation-start', onCustom);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('rankviz:navigation-start', onCustom);
      document.removeEventListener('click', onClick, true);
      if (safetyTimer.current) window.clearTimeout(safetyTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    setFinishing(true);
    const timer = window.setTimeout(() => {
      setActive(false);
      setFinishing(false);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [pathname, searchParams?.toString()]);

  if (!active && !finishing) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px] overflow-hidden" aria-hidden="true">
      <div className={`h-full bg-[var(--brand)] shadow-[0_0_10px_var(--brand)] transition-all ${finishing ? 'w-full duration-150 opacity-0' : 'w-3/4 duration-[1400ms] opacity-100'}`} />
    </div>
  );
}
