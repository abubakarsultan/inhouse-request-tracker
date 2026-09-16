create table profiles(
id uuid primary key,
email text unique,
name text,
role text default 'member'
);

create table projects(
id uuid primary key default gen_random_uuid(),
name text not null,
slug text unique,
outreach_project_name text,
guest_post_tab_name text,
sync_enabled boolean default false
);

create table requests(
id uuid primary key default gen_random_uuid(),
project_id uuid references projects(id),
target_url text,
anchor text,
approved_site text,
placement_page text,
priority text,
assigned_to text,
status text default 'Request Shared',
created_at timestamptz default now()
);

create table sync_logs(
id uuid primary key default gen_random_uuid(),
request_id uuid references requests(id),
direction text,
status text,
created_at timestamptz default now()
);
