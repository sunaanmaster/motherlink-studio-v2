// ============================================================
// /s/[id] — public link for a hosted HTML page.
//
// GET  — serves the page, or the password prompt if it is
//        protected and the visitor has not unlocked it yet.
// POST — password form submit; sets the unlock cookie.
//
// Uploaded HTML runs under `Content-Security-Policy: sandbox`, which
// gives it an opaque origin: its scripts work, but they cannot read
// ML Studio's cookies, storage or Firebase session on this domain.
// ============================================================

import { NextRequest } from 'next/server';
import { isAdminConfigured } from '@/lib/firebase/admin';
import {
  checkPassword,
  createUnlockCookie,
  getPage,
  getPageHtmlStream,
  isUnlocked,
  unlockCookieName,
} from '@/lib/html-hosting/server';

type Context = { params: Promise<{ id: string }> };

const PAGE_CSP =
  'sandbox allow-scripts allow-forms allow-modals allow-popups ' +
  'allow-popups-to-escape-sandbox allow-downloads allow-presentation';

const BASE_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer',
};

function messagePage(title: string, body: string, status: number): Response {
  return new Response(shell(title, `<h1>${title}</h1><p>${body}</p>`), {
    status,
    headers: { ...BASE_HEADERS, 'Content-Security-Policy': SHELL_CSP },
  });
}

const SHELL_CSP = "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'";

function shell(title: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${title}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    padding: 24px; background: #000; color: #ededed;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  main { width: 100%; max-width: 360px; background: #0a0a0a; border: 1px solid rgba(255,255,255,0.09);
    border-radius: 12px; padding: 28px; }
  h1 { margin: 0 0 8px; font-size: 18px; font-weight: 600; letter-spacing: -0.01em; }
  p { margin: 0 0 20px; font-size: 14px; line-height: 1.5; color: #a1a1a1; }
  p:last-child { margin-bottom: 0; }
  label { display: block; margin-bottom: 6px; font-size: 13px; font-weight: 500; }
  input { width: 100%; height: 38px; padding: 0 12px; background: #000; color: #ededed; font-size: 14px;
    border: 1px solid rgba(255,255,255,0.18); border-radius: 6px; }
  input:focus { outline: none; border-color: #7A77F0; }
  button { width: 100%; height: 38px; margin-top: 12px; background: #7A77F0; color: #fff; font-size: 14px;
    font-weight: 500; border: 0; border-radius: 6px; cursor: pointer; }
  button:hover { background: #8E8BF5; }
  .error { margin: 0 0 16px; padding: 10px 12px; font-size: 13px; color: #FF6166;
    border: 1px solid rgba(255,97,102,0.3); background: rgba(255,97,102,0.08); border-radius: 6px; }
</style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function passwordPrompt(wrongPassword: boolean): Response {
  const content = `<h1>Password required</h1>
<p>This page is protected. Enter the password you were given to view it.</p>
${wrongPassword ? '<div class="error">Incorrect password. Try again.</div>' : ''}
<form method="post">
  <label for="password">Password</label>
  <input id="password" name="password" type="password" autocomplete="current-password" required autofocus />
  <button type="submit">View page</button>
</form>`;
  return new Response(shell('Password required', content), {
    status: 401,
    headers: { ...BASE_HEADERS, 'Content-Security-Policy': SHELL_CSP },
  });
}

async function loadPage(id: string) {
  if (!isAdminConfigured()) {
    return { error: messagePage('Unavailable', 'Page hosting is not configured yet.', 503) };
  }
  const page = await getPage(id);
  if (!page) {
    return { error: messagePage('Page not found', 'This link is invalid or the page was removed.', 404) };
  }
  return { page };
}

export async function GET(req: NextRequest, { params }: Context) {
  const { id } = await params;
  const { page, error } = await loadPage(id);
  if (!page) return error;

  if (page.passwordHash && !isUnlocked(page, req.cookies.get(unlockCookieName(id))?.value)) {
    return passwordPrompt(false);
  }

  // Streamed, so the response is not bound by the 4.5 MB function payload limit.
  return new Response(await getPageHtmlStream(page), {
    headers: { ...BASE_HEADERS, 'Content-Security-Policy': PAGE_CSP },
  });
}

export async function POST(req: NextRequest, { params }: Context) {
  const { id } = await params;
  const { page, error } = await loadPage(id);
  if (!page) return error;

  // Back to GET either way, so a refresh never re-submits the form.
  const headers = new Headers({ Location: `/s/${id}`, 'Cache-Control': 'no-store' });
  if (!page.passwordHash) return new Response(null, { status: 303, headers });

  let password: FormDataEntryValue | null = null;
  try {
    password = (await req.formData()).get('password');
  } catch {
    // fall through to the "incorrect password" prompt
  }
  if (typeof password !== 'string' || !checkPassword(page, password)) {
    return passwordPrompt(true);
  }

  headers.set('Set-Cookie', createUnlockCookie(page, req.nextUrl.protocol === 'https:'));
  return new Response(null, { status: 303, headers });
}
