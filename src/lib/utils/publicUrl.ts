// Base URL for links that are handed to other people (invitations, hosted
// pages). Always Studio's own domain, never the address the admin happens to
// be browsing: Vercel's per-branch and per-deployment URLs sit behind Vercel's
// own login, so links built from those are unusable for anyone outside the team.
//
// NEXT_PUBLIC_SITE_URL overrides the domain without a code change.

const STUDIO_URL = 'https://studio.motherlink.io';

function productionUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || STUDIO_URL).replace(/\/+$/, '');
}

/** Client-side. Local development keeps its own origin so links can be tested. */
export function publicBaseUrl(): string {
  const { origin, hostname } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return origin;
  return productionUrl();
}

/** Server-side. */
export function serverPublicBaseUrl(): string {
  return productionUrl();
}
