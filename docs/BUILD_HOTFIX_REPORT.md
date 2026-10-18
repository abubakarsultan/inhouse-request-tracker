# Build Hotfix Report

## Vercel error fixed

Vercel successfully completed the Next.js production compile, then TypeScript failed at:

- `services/requests.ts(446,13)`
- `services/requests.ts(447,17)`

The Supabase embedded `projects(name,slug)` relation was inferred as an array (`{ name, slug }[]`) while `DashboardActivityRow` intentionally exposes one project summary object (`{ name, slug } | null`). The code used a direct type assertion, so TypeScript correctly rejected the incompatible relation shape.

## Fix

`services/requests.ts` now normalizes the embedded project relation instead of force-casting the Supabase result:

- handles either array or object relation shapes;
- takes the first related project when Supabase returns an array;
- returns a stable `{ name, slug } | null` UI shape;
- explicitly normalizes dashboard activity scalar fields;
- removes both unsafe `as DashboardActivityRow[]` assertions.

No database, Google Sheets, API, or UI behavior was changed.

## Verification

- `npm run test:phase4`: 7/7 tests passed.
- `node --experimental-strip-types --check services/requests.ts`: passed.
- The two direct `DashboardActivityRow[]` assertions reported by Vercel no longer exist.
- A full local Next.js build could not be rerun in this sandbox because `npm ci` timed out while fetching packages. The supplied Vercel log already confirms that the production compile succeeds and that these were the only TypeScript errors reported in that build.

## Deploy

Replace the repository contents with this hotfix (or apply the `services/requests.ts` change), commit, and redeploy on Vercel. No SQL migration or environment-variable change is required for this hotfix.
