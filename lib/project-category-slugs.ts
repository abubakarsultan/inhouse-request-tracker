import type { ProjectCategory } from './project-sheet';

// These are database slugs, not labels. The existing database uses 'onpage'
// for the UI category 'On Page'. Never derive a slug from the display name.
export const PROJECT_CATEGORY_SLUGS: Record<ProjectCategory, string> = {
  Inhouse: 'inhouse',
  Client: 'client',
  'On Page': 'onpage',
  Others: 'others',
};

export function projectCategorySlug(category: ProjectCategory): string {
  return PROJECT_CATEGORY_SLUGS[category];
}
