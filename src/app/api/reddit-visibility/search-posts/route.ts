// ============================================================
// POST /api/reddit-visibility/search-posts
//
// Like fetch-posts but uses Reddit's per-subreddit search RSS
// (/r/<sub>/search.rss?q=...&restrict_sr=1&sort=new) to surface
// posts matching a keyword set. Same Atom parser as /new/.rss.
// Returns the same NormalizedRedditPost shape so the client
// can persist via saveFetchedPosts unchanged.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import type { NormalizedRedditPost } from '@/lib/reddit-visibility/types';
import { runThrottled } from '@/lib/reddit-visibility/throttle';
import { fetchWithRetry } from '@/lib/reddit-visibility/redditFetch';

// Browser-like UA: Reddit throttles obvious bot agents far harder than normal
// browser traffic on the unauthenticated RSS feeds.
const REDDIT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

function decodeEntitiesOnce(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, '&');
}

function decodeEntities(s: string): string {
  let prev = s;
  for (let i = 0; i < 4; i++) {
    const next = decodeEntitiesOnce(prev);
    if (next === prev) return next;
    prev = next;
  }
  return prev;
}

function stripHtml(html: string): string {
  const decoded = decodeEntities(html);
  return decoded
    .replace(/<!--\s*SC_O(?:FF|N)\s*-->/g, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\[link\]|\[comments\]/g, '')
    .replace(/submitted by\s*\/u\/[\w-]+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extract(s: string, regex: RegExp): string {
  const m = s.match(regex);
  return m ? m[1] : '';
}

interface RawEntry {
  redditPostId: string;
  subreddit: string;
  title: string;
  body: string;
  author: string;
  url: string;
  permalink: string;
  isSelfPost: boolean;
  score: number;
  numComments: number;
  createdAtRedditMs: number;
}

function parseAtomFeed(xml: string, fallbackSub: string): RawEntry[] {
  const entries: RawEntry[] = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let m: RegExpExecArray | null;

  while ((m = entryRegex.exec(xml)) !== null) {
    const e = m[1];
    const idRaw = extract(e, /<id>([^<]+)<\/id>/);
    const idMatch =
      idRaw.match(/t3_([a-z0-9]+)/i) || idRaw.match(/\/comments\/([a-z0-9]+)/i);
    const redditPostId = idMatch ? idMatch[1] : '';
    if (!redditPostId) continue;

    const title = decodeEntities(extract(e, /<title[^>]*>([\s\S]*?)<\/title>/));
    const linkHref = extract(e, /<link[^>]*href="([^"]+)"/);
    const author = extract(e, /<author>[\s\S]*?<name>([^<]+)<\/name>/).replace(/^\/u\//, '');
    const published = extract(e, /<published>([^<]+)<\/published>/);
    const category = extract(e, /<category[^>]*term="([^"]+)"/);
    const contentRaw = extract(e, /<content[^>]*>([\s\S]*?)<\/content>/);
    const body = stripHtml(contentRaw);

    entries.push({
      redditPostId,
      subreddit: category || fallbackSub,
      title,
      body,
      author: author || '[deleted]',
      url: linkHref,
      permalink: linkHref,
      isSelfPost: true,
      score: 0,
      numComments: 0,
      createdAtRedditMs: published ? new Date(published).getTime() : 0,
    });
  }
  return entries;
}

function buildSearchQuery(keywords: string[]): string {
  // Quote multi-word phrases, leave single tokens bare. Join with OR.
  const parts = keywords
    .map((k) => k.trim())
    .filter(Boolean)
    .map((k) => (k.includes(' ') ? `"${k.replace(/"/g, '')}"` : k));
  return parts.join(' OR ');
}

async function searchSubreddit(
  subreddit: string,
  keywords: string[],
  limit: number
): Promise<NormalizedRedditPost[]> {
  const cleaned = subreddit.replace(/^\/?r\//i, '');
  const q = buildSearchQuery(keywords);
  const url =
    `https://www.reddit.com/r/${encodeURIComponent(cleaned)}/search.rss` +
    `?q=${encodeURIComponent(q)}&restrict_sr=1&sort=relevance&limit=${limit}`;

  // Reddit's search.rss WAF rejects bare Node-fetch requests with 403 even
  // though the same URL via curl returns 200. Sending a more browser-like
  // header set gets us past it.
  const res = await fetchWithRetry(url, {
    headers: {
      'User-Agent': REDDIT_USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/atom+xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`r/${cleaned}: HTTP ${res.status}`);
  }
  const xml = await res.text();
  return parseAtomFeed(xml, cleaned);
}

export async function POST(req: NextRequest) {
  let body: { subreddits?: unknown; keywords?: unknown; limit?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const subreddits = Array.isArray(body.subreddits)
    ? body.subreddits.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    : [];
  const keywords = Array.isArray(body.keywords)
    ? body.keywords.filter((k): k is string => typeof k === 'string' && k.trim().length > 0)
    : [];
  const limit =
    typeof body.limit === 'number' && body.limit > 0 && body.limit <= 100
      ? Math.floor(body.limit)
      : 25;

  if (subreddits.length === 0) {
    return NextResponse.json({ error: 'No subreddits provided' }, { status: 400 });
  }
  if (keywords.length === 0) {
    return NextResponse.json({ error: 'No keywords provided' }, { status: 400 });
  }
  if (subreddits.length > 20) {
    return NextResponse.json({ error: 'Too many subreddits (max 20)' }, { status: 400 });
  }
  if (keywords.length > 15) {
    return NextResponse.json({ error: 'Too many keywords (max 15)' }, { status: 400 });
  }

  const results = await runThrottled(subreddits, (s) => searchSubreddit(s, keywords, limit));

  const posts: NormalizedRedditPost[] = [];
  const errors: { subreddit: string; message: string }[] = [];
  const hitsBySubreddit: Record<string, number> = {};

  results.forEach((r, i) => {
    const sub = subreddits[i];
    if (r.status === 'fulfilled') {
      posts.push(...r.value);
      hitsBySubreddit[sub] = r.value.length;
    } else {
      errors.push({
        subreddit: sub,
        message: r.reason instanceof Error ? r.reason.message : String(r.reason),
      });
      hitsBySubreddit[sub] = 0;
    }
  });

  const seen = new Set<string>();
  const unique = posts.filter((p) => {
    if (seen.has(p.redditPostId)) return false;
    seen.add(p.redditPostId);
    return true;
  });

  return NextResponse.json({
    posts: unique,
    errors,
    hitsBySubreddit,
    query: buildSearchQuery(keywords),
  });
}
