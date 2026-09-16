import { NextResponse } from 'next/server';
import { createClient } from '@supabase/ssr';

export async function GET(request:Request){
 const url=new URL(request.url);
 const code=url.searchParams.get('code');
 if(!code) return NextResponse.redirect(new URL('/login',url));
 const response=NextResponse.redirect(new URL('/dashboard',url));
 const supabase=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll(){return request.headers.get('cookie')?.split(';').map(x=>{const [name,...v]=x.trim().split('=');return {name,value:v.join('=')}})??[]},setAll(){}}});
 await supabase.auth.exchangeCodeForSession(code);
 const {data}=await supabase.auth.getUser();
 if(!data.user?.email?.endsWith('@rankviz.com')) return NextResponse.redirect(new URL('/login?error=domain',url));
 return response;
}
