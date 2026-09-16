create extension if not exists "pgcrypto";

create type user_role as enum ('admin','member');
create type request_status as enum ('Request Shared','Live','Removed');

create table if not exists users(id uuid primary key,email text unique not null,name text,avatar text,role user_role default 'member',created_at timestamptz default now());
create table if not exists projects(id uuid primary key default gen_random_uuid(),name text not null,slug text unique not null,outreach_project_name text,guest_post_tab_name text,sync_enabled boolean default false,created_by uuid references users(id),created_at timestamptz default now());
create table if not exists requests(id uuid primary key default gen_random_uuid(),project_id uuid references projects(id),sub_project text,target_url text not null,anchor text not null,approved_site text not null,placement_page text,priority text,assigned_to uuid references users(id),status request_status default 'Request Shared',deadline date,shared_with text,created_by uuid references users(id),created_at timestamptz default now(),updated_at timestamptz default now());
create table if not exists sync_logs(id uuid primary key default gen_random_uuid(),request_id uuid references requests(id),direction text,sheet_name text,sheet_row int,status text,created_at timestamptz default now());
create table if not exists imports(id uuid primary key default gen_random_uuid(),file_name text,uploaded_by uuid references users(id),rows_imported int,created_at timestamptz default now());
create table if not exists request_logs(id uuid primary key default gen_random_uuid(),request_id uuid references requests(id),old_status text,new_status text,changed_by uuid references users(id),created_at timestamptz default now());
