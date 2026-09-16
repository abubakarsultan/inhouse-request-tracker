import { createClient } from '@supabase/supabase-js';

export const adminClient = createClient(
 process.env.NEXT_PUBLIC_SUPABASE_URL!,
 process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const isRankvizEmail=(email:string)=>email.toLowerCase().endsWith('@rankviz.com');
