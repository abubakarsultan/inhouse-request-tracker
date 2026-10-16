import 'server-only';
import { google } from 'googleapis';
import { adminClient } from '@/lib/supabase-admin';
import { COLLAB_HEADERS, COLLAB_SUMMARY_HEADERS, cleanTabName, partnerTabName, quoteA1, spreadsheetTitle, validateCollabHeaders, partnerMetrics, templatePartnerTabName } from '@/lib/collaboration-core';

function googleAuth() {
  const scopes = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.file'];
  const oauthClientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const oauthSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const oauthRefresh = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  if (oauthClientId && oauthSecret && oauthRefresh) {
    const auth = new google.auth.OAuth2(oauthClientId, oauthSecret);
    auth.setCredentials({ refresh_token: oauthRefresh });
    return auth;
  }
  const encoded = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!encoded) throw new Error('Google credentials missing. Configure Google OAuth refresh token or GOOGLE_SERVICE_ACCOUNT_JSON on Vercel.');
  let key: { client_email: string; private_key: string };
  try { key = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')); }
  catch { throw new Error('Invalid GOOGLE_SERVICE_ACCOUNT_JSON.'); }
  return new google.auth.JWT({ email: key.client_email, key: key.private_key, scopes });
}
function googleSheets() { return google.sheets({ version: 'v4', auth: googleAuth() }); }
function formatGoogleError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/quota|storage quota/i.test(message)) return 'Google denied creating a Sheet because the service account has no Drive storage quota. Configure GOOGLE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN for a connected Google user, or use Download Excel Template & Connect Manually.';
  return message.slice(0, 400);
}

export type SheetConnection = {
  spreadsheet_id: string; spreadsheet_title: string; our_tab_name: string; partner_tab_name: string; summary_tab_name: string;
  our_tab_gid: number; partner_tab_gid: number; summary_tab_gid: number;
};

function extractSheetId(url: string): string {
  const match = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]{15,})\b/.exec(url.trim());
  if (!match) throw new Error('Paste a valid Google Sheets URL (https://docs.google.com/spreadsheets/d/...).');
  return match[1];
}
export async function connectCollaborationSheet(url: string, partnerName: string): Promise<SheetConnection> {
  const spreadsheetId = extractSheetId(url);
  const sheets = googleSheets();
  let meta;
  try { meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'spreadsheetId,properties.title,sheets.properties' }); }
  catch (error) { throw new Error(`Cannot access Google Sheet. Grant Editor access to the configured Google account. ${formatGoogleError(error)}`); }
  const tabs = (meta.data.sheets || []).map(x => x.properties).filter((p): p is NonNullable<typeof p> => Boolean(p?.title));
  const lookup = (names: string[]) => tabs.find(t => names.some(n => n.toLowerCase() === (t.title || '').toLowerCase()));
  const ourTab = lookup(['Rankviz','Our Links']);
  const partnerTab = lookup([partnerTabName(partnerName), templatePartnerTabName(partnerName), 'Partner Links']);
  const summaryTab = lookup(['Summary']);
  if (!ourTab || !partnerTab || !summaryTab || new Set([ourTab.sheetId, partnerTab.sheetId, summaryTab.sheetId]).size !== 3) {
    throw new Error(`Sheet needs three distinct tabs: Rankviz, ${partnerTabName(partnerName)} (or Partner Links), and Summary. Import the single Excel (.xlsx) workbook so all three tabs appear together.`);
  }
  const names = [String(ourTab.title), String(partnerTab.title)];
  const headers = await sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges: [...names.map(name => `${quoteA1(name)}!A1:H1`), `${quoteA1(String(summaryTab.title))}!A1:C1`] });
  for (let i = 0; i < 2; i++) {
    const row = headers.data.valueRanges?.[i]?.values?.[0] ?? [];
    if (!validateCollabHeaders(row)) throw new Error(`Tab "${names[i]}" has different headings. Expected: ${COLLAB_HEADERS.join(', ')}. Download and import the template without changing the header row.`);
    if (String(row[7] || '').trim() && String(row[7]).trim() !== 'Record ID') throw new Error(`Tab "${names[i]}" already uses column H. Do not overwrite existing data; use a fresh Excel workbook template.`);
  }
  const summaryHeaders=headers.data.valueRanges?.[2]?.values?.[0] ?? [];
  if (!COLLAB_SUMMARY_HEADERS.every((heading,i)=>String(summaryHeaders[i]||'').trim()===heading)) {
    throw new Error('Summary tab headings do not match the template. Re-import the Excel workbook template before connecting.');
  }
  // H stores a stable record id for retries / move-safe reconciliation. Never overwrite A:G.
  await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: {
    valueInputOption: 'RAW', data: names.map(name => ({ range: `${quoteA1(name)}!H1`, values: [['Record ID']] })),
  } });
  try {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [ourTab,partnerTab].map(tab => ({ updateDimensionProperties: {
      range: { sheetId: Number(tab.sheetId), dimension: 'COLUMNS', startIndex: 7, endIndex: 8 },
      properties: { hiddenByUser: true }, fields: 'hiddenByUser',
    } })) } });
  } catch (e) { console.warn('[collab] optional hidden record ID column could not be configured:', formatGoogleError(e)); }
  return {
    spreadsheet_id: spreadsheetId, spreadsheet_title: String(meta.data.properties?.title || spreadsheetTitle(partnerName)),
    our_tab_name: String(ourTab.title), partner_tab_name: String(partnerTab.title), summary_tab_name: String(summaryTab.title),
    our_tab_gid: Number(ourTab.sheetId), partner_tab_gid: Number(partnerTab.sheetId), summary_tab_gid: Number(summaryTab.sheetId),
  };
}

export async function autoCreateCollaborationSheet(name: string, adminEmail: string): Promise<SheetConnection> {
  const sheets = googleSheets();
  const title = spreadsheetTitle(name);
  const ptab = partnerTabName(name);
  let created;
  try {
    created = await sheets.spreadsheets.create({ requestBody: {
      properties: { title }, sheets: [{ properties: { title: 'Rankviz' } }, { properties: { title: ptab } }, { properties: { title: 'Summary' } }],
    }, fields: 'spreadsheetId' });
  } catch (error) { throw new Error(`Automatic Google Sheet creation failed: ${formatGoogleError(error)}`); }
  const sheetId = created.data.spreadsheetId;
  if (!sheetId) throw new Error('Google did not return the newly created spreadsheet ID.');
  try {
    await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: sheetId, requestBody: { valueInputOption: 'RAW', data: [
      { range: "'Rankviz'!A1:H1", values: [[...COLLAB_HEADERS, 'Record ID']] },
      { range: `${quoteA1(ptab)}!A1:H1`, values: [[...COLLAB_HEADERS, 'Record ID']] },
      { range: "'Summary'!A1:C1", values: [[...COLLAB_SUMMARY_HEADERS]] },
    ] } });
    // Service-account-owned files should be explicitly shared. OAuth-owned files
    // can also be shared (if the permission already exists, a duplicate is harmless).
    if (adminEmail) {
      try {
        await google.drive({ version: 'v3', auth: googleAuth() }).permissions.create({ fileId: sheetId, sendNotificationEmail: false, requestBody: { type: 'user', role: 'writer', emailAddress: adminEmail } });
      } catch (error) {
        console.warn('[collab] sheet created but sharing failed:', formatGoogleError(error));
        throw new Error(`Sheet was created (ID: ${sheetId}), but granting ${adminEmail} Editor access failed. Connect this Sheet manually after granting permission: ${formatGoogleError(error)}`);
      }
    }
    return await connectCollaborationSheet(`https://docs.google.com/spreadsheets/d/${sheetId}/edit`, name);
  } catch (error) {
    // Give the user the ID for recovery instead of creating another sheet on retry.
    throw new Error(`Google Sheet ${sheetId} was created but setup was incomplete. Open https://docs.google.com/spreadsheets/d/${sheetId}/edit and connect it manually. ${formatGoogleError(error)}`);
  }
}

function rowForLink(link: any, dealRef: string | null): string[] {
  return [String(link.created_at || '').slice(0,10), String(link.website), String(link.placement_page), String(link.anchor), String(link.target_url), String(link.status), dealRef || '', String(link.id)];
}
async function log(partnerId: string, linkId: string | null, action: string, state: string, details?: string) {
  const { error } = await adminClient.from('collaboration_sync_log').insert({ partner_id: partnerId, link_id: linkId, action, state, details: details?.slice(0,500) || null });
  if (error) console.error('[collab:sync] logging failed:', error.message);
}

/** Write or reconcile by stable Record ID, not an easily-shifted row number. */
export async function syncCollaborationLink(linkId: string): Promise<{state: string; text: string}> {
  const { data: link, error: linkError } = await adminClient.from('collaboration_links').select('*').eq('id',linkId).single();
  if (linkError || !link) throw new Error(linkError?.message || 'Link not found');
  const { data: partner, error: partnerError } = await adminClient.from('collaboration_partners').select('*').eq('id',link.partner_id).single();
  if (partnerError || !partner) throw new Error(partnerError?.message || 'Partner not found');
  if (!partner.sync_enabled || !partner.spreadsheet_id || partner.sheet_setup_state !== 'connected') {
    await adminClient.from('collaboration_links').update({sync_state:'disabled',sync_error:'Sheet not connected or sync disabled'}).eq('id',linkId);
    return {state:'disabled',text:'Saved in the app. Connect or enable the partner Sheet to synchronize.'};
  }
  try {
    const sheets=googleSheets();
    const tab=link.direction==='given'?partner.our_tab_name:partner.partner_tab_name;
    const range=`${quoteA1(tab)}!H2:H`;
    const response=await sheets.spreadsheets.values.get({ spreadsheetId:partner.spreadsheet_id,range });
    const rowIndex=(response.data.values||[]).findIndex(row=>String(row?.[0]||'')===String(link.id));
    const rowNum=rowIndex>=0?rowIndex+2:null;
    let dealRef:null|string=null;
    if(link.deal_id){const {data:deal}=await adminClient.from('collaboration_deals').select('deal_ref').eq('id',link.deal_id).maybeSingle();dealRef=deal?.deal_ref||null;}
    const values=[rowForLink(link,dealRef)];
    let actualRow: number;
    if(rowNum){
      await sheets.spreadsheets.values.update({spreadsheetId:partner.spreadsheet_id,range:`${quoteA1(tab)}!A${rowNum}:H${rowNum}`,valueInputOption:'RAW',requestBody:{values}});
      actualRow=rowNum;
    } else {
      // Append location returned by Google is authoritative, not sheet length.
      const result=await sheets.spreadsheets.values.append({spreadsheetId:partner.spreadsheet_id,range:`${quoteA1(tab)}!A:H`,valueInputOption:'RAW',insertDataOption:'INSERT_ROWS',requestBody:{values}});
      const updatedRange=result.data.updates?.updatedRange||'';
      const match=updatedRange.match(/![A-Z]+(\d+)(?::|$)/);
      if(!match)throw new Error('Google did not return the appended row location; use Retry Sync to reconcile by Record ID.');
      actualRow=Number(match[1]);
    }
    await adminClient.from('collaboration_links').update({sheet_row:actualRow,sync_state:'synced',sync_error:null}).eq('id',linkId);
    await adminClient.from('collaboration_partners').update({last_synced_at:new Date().toISOString()}).eq('id',partner.id);
    await log(partner.id,linkId,'upsert','synced');
    await refreshCollaborationSummary(partner.id);
    return {state:'synced',text:`Synced to ${tab}, row ${actualRow}`};
  }catch(error){
    const text=formatGoogleError(error);
    await adminClient.from('collaboration_links').update({sync_state:'failed',sync_error:text}).eq('id',linkId);
    await log(partner.id,linkId,'upsert','failed',text);
    return {state:'failed',text};
  }
}

/** Summary is DB-derived and overwrites only system-owned Summary A:C. */
export async function refreshCollaborationSummary(partnerId: string) {
  const [{data:partner},{data:links,error:linkError},{data:deals,error:dealError}]=await Promise.all([
    adminClient.from('collaboration_partners').select('*').eq('id',partnerId).single(),
    adminClient.from('collaboration_links').select('direction,status,deal_id').eq('partner_id',partnerId),
    adminClient.from('collaboration_deals').select('id,give_required,receive_required,state').eq('partner_id',partnerId),
  ]);
  if(linkError||dealError)throw new Error(linkError?.message||dealError?.message);
  if(!partner?.spreadsheet_id||partner.sheet_setup_state!=='connected'||!partner.sync_enabled)return;
  const rows=links||[];const metrics=partnerMetrics(deals||[],rows);
  const given=(status:string)=>rows.filter(l=>l.direction==='given'&&l.status===status).length;
  const received=(status:string)=>rows.filter(l=>l.direction==='received'&&l.status===status).length;
  const values=[
    [...COLLAB_SUMMARY_HEADERS],
    ['Total Requests', String(rows.filter(l=>l.direction==='given').length),String(rows.filter(l=>l.direction==='received').length)],
    ['Live',String(metrics.givenLive),String(metrics.receivedLive)],
    ['Pending',String(given('Pending')),String(received('Pending'))],
    ['In Process',String(given('In Process')),String(received('In Process'))],
    ['Rejected',String(given('Rejected')),String(received('Rejected'))],
    ['Cancelled',String(given('Cancelled')),String(received('Cancelled'))],
    ['Outstanding Commitments',String(metrics.givenOutstanding),String(metrics.receivedOutstanding)],
    ['Open Deals',String(metrics.openDeals),''],
    ['Completed Deals',String(metrics.completedDeals),''],
  ];
  await googleSheets().spreadsheets.values.update({spreadsheetId:partner.spreadsheet_id,range:`${quoteA1(partner.summary_tab_name)}!A1:C${values.length}`,valueInputOption:'RAW',requestBody:{values}});
}

/** The trigger is installed in Apps Script by a Google account with edit rights. */
export function collaborationAppsScript(appUrl:string,partner:any):string {
  const secret=String(partner.webhook_token||'');
  if(!secret)return '// Missing partner webhook token. Run migration 010 before enabling inbound sync.';
  const cleanHost=appUrl.replace(/\/$/,'');
  const tabInfo=JSON.stringify({[String(partner.our_tab_gid)]:'given',[String(partner.partner_tab_gid)]:'received'});
  return `// Install once: Extensions > Apps Script > paste this code > run installCollaborationTrigger > authorize.
const COLLAB_WEBHOOK = ${JSON.stringify(`${cleanHost}/api/collaboration/webhook`)};
const COLLAB_TOKEN = ${JSON.stringify(secret)};
const COLLAB_SHEET_ID = ${JSON.stringify(partner.spreadsheet_id)};
const COLLAB_TAB_DIRECTIONS = ${tabInfo};
function collaborationOnEdit(e) {
  if (!e || !e.range || e.range.getRow() < 2) return;
  const sh = e.range.getSheet(), direction = COLLAB_TAB_DIRECTIONS[String(sh.getSheetId())];
  if (!direction || e.range.getColumn() > 7) return;
  const row = sh.getRange(e.range.getRow(), 1, 1, 8).getDisplayValues()[0];
  if (!row[7]) return; // Only edit rows originally created by the app.
  const payload = { spreadsheetId: COLLAB_SHEET_ID, tabGid: sh.getSheetId(), recordId: row[7], row };
  UrlFetchApp.fetch(COLLAB_WEBHOOK, { method: 'post', contentType: 'application/json',
    headers: { 'X-Collaboration-Token': COLLAB_TOKEN }, payload: JSON.stringify(payload), muteHttpExceptions: false });
}
function installCollaborationTrigger() {
  const ss=SpreadsheetApp.openById(COLLAB_SHEET_ID);
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'collaborationOnEdit').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('collaborationOnEdit').forSpreadsheet(ss).onEdit().create();
}
`;
}
