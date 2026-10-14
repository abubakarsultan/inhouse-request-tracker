-- Project categories + per-project Google Sheet configuration.
alter table projects add column if not exists category text not null default 'Inhouse';
alter table projects add column if not exists sheet_source text not null default 'guest_post_anchor';
alter table projects add column if not exists sheet_name text;
alter table projects add column if not exists column_mapping jsonb not null default '[
  {"column":"A","heading":"Website","field":"approved_site"},
  {"column":"B","heading":"Opportunity","field":"placement_page"},
  {"column":"C","heading":"Anchor","field":"anchor"},
  {"column":"D","heading":"DR","field":"blank"},
  {"column":"E","heading":"Traffic","field":"blank"},
  {"column":"F","heading":"Status","field":"status"},
  {"column":"G","heading":"Note / Assigned To","field":"assign_to"},
  {"column":"H","heading":"Created By Email","field":"created_by_email"}
]'::jsonb;

update projects set category = 'Inhouse' where category is null or btrim(category) = '';
update projects set sheet_source = 'guest_post_anchor' where sheet_source is null or btrim(sheet_source) = '';

alter table projects drop constraint if exists projects_category_check;
alter table projects add constraint projects_category_check check (category in ('Inhouse','Client','On Page','Others'));
alter table projects drop constraint if exists projects_sheet_source_check;
alter table projects add constraint projects_sheet_source_check check (sheet_source in ('guest_post_anchor','custom_sheet'));
