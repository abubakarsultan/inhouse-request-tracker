# V6.1 Vercel TypeScript Build Fix

## Error reported

`services/health.ts(138,5): error TS2741: Property 'sync_enabled' is missing ... but required in type 'SyncableProject'.`

## Code fix

In `services/health.ts`, the `relinkHealthRequest()` Supabase joined project selector now includes `sync_enabled`:

```ts
.select('id,approved_site,anchor,team_tab,team_row,projects(id,google_sheet_id,sheet_source,column_mapping,guest_post_tab_name,sync_enabled),project_sites(id)')
```

The `verifyRequestTeamRow()` call expects `SyncableProject` with required `sync_enabled: boolean`. Selecting the column supplies the expected value. No changes to the database or environment variables are needed **for this particular TS fix**; existing V6 setup requirements still apply if not previously completed.

## Validation

- Test suite: 25/25 passing, including a new regression test on the project SELECT used for health relink.
- The earlier Vercel log indicates Next.js compilation succeeded and only TypeScript failed on the missing property.
- Full `next build` could not be reproduced here because npm dependencies were not available locally. Deploy to Vercel for authoritative build verification. If Vercel reports further errors, use the first subsequent TypeScript failure line as a guide.

## Deployment

Replace the source with this ZIP's `inhouse-build` folder contents, commit, push to GitHub `main`, and redeploy on Vercel. Make sure `services/health.ts` is from this V6.1 package. No need to re-run Supabase migration `008` if it was already applied.
