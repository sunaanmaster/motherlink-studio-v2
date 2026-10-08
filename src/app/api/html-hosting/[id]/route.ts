// ============================================================
// /api/html-hosting/[id]
//
// PATCH  — multipart, any of:
//            title           rename
//            password        set / change the password
//            removePassword  "1" → make the page public
//            slug            custom link name; empty → back to the default link
//          (Replacing the HTML goes through /api/html-hosting/uploads.)
// DELETE — take the page down.
//
// Owner or admin only.
// ============================================================

import { NextRequest } from 'next/server';
import { LogAction } from '@/lib/types';
import {
  cleanTitle,
  deletePage,
  errorResponse,
  getManagedPage,
  HttpError,
  logHostingActivity,
  requireCaller,
  setPageSlug,
  toHostedPage,
  updatePage,
  validatePassword,
  validateSlug,
} from '@/lib/html-hosting/server';

type Context = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Context) {
  try {
    const { id } = await params;
    const caller = await requireCaller(req);
    const page = await getManagedPage(id, caller);

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new HttpError(400, 'Expected a multipart form upload.');
    }

    const changes: Parameters<typeof updatePage>[1] = {};

    const title = form.get('title');
    if (typeof title === 'string' && title.trim()) changes.title = cleanTitle(title, page.title);

    const password = form.get('password');
    if (form.get('removePassword') === '1') changes.password = null;
    else if (password) changes.password = validatePassword(password);

    const slug = form.has('slug') ? validateSlug(form.get('slug')) : undefined;
    const slugChanged = slug !== undefined && slug !== page.slug;

    const changed = [...Object.keys(changes), ...(slugChanged ? ['slug'] : [])];
    if (changed.length === 0) throw new HttpError(400, 'Nothing to update.');

    // Slug first: it is the only step that can be refused (name taken).
    let updated = slugChanged ? await setPageSlug(page, slug) : page;
    if (Object.keys(changes).length > 0) updated = await updatePage(updated, changes);
    await logHostingActivity(caller, LogAction.HTML_PAGE_UPDATED, updated, {
      changed,
      passwordProtected: Boolean(updated.passwordHash),
    });

    return Response.json({ page: toHostedPage(updated, caller) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: NextRequest, { params }: Context) {
  try {
    const { id } = await params;
    const caller = await requireCaller(req);
    const page = await getManagedPage(id, caller);

    await deletePage(page);
    await logHostingActivity(caller, LogAction.HTML_PAGE_DELETED, page);

    return Response.json({ success: true });
  } catch (err) {
    return errorResponse(err);
  }
}
