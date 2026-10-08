// ============================================================
// GET /api/html-hosting — list hosted pages (any user with the
// HTML Hosting tool). New pages are created through
// /api/html-hosting/uploads.
//
// Requires `Authorization: Bearer <Firebase ID token>`.
// ============================================================

import { NextRequest } from 'next/server';
import { errorResponse, listPages, requireCaller, toHostedPage } from '@/lib/html-hosting/server';

export async function GET(req: NextRequest) {
  try {
    const caller = await requireCaller(req);
    const pages = await listPages();
    return Response.json({ pages: pages.map((p) => toHostedPage(p, caller)) });
  } catch (err) {
    return errorResponse(err);
  }
}
