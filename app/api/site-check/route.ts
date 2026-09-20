import { NextRequest, NextResponse } from 'next/server';
import { scanSiteAcrossProjects } from '@/services/site-check';

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q') ?? '';
  try {
    const result = await scanSiteAcrossProjects(query);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : 'Site check failed.' }, { status: 500 });
  }
}
