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
