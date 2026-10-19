# Changelog

## Phase 1 — per-user Google Drive foundation

- Added AES-256-GCM token encryption/decryption (`iv.tag.ciphertext`) and signed, short-lived OAuth state validation.
- Added per-user Google OAuth connect/callback/disconnect routes and connection status in Profile.
- Added a shared user-owned spreadsheet factory with header formatting, frozen row, column sizing, Status dropdown, Live conditional formatting, service-account Editor share, and service-account verification.
- Project new-sheet creation now persists a draft project before Google sheet creation and stores the spreadsheet ID in the factory's creation callback before formatting/sharing.
- Collaboration auto-create now uses the creating user's OAuth connection; server-side collaboration sync auth uses the service account rather than a shared OAuth refresh token.
- Added tests for token crypto, OAuth return-path validation, and signed/user-bound state cookie. Updated source-structure tests to match the factory architecture.
- Performance measurements: not taken. No before/after query counts or payload sizes are claimed.

## Known gaps

- Project Retry/Repair UI is not implemented; setup errors are persisted for diagnosis.
- Full collaboration privacy audit and repair action remain incomplete.
- Full TypeScript check and Next.js production build were not verifiable because dependency installation timed out and the installed type packages are incomplete.


## 2026-10-18 — review fixes and Phase 2 foundations
- Project Status validation list now uses `Request shared`, `Live`, `Rejected`; collaboration dropdown uses `COLLAB_STATUSES`.
- Project creation validates the admin Drive connection before inserting a draft; draft is deleted when creation fails before a spreadsheet ID is persisted. Existing sheet IDs are stored with their owner and repair reuses that ID.
- Project list/detail expose setup state/errors and admin recovery/create-sheet actions. Profile now displays Google OAuth result codes and requires explicit `NEXT_PUBLIC_SITE_URL`.
- Collaboration has owner-token access repair and non-destructive sheet preparation; Apps Script panel remains available for any connected spreadsheet.
- Migration 013 adds the team directory and permissive Supabase signup hook. Auth uses directory rows, existing profiles keep their role/name/status on future sign-ins, access requests/invitation revocation/directory management and last-admin protection were added.
- Added Removed-sheet flag handling and shared incomplete-fields helper plus request-list badges/filter.
- Performance before/after figures were not collected in this environment; no performance numbers are claimed.
- Full production build/typecheck could not be verified because dependency installation timed out; see test evidence in delivery report.
- Latest verification run: `node --experimental-strip-types --test tests/*.test.mjs` — 86 tests passed, 0 failed. `tsc --noEmit` remains blocked by missing `@types/node`, `@types/react`, and `@types/react-dom`; `npm run build` remains blocked because `next` is not installed after `npm ci` timed out. No production build success is claimed.
