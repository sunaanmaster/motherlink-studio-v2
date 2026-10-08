// ============================================================
// HTML Hosting — shared types & limits (client + server safe)
// ============================================================

export const HTML_HOSTING_FEATURE_SLUG = 'html-hosting';

// Largest HTML file that can be hosted (uncompressed).
export const MAX_HTML_BYTES = 25 * 1024 * 1024;

// Vercel rejects function request bodies over 4.5 MB on every plan, so the
// browser gzips the file and uploads it in parts of at most this size.
export const UPLOAD_PART_BYTES = 3 * 1024 * 1024;

export const MIN_PASSWORD_LENGTH = 4;
export const MAX_PASSWORD_LENGTH = 200;

/** What the API returns. Password material never leaves the server. */
export interface HostedPage {
  id: string;
  title: string;
  fileName: string;
  sizeBytes: number;
  hasPassword: boolean;
  ownerUid: string;
  ownerName: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  /** Whether the caller may edit/delete this page (owner or admin). */
  canManage: boolean;
}

/** Public path a hosted page is served from. */
export function hostedPagePath(id: string): string {
  return `/s/${id}`;
}
