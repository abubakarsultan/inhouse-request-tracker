# Changelog

## Upgrade: migration 012 and auth lifecycle hardening

- Added `database/migrations/012_per_user_google_drive_and_access.sql` for per-user Google connection metadata, access requests, invitation acceptance tracking, audit log, sheet setup state/error, request sheet flags, seeded Rankviz directory rows and the Supabase signup hook update.
- Synced migration SQL into `database/schema.sql`.
- Invitation is marked accepted on first profile creation and records `accepted_user_id`/`accepted_at`.
- Invitation role is not reapplied once the profile already exists; bootstrap-admin configuration is limited to missing profiles to reduce accidental role resets.
- Removed the forced Rankviz-name onboarding condition from active profile/action checks. Legacy onboarding remains for profiles explicitly marked incomplete.
- Moved historical build/release/report notes from the repository root to `docs/`; README remains in root.
- Added `UPGRADE_GUIDE.md` with setup, migration, deploy, test and rollback steps.

## Performance measurements

No before/after benchmark was run in this update, so no numeric performance improvement is claimed.
