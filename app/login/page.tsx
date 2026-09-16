'use client';
import { supabase } from '@/lib/supabase';
export default function Login(){
 async function login(){await supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo:`${location.origin}/auth/callback`}})}
 return <main className="min-h-screen grid place-items-center"><button onClick={login} className="rounded-xl bg-black text-white px-6 py-3">Continue with Google</button></main>
}
