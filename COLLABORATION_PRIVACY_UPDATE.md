# Collaboration Privacy and User Access Update

- Each active user can create and manage their own collaboration partners and Google Sheet connections.
- Non-admin users only see partners whose `created_by` matches their authenticated profile ID.
- Admin users can see and manage collaboration partners across the team.
- Partner detail access and collaboration mutations check partner ownership on the server.
- CSV export checks the same ownership rule.
- Existing collaboration rows with a null or mismatched `created_by` remain admin-only until an administrator assigns them to the correct owner. This avoids exposing legacy records to every user.

## Deployment note

This package changes application code only. Deploy it to a preview environment first and verify user A cannot open user B's partner URL or export their CSV. Google Sheets access still depends on the configured Google service account and spreadsheet sharing permissions.
