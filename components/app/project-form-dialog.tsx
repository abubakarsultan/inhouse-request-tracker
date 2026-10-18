'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogTrigger, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Pencil, Copy, Check, Trash2, ArrowUp, ArrowDown, ExternalLink } from 'lucide-react';
import { listProjectSheetTabs, testProjectSheetConnection, inspectSharedProjectTab } from '@/services/projects';
import { DEFAULT_COLUMN_MAPPING, NEW_SHEET_COLUMN_MAPPING, CLIENT_LIVE_LINK_COLUMN_MAPPING, CLIENT_LIVE_LINK_WITH_METRICS_MAPPING, PROJECT_CATEGORIES, SHEET_DATA_FIELDS, normalizeColumnMapping, reindexColumns, previewMappedRow, type ColumnMapping } from '@/lib/project-sheet';
import { buildGoogleSheetUrl, parseGoogleSheetUrl } from '@/lib/google-sheet-url';
import type { ProjectInput } from '@/lib/validators';

type Project = Omit<ProjectInput, 'sheet_url'> & {
  id: string; google_sheet_id?: string | null; google_sheet_gid?: number | null;
  sheet_name?: string | null; guest_post_tab_name?: string | null;
};
type Tab = { title: string; gid: number };
const inputClass = 'mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm';

export default function ProjectFormDialog({ project, serviceAccountEmail }: { project?: Project; serviceAccountEmail: string | null }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [name, setName] = useState(project?.name || '');
  const [outreach, setOutreach] = useState(project?.outreach_project_name || '');
  const [category, setCategory] = useState<ProjectInput['category']>(project?.category || 'Inhouse');
  const [source, setSource] = useState<'guest_post_anchor' | 'custom_sheet'>(project?.sheet_source || 'guest_post_anchor');
  const [newSheet, setNewSheet] = useState(false);
  const [newTab, setNewTab] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [tabName, setTabName] = useState(project?.guest_post_tab_name || '');
  const [sheetUrl, setSheetUrl] = useState(project?.google_sheet_id ? buildGoogleSheetUrl(project.google_sheet_id, project.google_sheet_gid) : '');
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [loadedUrl, setLoadedUrl] = useState('');
  const [sheetTitle, setSheetTitle] = useState(project?.sheet_name || '');
  const [columns, setColumns] = useState<ColumnMapping[]>(() => normalizeColumnMapping(project?.column_mapping || (project?.sheet_source === 'guest_post_anchor' ? DEFAULT_COLUMN_MAPPING : NEW_SHEET_COLUMN_MAPPING)));
  const [sync, setSync] = useState(project?.sync_enabled ?? true);
  const [includeMetrics, setIncludeMetrics] = useState(() => normalizeColumnMapping(project?.column_mapping || []).some((item) => ['dr','traffic'].includes(item.field)));
  function applyClientPreset(withMetrics: boolean) { setIncludeMetrics(withMetrics); setColumns(reindexColumns((withMetrics ? CLIENT_LIVE_LINK_WITH_METRICS_MAPPING : CLIENT_LIVE_LINK_COLUMN_MAPPING).map(item => ({...item})))); setNotice(withMetrics ? 'Client Live Link preset applied with DR and Traffic.' : 'Client Live Link 4-column preset applied.'); }
  const router = useRouter();
  const isEdit = Boolean(project);
  const lockedLegacyMapping = newTab || (isEdit && project?.sheet_source === 'guest_post_anchor' && source === 'guest_post_anchor');

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('inhouse-project-draft-before-google-connect');
      if (!raw) return;
      const draft = JSON.parse(raw);
      sessionStorage.removeItem('inhouse-project-draft-before-google-connect');
      setName(draft.name || ''); setOutreach(draft.outreach || ''); setCategory(draft.category || 'Inhouse');
      setSource(draft.source || 'custom_sheet'); setNewSheet(Boolean(draft.newSheet)); setNewTab(Boolean(draft.newTab)); setNewTitle(draft.newTitle || '');
      setTabName(draft.tabName || ''); setColumns(normalizeColumnMapping(draft.columns || NEW_SHEET_COLUMN_MAPPING)); setSync(draft.sync ?? true);
      setStep(2); setOpen(true); setNotice('Your project draft was restored after connecting Google Drive. Continue setup.');
    } catch { sessionStorage.removeItem('inhouse-project-draft-before-google-connect'); }
  }, []);

  function connectGoogleDrive() {
    sessionStorage.setItem('inhouse-project-draft-before-google-connect', JSON.stringify({ name, outreach, category, source, newSheet, newTab, newTitle, tabName, columns, sync }));
    window.location.assign('/api/google/connect?return=%2Fprojects');
  }

  function changeSource(next: 'guest_post_anchor' | 'custom_sheet', create = false) {
    setSource(next); setNewSheet(create); setNewTab(false); setTabs([]); setLoadedUrl(''); setNotice(null); setError(null);
    if (!isEdit) setColumns(normalizeColumnMapping(next === 'guest_post_anchor' ? DEFAULT_COLUMN_MAPPING : NEW_SHEET_COLUMN_MAPPING));
  }
  async function loadSheet() {
    setPending(true); setError(null); setNotice(null);
    try {
      if (newSheet) {
        if (!newTitle.trim() || !tabName.trim()) throw new Error('Enter the new Sheet title and tab name.');
        setNotice('The new spreadsheet will be created in your connected Google Drive. The server service account is added as Editor for sync.');
        return true;
      }
      const data = await listProjectSheetTabs(source === 'guest_post_anchor' ? undefined : sheetUrl, source === 'guest_post_anchor');
      if (data.tabs.length === 0) throw new Error('This spreadsheet has no tabs.');
      setSheetTitle(data.title); setTabs(data.tabs);
      const selectedGid = source === 'custom_sheet' ? parseGoogleSheetUrl(sheetUrl).gid : null;
      const match = source === 'custom_sheet' ? data.tabs.find((tab) => tab.gid === selectedGid) : data.tabs.find((tab) => tab.title === tabName);
      const chosen = match || data.tabs[0];
      setTabName(chosen.title);
      setLoadedUrl(source === 'guest_post_anchor' ? 'shared' : sheetUrl);
      setNotice(`Connected to ${data.title}. ${data.tabs.length} tab(s) available. Choose the correct tab.`);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not inspect the spreadsheet.'); return false;
    } finally { setPending(false); }
  }
  async function detectHeaders(): Promise<boolean> {
    setPending(true); setError(null);
    try {
      const target = source === 'custom_sheet' ? sheetUrl : '';
      // Shared Sheet ID is deliberately not exposed as NEXT_PUBLIC env. Its headers
      // are handled by the dedicated authenticated server action below.
      const data = source === 'guest_post_anchor'
        ? await inspectSharedProjectTab(tabName)
        : await testProjectSheetConnection(target);
      setColumns(normalizeColumnMapping(data.column_mapping));
      setNotice('Sheet headings loaded. Review the Data dropdown for each column before continuing.');
      return true;
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not read Sheet headings.'); return false; }
    finally { setPending(false); }
  }
  function setSelectedTab(title: string) {
    setTabName(title);
    if (source === 'custom_sheet' && !newSheet) {
      const gid = tabs.find((item) => item.title === title)?.gid;
      if (gid !== undefined) {
        try {
          const url = new URL(sheetUrl);
          url.hash = `gid=${gid}`;
          setSheetUrl(url.toString()); setLoadedUrl(url.toString());
        } catch { /* URL checked by server */ }
      }
    }
  }
  function editColumn(index: number, patch: Partial<ColumnMapping>) {
    if (lockedLegacyMapping) return;
    setColumns((items) => items.map((item, i) => i === index ? { ...item, ...patch } : item));
  }
  function moveColumn(index: number, delta: number) {
    if (lockedLegacyMapping) return;
    setColumns((items) => {
      const nextIndex = index + delta;
      if (nextIndex < 0 || nextIndex >= items.length) return items;
      const next = [...items]; [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return reindexColumns(next);
    });
  }
  function validateMapping(): boolean {
    if (columns.length === 0 || columns.some((col) => !col.heading.trim())) { setError('Every column needs a heading.'); return false; }
    if (sync && (!columns.some((col) => col.field === 'approved_site') || !columns.some((col) => col.field === 'anchor') || !columns.some((col) => col.field === 'status'))) {
      setError('For two-way status sync, map Approved Site, Anchor and Status to three different columns.'); return false;
    }
    const tracked = columns.filter((col) => ['approved_site', 'anchor', 'status'].includes(col.field)).map((col) => col.field);
    if (new Set(tracked).size !== tracked.length) { setError('Approved Site, Anchor and Status must each appear only once.'); return false; }
    return true;
  }
  async function next() {
    setError(null);
    if (step === 1 && !name.trim()) { setError('Project name is required.'); return; }
    if (step === 2) {
      if (!newSheet && !newTab && (tabs.length === 0 || loadedUrl !== (source === 'guest_post_anchor' ? 'shared' : sheetUrl))) {
        await loadSheet();
        return; // Choose the correct tab after the spreadsheet's tabs have loaded.
      }
      if (newTab && !tabName.trim()) setTabName(name.trim());
      if (!tabName.trim() && !newTab) { setError('Select a project tab.'); return; }
      if (!newSheet && !newTab && !tabs.some((item) => item.title === tabName)) { setError('Select an available tab.'); return; }
      // On first connection, automatically suggest mappings from real Sheet headings.
      if (!newSheet && !newTab && !isEdit && !(await detectHeaders())) return;
    }
    if (step === 3 && !validateMapping()) return;
    setStep(Math.min(step + 1, 4));
  }
  async function copyEmail() {
    if (!serviceAccountEmail) return;
    try { await navigator.clipboard.writeText(serviceAccountEmail); setCopied(true); }
    catch { setError('Copy failed. Select the email and copy manually.'); }
  }
  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step !== 4) { await next(); return; }
    if (!validateMapping()) return;
    setPending(true); setError(null);
    const input: ProjectInput = {
      name: name.trim(), outreach_project_name: outreach.trim() || null, category,
      sheet_source: source, sheet_url: source === 'custom_sheet' && !newSheet ? sheetUrl : null,
      guest_post_tab_name: tabName, column_mapping: reindexColumns(columns), sync_enabled: sync,
      create_new_sheet: newSheet, new_sheet_title: newSheet ? newTitle : null,
      create_new_tab: newTab, new_tab_name: newTab ? (tabName.trim() || name.trim()) : null,
    };
    try {
      const response = await fetch('/api/projects/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify({ mode: isEdit ? 'update' : 'create', projectId: project?.id, input }),
      });
      // A proxy or expired session can return HTML instead of JSON. Show a
      // useful message rather than exposing React's masked Server Action error.
      const result = await response.json().catch(() => null) as
        | { ok: boolean; message?: string; reference?: string }
        | null;
      if (!response.ok || !result?.ok) {
        const reason = result?.message || (response.status === 401 || response.status === 403
          ? 'Your session or project permissions may have expired. Reload and sign in again.'
          : `Project save failed (HTTP ${response.status}). Check Vercel Runtime Logs.`);
        setError(`${reason}${result?.reference ? ` Reference: ${result.reference}` : ''}`);
        return;
      }
      setOpen(false);
      router.refresh();
    } catch (caught) {
      console.error('[project-form] Project save request failed:', caught);
      setError('Network error while saving this project. Check your connection, then retry once.');
    }
    finally { setPending(false); }
  }
  const sample = previewMappedRow(columns);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!pending) { setOpen(nextOpen); setError(null); setCopied(false); if (!nextOpen) setStep(1); } }}>
      <DialogTrigger asChild>{isEdit ? <button className="rounded-md p-1.5 text-[var(--muted)] hover:bg-[var(--canvas)]" title="Edit project" aria-label={`Edit ${project?.name}`}><Pencil size={16}/></button> : <Button><Plus size={16}/> Add Project</Button>}</DialogTrigger>
      <DialogContent title={isEdit ? 'Edit project setup' : 'Add project'} className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <form onSubmit={onSubmit} className="space-y-5">
          <div className="grid grid-cols-4 gap-2 text-xs font-semibold">{['Basic info','Sheet source','Columns','Preview & save'].map((label, index) => <div key={label} className={`rounded-lg px-2 py-2 text-center ${step >= index + 1 ? 'bg-[#e8f0fe] text-[#174ea6]' : 'bg-[var(--canvas)] text-[var(--muted)]'}`}>{index+1}. {label}</div>)}</div>
          {step === 1 && <div className="space-y-4">
            <div><Label>Project name</Label><Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Get Pro Links" /></div>
            <div><Label>Outreach OS project name</Label><Input value={outreach} onChange={(e) => setOutreach(e.target.value)} placeholder="Defaults to project name" /></div>
            <div><Label>Project category</Label><div className="mt-2 grid gap-2 sm:grid-cols-4">{PROJECT_CATEGORIES.map((item) => <label key={item} className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm ${category === item ? 'border-[#1a73e8] bg-[#e8f0fe] text-[#174ea6]' : 'border-[var(--border)]'}`}><input type="radio" checked={category === item} onChange={() => { setCategory(item); if (item !== 'Inhouse' && source === 'guest_post_anchor') changeSource('custom_sheet'); }} />{item}</label>)}</div></div>
          </div>}
          {step === 2 && <div className="space-y-4">
            <h3 className="font-semibold">Select Google Sheet source</h3>
            <div className="grid gap-2 sm:grid-cols-3">
              {category === 'Inhouse' && <label className="rounded-lg border p-3 text-sm"><input type="radio" name="sourceChoice" checked={source === 'guest_post_anchor' && !newTab} onChange={() => { changeSource('guest_post_anchor'); setNewTab(false); }}/> <strong>Use existing tab</strong><p className="mt-1 text-xs text-[var(--muted)]">Preserve the shared team workbook</p></label>}
              {category === 'Inhouse' && !isEdit && <label className="rounded-lg border p-3 text-sm"><input type="radio" name="sourceChoice" checked={newTab} onChange={() => { setSource('guest_post_anchor'); setNewSheet(false); setNewTab(true); setTabName(name.trim()); setTabs([]); setLoadedUrl(''); setColumns(normalizeColumnMapping(DEFAULT_COLUMN_MAPPING)); }}/> <strong>Create new tab in Guest Post Anchor</strong><p className="mt-1 text-xs text-[var(--muted)]">Adds a tab to the existing workbook</p></label>}
              <label className="rounded-lg border p-3 text-sm"><input type="radio" name="sourceChoice" checked={source === 'custom_sheet' && !newSheet} onChange={() => changeSource('custom_sheet')}/> <strong>Connect Google Sheet URL</strong><p className="mt-1 text-xs text-[var(--muted)]">Use an existing spreadsheet</p></label>
              {!isEdit && <label className="rounded-lg border p-3 text-sm"><input type="radio" name="sourceChoice" checked={source === 'custom_sheet' && newSheet} onChange={() => changeSource('custom_sheet', true)}/> <strong>Create New Google Sheet</strong><p className="mt-1 text-xs text-[var(--muted)]">Create on Save (requires Google permission)</p></label>}
            </div>
            {newTab ? <div className="space-y-3"><div><Label>Project tab name</Label><Input value={tabName} onChange={e=>setTabName(e.target.value)} placeholder={name || 'Project name'} maxLength={100}/><p className="mt-1 text-xs text-[var(--muted)]">Defaults to project name. Avoid [ ] * ? : / and backslash.</p></div><p className="text-xs text-[var(--muted)]">The workbook-level Apps Script should already cover new tabs. The new tab receives the mapped header row and Status dropdown.</p></div> : newSheet ? <div className="space-y-3"><div className="grid gap-3 sm:grid-cols-2"><div><Label>New Sheet title</Label><Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Client Project Sheet" /></div><div><Label>New tab name</Label><Input value={tabName} onChange={(e) => setTabName(e.target.value)} placeholder="Requests" /></div></div><button type="button" onClick={connectGoogleDrive} className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-semibold">Connect / reconnect your Google Drive (save draft)</button></div>
              : <><div>{source === 'custom_sheet' && <><Label>Google Sheet URL</Label><Input value={sheetUrl} onChange={(e) => { setSheetUrl(e.target.value); setTabs([]); setLoadedUrl(''); }} placeholder="https://docs.google.com/spreadsheets/d/.../edit#gid=0" /></>}</div>
                <Button type="button" variant="outline" disabled={pending} onClick={loadSheet}>{pending ? 'Checking access…' : source === 'guest_post_anchor' ? 'Load Guest Post Anchor tabs' : 'Test connection & load tabs'}</Button>
                {tabs.length > 0 && <div><Label>Select project tab</Label><select disabled={lockedLegacyMapping} className={inputClass} value={tabName} onChange={(e) => setSelectedTab(e.target.value)}>{tabs.map((tab) => <option key={tab.gid} value={tab.title}>{tab.title}</option>)}</select><p className="mt-1 text-xs text-[var(--muted)]">{sheetTitle} · Tab ID is handled automatically.</p></div>}</>}
            {!newSheet && !newTab && <div className="rounded-lg border border-[#b8d7f8] p-3"><p className="font-semibold text-sm">Share existing sheet with the sync service account</p><p className="mb-2 text-xs text-[var(--muted)]">For an existing spreadsheet, use Google Sheets Share → Editor. New sheets are shared automatically after creation.</p>{serviceAccountEmail ? <div className="flex gap-2"><Input readOnly value={serviceAccountEmail}/><Button type="button" variant="outline" onClick={copyEmail}><Copy size={14}/>{copied ? 'Copied' : 'Copy'}</Button></div> : <p className="text-xs text-red-600">Google service account has not been configured in Vercel.</p>}</div>}
          </div>}
          {step === 3 && <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold">Sheet Structure / Column Mapping</h3><p className="text-xs text-[var(--muted)]">Choose the heading and app data for every column. Reorder with arrows.</p></div><div className="flex gap-2">{!newSheet && <Button type="button" variant="outline" onClick={detectHeaders} disabled={pending || lockedLegacyMapping}>{pending ? 'Reading…' : 'Detect headings'}</Button>}<Button type="button" variant="outline" disabled={lockedLegacyMapping || columns.length >= 26} onClick={() => setColumns((items) => [...items, { column: String.fromCharCode(65+items.length), heading: `Column ${String.fromCharCode(65+items.length)}`, field: 'blank' }])}><Plus size={14}/> Add Column</Button></div></div>
            {(category === 'Client' || category === 'On Page') && <div className="rounded-lg border border-[var(--border)] p-3"><p className="mb-2 text-sm font-semibold">Client / Onpage preset</p><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => applyClientPreset(false)}>Client Live Link (4 columns)</Button><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={includeMetrics} onChange={e => { setIncludeMetrics(e.target.checked); applyClientPreset(e.target.checked); }}/> Include DR &amp; Traffic</label></div><p className="mt-2 text-xs text-[var(--muted)]">Live Link maps to placement page (fallback: approved site). Manual/unmapped columns are preserved.</p></div>}
            <div className="max-h-[390px] space-y-2 overflow-y-auto pr-1">{columns.map((column, index) => <div key={index} className="grid grid-cols-[35px_minmax(0,1fr)] items-center gap-2 rounded-lg border border-[var(--border)] p-2 sm:grid-cols-[40px_1fr_1fr_90px]">
              <span className="text-center text-sm font-bold">{column.column}</span>
              <div><Label>Heading</Label><Input disabled={lockedLegacyMapping} value={column.heading} onChange={(e) => editColumn(index, { heading: e.target.value })}/></div>
              <div><Label>What goes here?</Label><select disabled={lockedLegacyMapping} className={inputClass} value={column.field} onChange={(e) => editColumn(index, { field: e.target.value as ColumnMapping['field'] })}>{SHEET_DATA_FIELDS.map((field) => <option value={field.value} key={field.value}>{field.label}</option>)}</select>{column.field === 'static' && <Input disabled={lockedLegacyMapping} className="mt-2" value={column.static_value || ''} onChange={(e) => editColumn(index, { static_value: e.target.value })} placeholder="e.g. Guest Post" />}</div>
              <div className="col-start-2 flex items-center gap-1 sm:col-start-4"><button aria-label="Move up" title="Move up" type="button" disabled={lockedLegacyMapping || index === 0} onClick={() => moveColumn(index,-1)} className="rounded-md p-1.5 disabled:opacity-30"><ArrowUp size={15}/></button><button aria-label="Move down" title="Move down" type="button" disabled={lockedLegacyMapping || index===columns.length-1} onClick={() => moveColumn(index,1)} className="rounded-md p-1.5 disabled:opacity-30"><ArrowDown size={15}/></button><button type="button" title="Remove column" disabled={lockedLegacyMapping || columns.length <= 1} onClick={() => setColumns((items) => reindexColumns(items.filter((_,i) => i!==index)))} className="rounded-md p-1.5 disabled:opacity-30"><Trash2 size={15}/></button></div>
            </div>)}</div>
            {isEdit && source === 'custom_sheet' && <p className="rounded-lg bg-[#fef7e0] p-3 text-xs text-[#785000]">Editing mapping changes future Sheet writes and status reading. The app does not move or rewrite existing Google Sheet rows. Back up and update old Sheet columns manually before changing this mapping.</p>}
            {lockedLegacyMapping && <p className="rounded-lg bg-[#e8f0fe] p-3 text-xs text-[#174ea6]">Existing shared Guest Post Anchor columns are locked for safety. Changing the selected tab is supported, but legacy A:H mappings and historical rows are preserved.</p>}
            {source === 'guest_post_anchor' && <p className="rounded-lg bg-[#fef7e0] p-3 text-xs text-[#785000]">Existing Guest Post Anchor A:H mappings are preserved. Changing them may change future writes; existing Sheet cells are not migrated.</p>}
          </div>}
          {step === 4 && <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">{[['Category',category],['Sheet',newSheet ? newTitle : sheetTitle || 'Guest Post Anchor'],['Tab',tabName]].map(([label,value]) => <div key={label} className="rounded-lg bg-[var(--canvas)] p-3"><p className="text-xs text-[var(--muted)]">{label}</p><p className="truncate font-medium">{value}</p></div>)}</div>
            <div><h3 className="mb-2 font-semibold">Sheet Preview <span className="text-xs font-normal text-[var(--muted)]">(example values, no writes)</span></h3><div className="overflow-x-auto rounded-lg border border-[var(--border)]"><table className="min-w-max text-sm"><thead><tr>{sample.headings.map((heading,index) => <th key={index} className="border-r border-[var(--border)] bg-[var(--canvas)] p-3 text-left">{heading}</th>)}</tr></thead><tbody><tr>{sample.values.map((value,index) => <td key={index} className="border-r border-[var(--border)] p-3 text-[var(--muted)]">{String(value || '—')}</td>)}</tr></tbody></table></div></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sync} onChange={(e) => setSync(e.target.checked)}/> Enable Google Sheet sync</label>
            {source === 'guest_post_anchor' ? <p className="text-xs text-[var(--muted)]">The existing workbook-level Apps Script is expected to handle Guest Post Anchor tabs, including this new tab; do not install duplicate per-project triggers on the same workbook.</p> : <p className="text-xs text-[var(--muted)]">After saving, copy the project-specific Apps Script from Sheet Details and install its edit trigger once in Google Sheets.</p>}
            {!newSheet && sheetUrl && <a href={sheetUrl} rel="noreferrer" target="_blank" className="inline-flex items-center gap-1 text-sm text-[var(--brand)]">Open connected Sheet <ExternalLink size={13}/></a>}
          </div>}
          {notice && <p role="status" className="rounded-lg bg-[#e6f4ea] p-3 text-xs text-[#188038]">{notice}</p>}
          {error && <p role="alert" className="rounded-lg bg-[#fce8e6] p-3 text-sm text-[#c5221f]">{error}</p>}
          <div className="flex items-center justify-between border-t border-[var(--border)] pt-4"><Button type="button" variant="outline" disabled={pending || step === 1} onClick={() => {setStep((s)=>s-1);setError(null);}}>Back</Button><div className="flex items-center gap-3"><span className="text-xs text-[var(--muted)]">Step {step} of 4</span><Button type="submit" disabled={pending}>{pending ? 'Working…' : step === 4 ? isEdit ? 'Save Changes' : 'Create Project' : 'Continue'}</Button></div></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
