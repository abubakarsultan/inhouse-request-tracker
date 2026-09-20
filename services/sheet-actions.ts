'use server';

import { refreshStatusesFromTeamSheet } from '@/services/google-sheet-sync';

export async function refreshTeamSheetStatuses() {
  return refreshStatusesFromTeamSheet();
}
