'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveProjectCategory, deactivateProjectCategory } from '@/services/projects';
import { Button } from '@/components/ui/button';

type Category = { id: string; name: string; slug: string; sheet_mode: 'team_sheet_tab' | 'own_sheet'; sort_order: number; active: boolean };

export default function ProjectCategoryManager({ categories }: { categories: Category[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'team_sheet_tab' | 'own_sheet'>('team_sheet_tab');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function add() {
    setBusy(true); setError('');
    try { await saveProjectCategory({ name, sheet_mode: mode, sort_order: categories.length * 10 }); setName(''); setOpen(false); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save category.'); }
    finally { setBusy(false); }
  }
  async function edit(category: Category) {
    const nextName = prompt('Category name', category.name);
    if (nextName === null) return;
    const nextMode = prompt('Sheet mode: enter team_sheet_tab or own_sheet', category.sheet_mode);
    if (nextMode !== 'team_sheet_tab' && nextMode !== 'own_sheet') { setError('Enter team_sheet_tab or own_sheet.'); return; }
    setError('');
    try { await saveProjectCategory({ id: category.id, name: nextName, sheet_mode: nextMode, sort_order: category.sort_order, active: category.active }); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not update category.'); }
  }
  async function reorder(category: Category, delta: number) {
    setError('');
    try { await saveProjectCategory({ id: category.id, name: category.name, sheet_mode: category.sheet_mode, sort_order: category.sort_order + delta, active: category.active }); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not reorder category.'); }
  }
  async function deactivate(category: Category) {
    if (!confirm(`Deactivate category “${category.name}”? Projects must be moved first.`)) return;
    setError('');
    try { await deactivateProjectCategory(category.id); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not deactivate category.'); }
  }
  return <div className="mb-5 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold">Project categories</h2><p className="text-xs text-[var(--muted)]">Choose whether projects use a tab in the team sheet or their own sheet.</p></div><Button type="button" onClick={() => setOpen(!open)}>{open ? 'Cancel' : 'Add category'}</Button></div>
    {open && <div className="mt-3 flex flex-wrap gap-2"><input value={name} onChange={e => setName(e.target.value)} placeholder="Category name" className="h-10 min-w-40 flex-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm"/><select value={mode} onChange={e => setMode(e.target.value as typeof mode)} className="h-10 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm"><option value="team_sheet_tab">Team sheet tab</option><option value="own_sheet">Own Google Sheet</option></select><Button type="button" disabled={busy || !name.trim()} onClick={add}>{busy ? 'Saving…' : 'Save'}</Button></div>}
    <p className="mt-2 text-xs text-[var(--muted)]">The four standard categories are protected. Custom categories can be used in Add Project. Move projects before deactivating a category.</p><div className="mt-3 flex flex-wrap gap-2">{categories.map(c => <div key={c.id} className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"><span className="font-medium">{c.name}</span><span className="text-xs text-[var(--muted)]">{c.sheet_mode === 'own_sheet' ? 'Own sheet' : 'Team tab'}</span>{!['inhouse','client','onpage','others'].includes(c.slug) && <button type="button" onClick={() => edit(c)} className="text-xs text-[var(--brand)]">Edit</button>}<button type="button" onClick={() => reorder(c, -10)} className="text-xs text-[var(--muted)]">↑</button><button type="button" onClick={() => reorder(c, 10)} className="text-xs text-[var(--muted)]">↓</button>{c.active && !['inhouse','client','onpage','others'].includes(c.slug) ? <button type="button" onClick={() => deactivate(c)} className="text-xs text-red-600">Deactivate</button> : !c.active && <button type="button" onClick={async () => { try { await saveProjectCategory({ id: c.id, name: c.name, sheet_mode: c.sheet_mode, sort_order: c.sort_order, active: true }); router.refresh(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not activate category.'); } }} className="text-xs text-green-700">Activate</button>}</div>)}</div>
    {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
  </div>;
}
