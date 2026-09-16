import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
export async function middleware(req:NextRequest){
 if(req.nextUrl.pathname.startsWith('/dashboard')||req.nextUrl.pathname.startsWith('/projects')||req.nextUrl.pathname.startsWith('/requests')) return NextResponse.next();
 return NextResponse.next();
}
export const config={matcher:['/dashboard/:path*','/projects/:path*','/requests/:path*']};
