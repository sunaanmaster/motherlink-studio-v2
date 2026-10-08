// ============================================================
// POST /api/html-hosting/uploads — start an upload.
//
// JSON { fileName, sizeBytes, compressedBytes, pageId? }
//   pageId  set to replace the file of an existing page (owner or
//           admin only); omit to create a new page.
// → { uploadId, partCount }
//
// The browser then sends the gzipped file in `partCount` parts to
// PUT /api/html-hosting/uploads/{uploadId}?part=N and finishes with
// POST /api/html-hosting/uploads/{uploadId}.
// ============================================================

import { NextRequest } from 'next/server';
import {
  errorResponse,
  getManagedPage,
  HttpError,
  requireCaller,
  startUpload,
  validateHtmlFileName,
} from '@/lib/html-hosting/server';

export async function POST(req: NextRequest) {
  try {
    const caller = await requireCaller(req);
    const body = await req.json().catch(() => null);
    if (!body) throw new HttpError(400, 'Invalid JSON body.');

    const fileName = validateHtmlFileName(body.fileName);
    const replacePage = body.pageId ? await getManagedPage(String(body.pageId), caller) : null;

    const upload = await startUpload({
      caller,
      fileName,
      sizeBytes: body.sizeBytes,
      compressedBytes: body.compressedBytes,
      replacePage,
    });
    return Response.json(upload, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
