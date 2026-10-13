import { NextRequest, NextResponse } from 'next/server';
import { checkSiteInProject, scanSiteAcrossProjects } from '@/services/site-check';

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q') ?? '';
  const projectId = request.nextUrl.searchParams.get('project') ?? '';
  const excludeRequestId = request.nextUrl.searchParams.get('exclude') ?? null;
  try {
    const result = projectId
      ? await checkSiteInProject(projectId, query, excludeRequestId)
      : await scanSiteAcrossProjects(query);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : 'Site check failed.' }, { status: 500 });
  }
}
