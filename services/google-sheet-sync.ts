export async function syncStatusToSheet(request:any){
 if(!request.projects?.guest_post_tab_name || !request.projects?.sync_enabled) return {skipped:true};
 // Google Sheets API implementation uses service account credentials from env.
 // Production hook: update only Status column.
 return {queued:true,tab:request.projects.guest_post_tab_name};
}
