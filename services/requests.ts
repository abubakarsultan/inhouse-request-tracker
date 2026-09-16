import { supabase } from '@/lib/supabase';

export async function getRequests(){
 const {data,error}=await supabase.from('requests').select('*,projects(name)').order('created_at',{ascending:false});
 if(error) throw error; return data;
}
export async function createRequest(payload:any){
 return supabase.from('requests').insert(payload).select().single();
}
export async function updateStatus(id:string,status:string,user:string){
 const current=await supabase.from('requests').select('status').eq('id',id).single();
 const old=current.data?.status;
 const allowed=old==='Request Shared'&&status==='Live'||old==='Live'&&status==='Removed';
 if(!allowed) throw new Error('Invalid status transition');
 await supabase.from('request_logs').insert({request_id:id,old_status:old,new_status:status,changed_by:user});
 return supabase.from('requests').update({status}).eq('id',id);
}
