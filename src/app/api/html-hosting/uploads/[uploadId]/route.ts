// ============================================================
// /api/html-hosting/uploads/[uploadId]
//
// PUT  ?part=N — raw bytes of one part of the gzipped file.
// POST         — finish: JSON { title?, password? } (both only used
//                for a new page). Verifies the file and publishes it.
// ============================================================

import { NextRequest } from 'next/server';
import { LogAction } from '@/lib/types';
import {
  completeUpload,
  errorResponse,
  logHostingActivity,
  requireCaller,
  saveUploadPart,
  toHostedPage,
  validatePassword,
} from '@/lib/html-hosting/server';

type Context = { params: Promise<{ uploadId: string }> };

export async function PUT(req: NextRequest, { params }: Context) {
  try {
    const { uploadId } = await params;
    const caller = await requireCaller(req);
    const part = Number(req.nextUrl.searchParams.get('part'));
    const bytes = Buffer.from(await req.arrayBuffer());

    await saveUploadPart(uploadId, part, bytes, caller);
    return Response.json({ success: true });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest, { params }: Context) {
  try {
    const { uploadId } = await params;
    const caller = await requireCaller(req);
    const body = (await req.json().catch(() => null)) ?? {};
    const password = body.password ? validatePassword(body.password) : null;

    const { page, created } = await completeUpload(uploadId, caller, { title: body.title, password });
    await logHostingActivity(
      caller,
      created ? LogAction.HTML_PAGE_DEPLOYED : LogAction.HTML_PAGE_UPDATED,
      page,
      created
        ? { sizeBytes: page.sizeBytes, passwordProtected: Boolean(password) }
        : { changed: ['file'], sizeBytes: page.sizeBytes }
    );

    return Response.json({ page: toHostedPage(page, caller) }, { status: created ? 201 : 200 });
  } catch (err) {
    return errorResponse(err);
  }
}
