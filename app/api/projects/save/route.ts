import { NextRequest, NextResponse } from 'next/server';
import { createProject, updateProject } from '@/services/projects';
import { describeProjectSaveError } from '@/lib/project-save-error';
import { projectSchema } from '@/lib/validators';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Project saves use an authenticated JSON endpoint rather than a React Server
 * Action. A failed RSC action is represented by React #441 in production,
 * hiding the actual save failure. API JSON responses preserve useful,
 * sanitized feedback and a server log reference for diagnostics.
 */
export async function POST(request: NextRequest) {
  const traceId = crypto.randomUUID().slice(0, 8);
  const reply = (body: Record<string, unknown>, status: number) =>
    NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

  try {
    // Same-origin POST only. Cookies by themselves must not authorize a
    // cross-site project mutation; createProject/updateProject also verify admin.
    const origin = request.headers.get('origin');
    const expectedHost = request.headers.get('x-forwarded-host') || request.headers.get('host') || request.nextUrl.host;
    if (!origin || new URL(origin).host.toLowerCase() !== expectedHost.toLowerCase()) {
      return reply({ ok: false, message: 'Invalid request origin. Reload this page and try again.', reference: traceId }, 403);
    }
    const declaredSize = Number(request.headers.get('content-length') || 0);
    if (declaredSize > 65536) return reply({ ok: false, message: 'Project setup is too large.', reference: traceId }, 413);

    const body = await request.json() as { mode?: unknown; projectId?: unknown; input?: unknown };
    const mode = body?.mode;
    if (mode !== 'create' && mode !== 'update') {
      return reply({ ok: false, message: 'Invalid project operation.', reference: traceId }, 400);
    }
    const projectInput = projectSchema.safeParse(body?.input);
    if (!projectInput.success) {
      return reply({ ok: false, message: `Check the project setup: ${projectInput.error.issues[0]?.message || 'invalid input'}.`, reference: traceId }, 400);
    }
    if (mode === 'update' && (typeof body.projectId !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body.projectId))) {
      return reply({ ok: false, message: 'Invalid project ID.', reference: traceId }, 400);
    }

    if (mode === 'create') await createProject(projectInput.data);
    else await updateProject(body.projectId as string, projectInput.data);
    return reply({ ok: true }, 200);
  } catch (error) {
    console.error(`[project:save][${traceId}] Failed to save project`, error);
    const message = describeProjectSaveError(error);
    const status = /sign in again|sign-in required/i.test(message) ? 401
      : /Admin access required|account is disabled/i.test(message) ? 403
      : /already (exists|belongs|connected|mapped)/i.test(message) ? 409
      : /migration|Supabase projects table/i.test(message) ? 503 : 500;
    return reply({ ok: false, message, reference: traceId }, status);
  }
}
