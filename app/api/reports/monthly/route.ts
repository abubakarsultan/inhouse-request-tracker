import { NextResponse } from 'next/server';
import { getOperationsReport } from '@/services/operations-report';
export const dynamic = 'force-dynamic';
const clean = (value: string | number) => {const s=String(value).replace(/"/g,'""');return `"${/^[=+@\-\t\r]/.test(s)?"'":""}${s}"`;};
export async function GET() {
  try {
    const report=await getOperationsReport();
    const rows=[['Month','Total Created','Currently Live','Currently Rejected'],...report.months.map(r=>[r.month,r.total,r.live,r.rejected])];
    const csv='\uFEFF'+rows.map(row=>row.map(clean).join(',')).join('\r\n')+'\r\n';
    return new NextResponse(csv,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="rankviz-monthly-report.csv"','Cache-Control':'private, no-store'}});
  } catch {return NextResponse.json({error:'Not authorized or report unavailable'},{status:403});}
}
