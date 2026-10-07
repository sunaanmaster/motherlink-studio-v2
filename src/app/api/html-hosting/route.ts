// ============================================================
// /api/html-hosting
//
// GET  — list hosted pages (any user with the HTML Hosting tool).
// POST — multipart { file, title?, password? } → host a new page.
//
// Both require `Authorization: Bearer <Firebase ID token>`.
// ============================================================

import { NextRequest } from 'next/server';
import { LogAction } from '@/lib/types';
import {
  cleanTitle,
  createPage,
  errorResponse,
  HttpError,
  listPages,
  logHostingActivity,
  readHtmlFile,
  requireCaller,
  toHostedPage,
  validatePassword,
} from '@/lib/html-hosting/server';

export async function GET(req: NextRequest) {
  try {
    const caller = await requireCaller(req);
    const pages = await listPages();
    return Response.json({ pages: pages.map((p) => toHostedPage(p, caller)) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const caller = await requireCaller(req);

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new HttpError(400, 'Expected a multipart form upload.');
    }

    const file = form.get('file');
    if (!(file instanceof File)) throw new HttpError(400, 'Missing file.');
    const html = await readHtmlFile(file);

    const rawPassword = form.get('password');
    const password = rawPassword ? validatePassword(rawPassword) : null;

    const page = await createPage({
      html,
      fileName: file.name,
      title: cleanTitle(form.get('title'), file.name.replace(/\.html?$/i, '')),
      password,
      caller,
    });
    await logHostingActivity(caller, LogAction.HTML_PAGE_DEPLOYED, page, {
      sizeBytes: page.sizeBytes,
      passwordProtected: Boolean(password),
    });

    return Response.json({ page: toHostedPage(page, caller) }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
