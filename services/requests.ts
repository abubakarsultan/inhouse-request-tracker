export const statuses=['Request Shared','Live','Removed'] as const;
export function canChangeStatus(from:string,to:string){return (from==='Request Shared'&&to==='Live')||(from==='Live'&&to==='Removed')}
