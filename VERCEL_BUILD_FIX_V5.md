# Vercel Build Fix v5

## Issue
Vercel's TypeScript checker rejected `variant="outline"` on five Buttons because the shared `Button` component did not define an outline variant.

## Fix
Added a properly styled `outline` variant to `components/ui/button.tsx`, with border, transparent background, text color and hover state. `VariantProps<typeof button>` automatically exposes the new choice to TypeScript.

This fixes the reported usages in:
- `components/app/global-sheet-script-dialog.tsx` (2)
- `components/app/project-form-dialog.tsx` (1)
- `components/app/project-sheet-details.tsx` (2)

No app flows, database migration, or Google Sheets logic changed.

## Deployment
Replace the repository contents with the `inhouse-build` project files, commit to `main`, and redeploy on Vercel. Keep the existing Vercel environment variables and database migrations.

## Verification
All included TS/TSX source files were syntax-parsed with the global TypeScript compiler; the shared variant definition and five original usages were cross-checked. A full Next.js production build could not be run locally because npm dependencies could not be downloaded from npm registry (EAI_AGAIN); Vercel runs the full build during deployment.
