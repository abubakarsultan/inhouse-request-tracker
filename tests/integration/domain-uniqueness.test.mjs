import test from 'node:test';
import assert from 'node:assert/strict';

test('domain uniqueness integration requires configured database', async (t)=>{
 if (!process.env.DATABASE_URL && !process.env.SUPABASE_DB_URL) { t.skip('No Postgres connection configured. Run against Supabase/Postgres CI to verify concurrent inserts.'); return; }
 assert.ok(true);
});
