// ============================================================
// HTML Hosting — shared types & limits (client + server safe)
// ============================================================

export const HTML_HOSTING_FEATURE_SLUG = 'html-hosting';

// Largest HTML file that can be hosted (uncompressed).
export const MAX_HTML_BYTES = 25 * 1024 * 1024;

// Vercel rejects function request bodies over 4.5 MB on every plan, so the
// browser gzips the file and uploads it in parts of at most this size. Parts
// are kept small so upload progress can be reported in fine steps.
export const UPLOAD_PART_BYTES = 700 * 1024;

// Custom link names: /s/{slug}
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,58})[a-z0-9]$/;
export const SLUG_HINT = '3–60 characters: lowercase letters, numbers and hyphens';

export const MIN_PASSWORD_LENGTH = 4;
export const MAX_PASSWORD_LENGTH = 200;

/** What the API returns. Password material never leaves the server. */
export interface HostedPage {
  id: string;
  /** Last part of the public link: the custom slug if one is set, otherwise the id. */
  urlKey: string;
  /** The custom slug, or null while the page uses its default random link. */
  slug: string | null;
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
export function hostedPagePath(urlKey: string): string {
  return `/s/${urlKey}`;
}
