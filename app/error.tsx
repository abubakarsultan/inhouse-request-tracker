'use client';

export default function ErrorState({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-2xl rounded-2xl border border-[#f4b7b2] bg-[var(--card)] p-6">
      <h1 className="text-xl font-bold text-[#c5221f]">This view could not be loaded</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">{error.message || 'An unexpected error occurred.'}</p>
      <button type="button" onClick={reset} className="mt-4 rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand-dark)]">Try again</button>
    </div>
  );
}
