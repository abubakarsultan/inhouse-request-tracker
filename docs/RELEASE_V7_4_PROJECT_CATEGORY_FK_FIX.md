# V7.4 — Project category foreign-key save fix

## Verified cause

Vercel runtime log `[project:save][5d71166e]` reports PostgreSQL `23502`:
`null value in column "category_id" of relation "projects" violates not-null constraint`.
The live `projects.category_id` field references `project_categories(id)`. The V7.3 insert/update code sent the category label but never `category_id`.

The read-only query showed these active database rows:
- `Inhouse` / slug `inhouse`
- `Client` / slug `client`
- `Onpage` / slug `onpage` (UI label: **On Page**)
- `Others` / slug `others` was **missing**

## Code fix

- `services/projects.ts`: `createProject()` and `updateProject()` now look up the selected category's existing active UUID by slug using the server-side Supabase client. Both operations include `category_id` alongside the existing `category` label.
- `lib/project-category-slugs.ts`: explicit UI-label-to-DB-slug mapping (`On Page` -> `onpage`). IDs are looked up in each environment and never hardcoded.
- Missing/inactive category produces an actionable wizard error. Category lookup happens *before* any new Google Sheet is created, preventing an orphan Sheet when a category is missing.
- Existing Guest Post Anchor tabs, historical requests and column mapping are unchanged.

## Apply in this order

1. **Back up Supabase first.** Verify existing project records.
2. Supabase SQL Editor: run `database/migrations/009_project_category_ids.sql` **once**. It seeds `Others` if missing, preserves all existing category UUIDs, fills `category_id` only where missing and adds FK metadata only if absent. Do **not** remove the `NOT NULL` constraint.
3. Verify:
   ```sql
   select name, slug, id, active from public.project_categories order by sort_order;
   select count(*) as projects_missing_category_id from public.projects where category_id is null;
   ```
   Expect all four categories and `projects_missing_category_id = 0`.
4. Deploy the updated `inhouse-build` project to GitHub/Vercel. **SQL alone does not fix V7.3**: the new server code must also be deployed.
5. Reload Projects and test creating WorkHorse / Client / Live Link again. Before retrying, check whether a project with this sheet/tab already exists to avoid duplicate connections.
6. Open the new project's Sheet Details and verify the custom columns and Apps Script configuration before enabling live sync.

## Testing/limitations

Static automated regression tests are provided in `tests/v7-4-category-id.test.mjs`. No live Supabase connection is available here; run a Vercel production build and complete a real save test after deployment. If saving fails again, share the new `[project:save][reference]` Runtime Log entry (redact secrets).
