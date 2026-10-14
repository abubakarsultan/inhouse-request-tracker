'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check, Loader2, Plus, RefreshCw } from 'lucide-react';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { createProject, getProjectSheetTabs, updateProject } from '@/services/projects';
import type { ProjectInput } from '@/lib/validators';

type Category = { id: string; name: string; slug: string; sheet_mode: 'team_sheet_tab' | 'own_sheet'; active: boolean };
type Project = ProjectInput & {
  id: string;
  category_id?: string | null;
  google_sheet_id?: string | null;
  sheet_share_emails?: string[] | null;
  sheet_column_config?: Record<string, string> | null;
  sheet_source?: 'guest_post_anchor' | 'own_sheet' | 'none' | null;
  sheet_tab_name?: string | null;
  guest_post_tab_name?: string | null;
};

type Props = { categories: Category[]; project?: Project; trigger?: ReactNode; onSaved?: () => void };

const FIXED_SLUGS = new Set(['inhouse', 'client', 'onpage', 'others']);

export default function ProjectFormDialog({ categories, project, trigger, onSaved }: Props) {
  const isEdit = Boolean(project);
  const defaultCategory = categories.find((item) => item.slug === 'inhouse') ?? categories[0];
  const initialCategory = categories.find((item) => item.id === project?.category_id) ?? defaultCategory;
  const initialSource: 'guest_post_anchor' | 'own_sheet' | 'none' = project?.sheet_source
    ?? (project?.google_sheet_id ? 'own_sheet' : project?.guest_post_tab_name ? 'guest_post_anchor' : initialCategory?.slug === 'inhouse' ? 'guest_post_anchor' : 'none');
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState(project?.category_id ?? defaultCategory?.id ?? '');
  const [sheetSource, setSheetSource] = useState<'guest_post_anchor' | 'own_sheet' | 'none'>(initialSource);
  const [connectionMode, setConnectionMode] = useState<'existing' | 'create' | 'none'>(project?.google_sheet_id ? 'existing' : 'none');
  const [tabs, setTabs] = useState<string[]>([]);
  const [loadingTabs, setLoadingTabs] = useState(false);
  const [tabError, setTabError] = useState<string | null>(null);

  const category = useMemo(() => categories.find((item) => item.id === selectedCategoryId) ?? defaultCategory, [categories, selectedCategoryId, defaultCategory]);
  const isInhouse = category?.slug === 'inhouse';

  useEffect(() => {
    if (!open || !isInhouse || sheetSource !== 'guest_post_anchor' || tabs.length) return;
    void loadTabs();
  }, [open, isInhouse, sheetSource, tabs.length]);

  function loadTabs() {
    setLoadingTabs(true);
    setTabError(null);
    getProjectSheetTabs()
      .then((values) => setTabs(values))
      .catch((caught) => setTabError(caught instanceof Error ? caught.message : 'Could not load Guest Post Anchor tabs.'))
      .finally(() => setLoadingTabs(false));
  }

  function handleCategoryChange(value: string) {
    setSelectedCategoryId(value);
    const next = categories.find((item) => item.id === value);
    if (next?.slug === 'inhouse') {
      setSheetSource('guest_post_anchor');
      setConnectionMode('none');
    } else if (sheetSource === 'guest_post_anchor') {
      setSheetSource('own_sheet');
      setConnectionMode(project?.google_sheet_id ? 'existing' : 'none');
    }
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const shareEmails = String(form.get('sheet_share_emails') ?? '')
      .split(/[\n,]+/)
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);

    const input: ProjectInput = {
      name: String(form.get('name') ?? '').trim(),
      outreach_project_name: String(form.get('outreach_project_name') ?? '').trim() || null,
      category_id: String(form.get('category_id') ?? '') || undefined,
      sheet_source: sheetSource,
      sync_enabled: form.get('sync_enabled') === 'on',
      guest_post_tab_name: sheetSource === 'guest_post_anchor' ? String(form.get('guest_post_tab_name') ?? '').trim() || null : null,
      sheet_tab_name: sheetSource === 'guest_post_anchor' ? String(form.get('guest_post_tab_name') ?? '').trim() || null : String(form.get('sheet_tab_name') ?? '').trim() || null,
      google_sheet_id: sheetSource === 'own_sheet' && connectionMode === 'existing' ? String(form.get('google_sheet_id') ?? '').trim() || null : null,
      sheet_url: sheetSource === 'own_sheet' && connectionMode === 'existing' ? String(form.get('sheet_url') ?? '').trim() || null : null,
      sheet_connection_mode: sheetSource === 'own_sheet' ? connectionMode : 'none',
      sheet_share_emails: shareEmails,
      sheet_column_config: project?.sheet_column_config ?? {},
      include_dr_traffic: form.get('include_dr_traffic') === 'on',
    };

    try {
      if (isEdit) await updateProject(project!.id, input);
      else await createProject(input);
      setOpen(false);
      onSaved?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save project.');
    } finally {
      setPending(false);
    }
  }

  const fallbackTrigger = trigger ?? <Button><Plus size={16} /> Add Project</Button>;

  return (
    <Dialog open={open} onOpenChange={(next) => {
      setOpen(next);
      if (next) {
        setError(null);
        setTabs([]);
        setTabError(null);
        if (!isEdit) {
          setSelectedCategoryId(defaultCategory?.id ?? '');
          setSheetSource('guest_post_anchor');
          setConnectionMode('none');
        }
      }
    }}>
      <DialogTrigger asChild>{fallbackTrigger}</DialogTrigger>
      <DialogContent title={isEdit ? 'Edit Project' : 'Add Project'} className="max-w-2xl">
        <form onSubmit={onSubmit} className="space-y-5">
          {error && <div className="rounded-xl border border-[#f4b7b2] bg-[#fce8e6] p-3 text-sm text-[#c5221f]">{error}</div>}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="project_name">Project Name *</Label>
              <Input id="project_name" name="name" required defaultValue={project?.name ?? ''} placeholder="Project name" />
            </div>
            <div>
              <Label htmlFor="outreach_project_name">Outreach OS Client Name</Label>
              <Input id="outreach_project_name" name="outreach_project_name" defaultValue={project?.outreach_project_name ?? project?.name ?? ''} placeholder="Exact Client value for Outreach OS" />
            </div>
          </div>

          <div>
            <Label htmlFor="category_id">Category *</Label>
            <Select id="category_id" name="category_id" required value={selectedCategoryId} onChange={(event) => handleCategoryChange(event.target.value)}>
              {categories.filter((item) => FIXED_SLUGS.has(item.slug)).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </Select>
            <p className="mt-1 text-xs text-[var(--muted)]">Projects are grouped into four fixed categories: Inhouse, Client, On Page, and Others.</p>
          </div>

          <section className="rounded-2xl border border-[var(--border)] bg-[var(--canvas)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div><p className="font-semibold text-[var(--text)]">Sheet connection</p><p className="mt-1 text-xs text-[var(--muted)]">Choose where this project's request rows should be mirrored.</p></div>
              <label className="flex items-center gap-2 text-xs font-medium text-[var(--muted)]"><input name="sync_enabled" type="checkbox" defaultChecked={project ? project.sync_enabled : true} disabled={sheetSource === 'none'} /> Sync enabled</label>
            </div>

            <div className={`mt-4 grid gap-3 ${isInhouse ? 'sm:grid-cols-4' : 'sm:grid-cols-2'}`}>
              {isInhouse && (
                <button type="button" onClick={() => setSheetSource('guest_post_anchor')} className={`rounded-xl border p-3 text-left transition ${sheetSource === 'guest_post_anchor' ? 'border-[var(--brand)] bg-[var(--card)] ring-2 ring-[var(--brand-soft)]' : 'border-[var(--border)] bg-[var(--card)]'}`}>
                  <span className="flex items-center justify-between"><span className="font-semibold">Guest Post Anchor</span>{sheetSource === 'guest_post_anchor' && <Check size={16} className="text-[var(--brand)]" />}</span>
                  <span className="mt-1 block text-xs text-[var(--muted)]">Use the existing central team sheet.</span>
                </button>
              )}
              <button type="button" onClick={() => { setSheetSource('own_sheet'); setConnectionMode('existing'); }} className={`rounded-xl border p-3 text-left transition ${sheetSource === 'own_sheet' && connectionMode === 'existing' ? 'border-[var(--brand)] bg-[var(--card)] ring-2 ring-[var(--brand-soft)]' : 'border-[var(--border)] bg-[var(--card)]'}`}>
                <span className="flex items-center justify-between"><span className="font-semibold">Existing Google Sheet</span>{sheetSource === 'own_sheet' && connectionMode === 'existing' && <Check size={16} className="text-[var(--brand)]" />}</span>
                <span className="mt-1 block text-xs text-[var(--muted)]">Connect an existing project sheet.</span>
              </button>
              <button type="button" onClick={() => { setSheetSource('own_sheet'); setConnectionMode('create'); }} className={`rounded-xl border p-3 text-left transition ${sheetSource === 'own_sheet' && connectionMode === 'create' ? 'border-[var(--brand)] bg-[var(--card)] ring-2 ring-[var(--brand-soft)]' : 'border-[var(--border)] bg-[var(--card)]'}`}>
                <span className="flex items-center justify-between"><span className="font-semibold">Create New Google Sheet</span>{sheetSource === 'own_sheet' && connectionMode === 'create' && <Check size={16} className="text-[var(--brand)]" />}</span>
                <span className="mt-1 block text-xs text-[var(--muted)]">Create and connect a new project sheet.</span>
              </button>
              <button type="button" onClick={() => setSheetSource('none')} className={`rounded-xl border p-3 text-left transition ${sheetSource === 'none' ? 'border-[var(--brand)] bg-[var(--card)] ring-2 ring-[var(--brand-soft)]' : 'border-[var(--border)] bg-[var(--card)]'}`}>
                <span className="flex items-center justify-between"><span className="font-semibold">Tool Only</span>{sheetSource === 'none' && <Check size={16} className="text-[var(--brand)]" />}</span>
                <span className="mt-1 block text-xs text-[var(--muted)]">Keep request data in INHOUSE REQUEST only.</span>
              </button>
            </div>

            {sheetSource === 'guest_post_anchor' && (
              <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <Label htmlFor="guest_post_tab_name">Guest Post Anchor Tab *</Label>
                    <div className="relative">
                      <Input id="guest_post_tab_name" name="guest_post_tab_name" list="guest-post-tabs" defaultValue={project?.guest_post_tab_name ?? project?.sheet_tab_name ?? ''} placeholder="Select or type the project tab name" required />
                      <datalist id="guest-post-tabs">{tabs.map((tab) => <option key={tab} value={tab} />)}</datalist>
                    </div>
                  </div>
                  <Button type="button" variant="secondary" size="sm" onClick={loadTabs} disabled={loadingTabs}><RefreshCw size={14} className={loadingTabs ? 'animate-spin' : ''} /> {loadingTabs ? 'Loading...' : 'Refresh tabs'}</Button>
                </div>
                {tabError && <p className="mt-2 text-xs text-[#c5221f]">{tabError}</p>}
                <p className="mt-2 text-xs text-[var(--muted)]">If the tab does not exist yet, the server can create it using the standard Guest Post Anchor headers.</p>
              </div>
            )}

            {sheetSource === 'own_sheet' && (
              <div className="mt-4 space-y-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
                {connectionMode === 'existing' && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div><Label htmlFor="sheet_url">Google Sheet URL *</Label><Input id="sheet_url" name="sheet_url" defaultValue={project?.google_sheet_id ? `https://docs.google.com/spreadsheets/d/${project.google_sheet_id}/edit` : ''} placeholder="https://docs.google.com/spreadsheets/d/..." required /></div>
                    <div><Label htmlFor="sheet_tab_name">Tab Name *</Label><Input id="sheet_tab_name" name="sheet_tab_name" defaultValue={project?.sheet_tab_name ?? 'Live Link'} placeholder="Live Link" required /></div>
                  </div>
                )}
                {connectionMode === 'create' && <div><Label htmlFor="sheet_tab_name">Initial Tab Name</Label><Input id="sheet_tab_name" name="sheet_tab_name" defaultValue={project?.sheet_tab_name ?? 'Live Link'} placeholder="Live Link" /></div>}
                {connectionMode !== 'none' && (
                  <>
                    <div><Label htmlFor="sheet_share_emails">Share With</Label><textarea id="sheet_share_emails" name="sheet_share_emails" defaultValue={(project?.sheet_share_emails ?? []).join(', ')} className="min-h-20 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 text-sm text-[var(--text)] outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)]" placeholder="email1@rankviz.com, email2@rankviz.com" /></div>
                    <label className="flex items-center gap-2 text-sm text-[var(--muted)]"><input name="include_dr_traffic" type="checkbox" defaultChecked={Boolean(project?.sheet_column_config?.dr || project?.sheet_column_config?.traffic)} /> Include DR and Traffic columns</label>
                  </>
                )}
              </div>
            )}
          </section>

          <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] pt-4">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? <><Loader2 size={15} className="animate-spin" /> Saving...</> : isEdit ? 'Save Changes' : 'Create Project'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
