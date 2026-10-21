import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {findPlacedLink,isBlockedIp,normalizeLinkUrl} from '../lib/link-monitor-core.ts';
const source=(file)=>readFileSync(new URL(`../${file}`,import.meta.url),'utf8');

test('only matching hyperlink with correct anchor is verified',()=>{
  const good=findPlacedLink('<a href="https://example.org/page/">SEO services</a>','https://publisher.com/post','https://example.org/page','SEO services');
  assert.equal(good.matched,true);
  assert.equal(findPlacedLink('<p>https://example.org/page</p>','https://publisher.com/post','https://example.org/page','SEO services').matched,false);
  const bad=findPlacedLink('<a href="https://example.org/page">Wrong Anchor</a>','https://publisher.com/post','https://example.org/page','SEO services');
  assert.equal(bad.matched,false);
  assert.match(bad.detail,/anchor/i);
});
test('normalization ignores fragment and www prefix but preserves query',()=>{
  assert.equal(normalizeLinkUrl('https://www.Example.org/post/#hi'),normalizeLinkUrl('https://example.org/post'));
  assert.notEqual(normalizeLinkUrl('https://example.org/post?code=1'),normalizeLinkUrl('https://example.org/post?code=2'));
});
test('private and special IPs blocked in monitor',()=>{
  for(const ip of ['127.0.0.1','10.1.1.1','172.18.0.2','192.168.1.1','169.254.2.4','100.100.1.1','::1','fc00::1'])assert.equal(isBlockedIp(ip),true,ip);
  assert.equal(isBlockedIp('8.8.8.8'),false);
});
test('V9 operations database migration additive and RLS enabled',()=>{
  const migration=source('database/migrations/014_v9_operations.sql');
  for(const k of ['collaboration_link_checks','request_link_checks','operations_alerts','collaboration_partner_overview','operations_monthly_report','operations_team_report','operations_monitor_candidates','operations_monitor_request_candidates'])assert.ok(migration.includes(k),k);
  assert.doesNotMatch(migration,/drop table public\.(requests|projects|collaboration_links)/i);
  assert.match(migration,/enable row level security/i);
});
test('cron protected by secret and bounded checks',()=>{
  const cron=source('app/api/cron/operations/route.ts');
  assert.match(cron,/process\.env\.CRON_SECRET/);
  assert.match(cron,/authorization/);
  assert.match(cron,/p_limit:8/);
  assert.match(source("lib/link-monitor.ts"),/AbortSignal.timeout/);
});
test('new screens and operations actions are integrated',()=>{
  const nav=source('components/sidebar.tsx');
  assert.match(nav,/\/reports/);assert.match(nav,/\/attention/);
  assert.match(source('app/(protected)/collaborations/page.tsx'),/given_live/);
  assert.match(source('app/(protected)/collaborations/[id]/page.tsx'),/BulkLinkPanel/);
  assert.match(source('app/(protected)/reports/page.tsx'),/Export CSV/);
  assert.match(source('services/operations.ts'),/resyncPartnerBatch/);
});
