'use client';

import { useEffect } from 'react';

export default function ErrorState({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // A digest identifies the server error in production logs without
    // exposing internal stack traces or database details to users.
    console.error('[app] Route rendering failed', error);
  }, [error]);

  return (
    <div role="alert" className="mx-auto max-w-2xl rounded-2xl border border-[#f4b7b2] bg-[var(--card)] p-6">
      <h1 className="text-xl font-bold text-[#c5221f]">This view could not be loaded</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        The page could not finish loading. Try again, or contact an administrator if this keeps happening.
      </p>
      {process.env.NODE_ENV !== 'production' && <p className="mt-2 text-sm text-[#c5221f]">{error.message}</p>}
      {error.digest && <p className="mt-2 text-xs text-[var(--muted)]">Reference: <code>{error.digest}</code></p>}
      <button type="button" onClick={reset} className="mt-4 rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand-dark)]">Try again</button>
    </div>
  );
}
