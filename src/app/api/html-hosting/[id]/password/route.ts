// ============================================================
// GET /api/html-hosting/[id]/password
//
// Returns the page's current password so whoever manages the page
// can look it up again. Owner or admin only.
// → { password: string | null }  (null: none set, or set before
//   passwords were kept in a viewable form)
// ============================================================

import { NextRequest } from 'next/server';
import { errorResponse, getManagedPage, requireCaller, viewPassword } from '@/lib/html-hosting/server';

type Context = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Context) {
  try {
    const { id } = await params;
    const caller = await requireCaller(req);
    const page = await getManagedPage(id, caller);
    return Response.json({ password: viewPassword(page) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err);
  }
}
