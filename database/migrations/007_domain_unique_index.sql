create unique index if not exists requests_project_domain_unique_idx
  on requests (project_id, normalize_project_domain(approved_site))
  where deleted_at is null;
