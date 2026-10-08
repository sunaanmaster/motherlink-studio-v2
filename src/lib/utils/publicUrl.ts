// Base URL for links that are handed to other people (invitations, hosted
// pages). Always the production domain: Vercel's per-branch and
// per-deployment URLs sit behind Vercel's own login, so a link copied while
// browsing one of those would be unusable for anyone outside the team.

function productionUrl(): string | null {
  const vercelDomain =
    process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercelDomain) return `https://${vercelDomain}`;
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '') || null;
}

/** Client-side: falls back to the current origin (and always uses it on localhost). */
export function publicBaseUrl(): string {
  const { origin, hostname } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return origin;
  return productionUrl() || origin;
}

/** Server-side. */
export function serverPublicBaseUrl(): string {
  return productionUrl() || 'https://motherlink.io';
}
