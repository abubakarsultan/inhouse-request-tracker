# Assumptions and known gaps

- The seven named `@rankviz.com` accounts are the fixed team directory; Abubakar is the initial admin and the other six are users unless changed by an admin.
- External users require an invitation; a Google sign-in alone does not grant application access.
- The Google service account remains necessary for legacy/team sheets and server-side synchronization.
- Project/collaboration files should not be automatically shared with admins. The file owner controls Google Drive sharing; server-side sync requires the service account to be explicitly added as Editor.
- Migration 012 introduces the database foundation, but this release does **not** yet implement every item in the supplied PROMPT v2. In particular, encrypted per-user OAuth connection routes, per-user sheet factory, robust setup retry UI, separate login pages and request-invitation UI, collaboration sheet preparation/repair, complete Removed/Incomplete badges, and performance RPC/pagination changes remain to be implemented and verified.
- No build/test success is claimed until the commands in UPGRADE_GUIDE.md have been run successfully in a complete dependency environment.
