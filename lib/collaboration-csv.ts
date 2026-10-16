import * as XLSX from 'xlsx';
import { COLLAB_HEADERS, COLLAB_SUMMARY_HEADERS, templatePartnerTabName } from '@/lib/collaboration-core';

/** One .xlsx workbook containing exactly three worksheets, importable with one upload. */
export function collaborationWorkbookTemplate(partnerName: string): Buffer {
  const workbook = XLSX.utils.book_new();
  const partnerTab = templatePartnerTabName(partnerName || 'Partner');
  for (const tab of ['Rankviz', partnerTab]) {
    // H is an internal stable Record ID; visible user-facing columns remain A:G.
    const sheet = XLSX.utils.aoa_to_sheet([[...COLLAB_HEADERS, 'Record ID']]);
    sheet['!cols'] = [
      { wch: 15 }, { wch: 30 }, { wch: 54 }, { wch: 30 },
      { wch: 54 }, { wch: 17 }, { wch: 20 }, { wch: 36, hidden: true },
    ];
    sheet['!autofilter'] = { ref: 'A1:G1' };
    sheet['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };
    XLSX.utils.book_append_sheet(workbook, sheet, tab);
  }
  const summaryRows = [
    [...COLLAB_SUMMARY_HEADERS],
    ['Total Requests', 0, 0],
    ['Live', 0, 0],
    ['Pending', 0, 0],
    ['In Process', 0, 0],
    ['Rejected', 0, 0],
    ['Cancelled', 0, 0],
    ['Outstanding Commitments', 0, 0],
    ['Open Deals', 0, ''],
    ['Completed Deals', 0, ''],
  ];
  const summary = XLSX.utils.aoa_to_sheet(summaryRows);
  summary['!cols'] = [{ wch: 31 }, { wch: 21 }, { wch: 21 }];
  XLSX.utils.book_append_sheet(workbook, summary, 'Summary');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', compression: true }) as Buffer;
}

export function linksCsv(rows:Array<{created_at:string;website:string;placement_page:string;anchor:string;target_url:string;status:string;deal_ref?:string|null}>){
  const fields=(row:typeof rows[number])=>[row.created_at?.slice(0,10),row.website,row.placement_page,row.anchor,row.target_url,row.status,row.deal_ref||''];
  const csv=(item:unknown)=>`"${String(item??'').replace(/"/g,'""').replace(/^[=+@-]/,value=>`'${value}`)}"`;
  return '\ufeff'+[COLLAB_HEADERS.join(','),...rows.map(row=>fields(row).map(csv).join(','))].join('\r\n')+'\r\n';
}
