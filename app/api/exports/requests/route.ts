import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { karachiDateString } from '@/lib/date';
import { buildOutreachCsv, type OutreachCsvRow } from '@/lib/outreach-csv';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function dateBounds(date: string) {
  const start = new Date(`${date}T00:00:00+05:00`);
  if (Number.isNaN(start.getTime()) || karachiDateString(start) !== date) return null;
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get('date') || karachiDateString();
  if (!DATE_RE.test(date)) return NextResponse.json({ ok: false, message: 'Choose a valid date.' }, { status: 400 });
  const bounds = dateBounds(date);
  if (!bounds) return NextResponse.json({ ok: false, message: 'Choose a valid date.' }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('requests')
    .select('sub_project,target_url,anchor,approved_site,placement_page,priority,assign_to,deadline,projects(outreach_project_name,name)')
    .gte('created_at', bounds.start)
    .lt('created_at', bounds.end)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ ok: false, message: `Could not build export: ${error.message}` }, { status: 500 });
  if (!data?.length) return NextResponse.json({ ok: false, message: `No requests were created on ${date} (Asia/Karachi).` }, { status: 404 });

  const rows: OutreachCsvRow[] = data.map((row: any) => ({
    Client: row.projects?.outreach_project_name || '',
    'Sub-Project': row.sub_project || '',
    'Target URL': row.target_url || '',
    Anchor: row.anchor || '',
    'Approved Site (Domain)': row.approved_site || '',
    'Placement Page': row.placement_page || '',
    Priority: row.priority || '',
    'Assign To': row.assign_to || '',
    Deadline: row.deadline || '',
  }));

  const csv = buildOutreachCsv(rows);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="requests_${date}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
