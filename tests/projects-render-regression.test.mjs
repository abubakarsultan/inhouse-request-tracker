import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('Projects page is resilient when migration 008 counts RPC is unavailable', () => {
  const service = read('services/projects.ts');
  const page = read('app/(protected)/projects/page.tsx');
  assert.match(service, /project_request_status_counts/);
  assert.match(service, /statsUnavailable/);
  assert.match(service, /\.catch\(\(error: unknown\) =>/);
  assert.doesNotMatch(service, /if \(countsError\) throw new Error/);
  assert.match(page, /statsUnavailable &&/);
  assert.match(page, /project\.counts\.requests \?\? '—'/);
});

test('Project Detail calls private site-count RPC using service role and falls back to head counts', () => {
  const service = read('services/sites.ts');
  const detail = read('app/(protected)/projects/[slug]/page.tsx');
  const sql = read('database/migrations/008_project_url_speed.sql');
  assert.match(sql, /grant execute on function public\.project_site_status_counts\(uuid\) to service_role/);
  assert.match(service, /adminClient\.rpc\('project_site_status_counts'/);
  assert.doesNotMatch(service, /supabase\.rpc\('project_site_status_counts'/);
  assert.match(service, /head: true, count: 'exact'/);
  assert.match(detail, /counts\.statsUnavailable/);
  assert.match(detail, /counts\.total == null \? sites\.length === 100/);
});

test('Route error boundary logs digest and avoids exposing production server errors', () => {
  const error = read('app/error.tsx');
  assert.match(error, /error\.digest/);
  assert.match(error, /NODE_ENV !== 'production'/);
  assert.match(error, /useEffect/);
});
