create table profiles(
 id uuid primary key,
 email text unique not null,
 name text,
 role text default 'member',
 created_at timestamptz default now()
);

create table projects(
 id uuid primary key default gen_random_uuid(),
 name text not null,
 slug text unique not null,
 outreach_project_name text,
 guest_post_tab_name text,
 sync_enabled boolean default false,
 created_at timestamptz default now()
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
 deadline date,
 created_at timestamptz default now()
);

create table sync_logs(
 id uuid primary key default gen_random_uuid(),
 request_id uuid references requests(id),
 direction text,
 status text,
 created_at timestamptz default now()
);

create table imports(
 id uuid primary key default gen_random_uuid(),
 file_name text,
 rows_imported int,
 created_at timestamptz default now()
);
