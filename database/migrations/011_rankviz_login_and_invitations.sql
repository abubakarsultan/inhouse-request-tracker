-- Rankviz fixed team accounts + invitations for external Google accounts.
-- Safe to re-run. Run after migrations 001-010.
create table if not exists user_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  display_name text,
  role text not null default 'member' check (role in ('admin','member')),
  status text not null default 'pending' check (status in ('pending','accepted','revoked')),
  invited_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);
create unique index if not exists user_invitations_email_pending_unique on user_invitations(lower(email)) where status = 'pending';
create index if not exists user_invitations_status_idx on user_invitations(status);
-- Fixed team accounts are activated automatically by the auth callback; keep Abubakar as admin.
update users set role='admin', active=true, account_status='active', sheet_name='Abubakar', onboarding_completed=true
where lower(email)='abubakarsultan@rankviz.com' and account_status <> 'disabled';
