-- READ ONLY: confirm project categories and possible mismatches after app deploy.
SELECT id, name, slug, sheet_mode, sort_order, active
FROM public.project_categories
ORDER BY sort_order, name;

SELECT p.id, p.name, p.category AS old_category_label,
       p.category_id, c.slug AS category_slug, c.active AS category_active
FROM public.projects p
LEFT JOIN public.project_categories c ON c.id = p.category_id
WHERE c.id IS NULL OR c.active = false
   OR (lower(replace(p.category,' ','')) = 'onpage' AND c.slug <> 'onpage')
ORDER BY p.name;
