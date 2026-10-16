# Rankviz login and invitation changes

## Included
- Separate Continue with Rankviz and Continue with Google buttons.
- Rankviz logo from the supplied image at `public/rankviz-logo.jpg` and Google multicolour G mark.
- Fixed Rankviz email-to-name mapping; the seven listed accounts are activated without onboarding/approval. `abubakarsultan@rankviz.com` is the fixed admin account.
- Admin Team page has an Invite external user form; it records the exact external Google email, optional display name, and User/Admin role.
- External Google login is denied unless a pending invitation exists.
- New migration: `database/migrations/011_rankviz_login_and_invitations.sql`.

## Required setup
1. Run migration `011_rankviz_login_and_invitations.sql` in Supabase after migrations 001-010.
2. Ensure Supabase Google OAuth is configured and redirect URL includes `https://YOUR-DOMAIN/auth/callback`.
3. Set `ADMIN_EMAILS=abubakarsultan@rankviz.com` in Vercel as a backup admin bootstrap setting.
4. Deploy to preview first and test the seven Rankviz accounts plus an invited external Google account.

External invitation creation currently records an invitation in the database; it does not send an email notification. Share the login URL with the invitee manually. Role/authorization and all existing features should be checked with the project's complete build and regression tests before production rollout.
