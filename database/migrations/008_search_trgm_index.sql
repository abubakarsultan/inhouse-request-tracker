create extension if not exists pg_trgm;

create index if not exists requests_search_trgm_idx
  on requests using gin (
    (regexp_replace(lower(concat_ws(' ', approved_site, anchor, target_url, sub_project, assign_to)), '[^a-z0-9]', '', 'g')) gin_trgm_ops
  );
