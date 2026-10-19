# Rankviz invitation and project access update

Changes in this update:
- Admin invitations now accept valid email addresses on `@rankviz.com` as well as external domains. The seven fixed Rankviz accounts remain excluded from invitations because they are mapped automatically.
- Projects appears in the member sidebar. Members can view projects and their rows, while project create/edit/deactivate controls and sheet configuration controls remain admin-only in the UI.
- Project list and detail pages now allow active non-admin users to view data.
- Admin navigation has a single Admin entry to avoid duplicate navigation keys.

Deployment notes:
- Deploy this code and test with a non-admin account and an admin account.
- Invitation writes still require the existing `user_invitations` table and Supabase service-role configuration.
- Google OAuth `org_internal` is controlled by Google Cloud OAuth audience settings and cannot be fixed by this code alone.
- Build tests were not run in this environment because project dependencies are not installed. Please run `npm install` and `npm run build` before production deployment.
