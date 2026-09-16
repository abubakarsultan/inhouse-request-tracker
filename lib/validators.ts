import { z } from 'zod';

export const requestSchema = z.object({
  project_id: z.string().min(1),
  target_url: z.string().url(),
  anchor: z.string().min(1),
  approved_site: z.string().min(1),
  status: z.enum(['Request Shared','Live','Removed']).default('Request Shared')
});

export const transitions: Record<string,string[]> = {
  'Request Shared':['Live'],
  'Live':['Removed'],
  'Removed':[]
};

export function canChangeStatus(from:string,to:string){
  return from===to || (transitions[from] ?? []).includes(to);
}
