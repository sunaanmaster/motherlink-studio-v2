// ============================================================
// POST /api/reddit-visibility/fetch-posts
//
// Reddit blocks the JSON endpoints for our network (server + browser)
// but allows the RSS feeds. So we fetch /r/<sub>/new/.rss server-side
// and parse the Atom XML into the same NormalizedRedditPost shape.
// No Reddit auth required.
//
// Caveat: RSS doesn't include score / num_comments / is_self reliably.
// We default score=0 and numComments=0; downstream UI hides 0 metrics.
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
  // Reddit RSS double-encodes (XML-wrapped HTML), so iterate until stable.
  let prev = s;
  for (let i = 0; i < 4; i++) {
    const next = decodeEntitiesOnce(prev);
    if (next === prev) return next;
    prev = next;
  }
  return prev;
}

function stripHtml(html: string): string {
  // Reddit's <content type="html"> body is entity-encoded — decode first
  // so tags become real `<...>`, then strip. Also drop SC_OFF/SC_ON comments,
  // the trailing vote/links/comments anchors, and Reddit's "submitted by" footer.
  const decoded = decodeEntities(html);
  return decoded
    .replace(/<!--\s*SC_O(?:FF|N)\s*-->/g, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\[link\]|\[comments\]/g, '')
    .replace(/submitted by\s*\/u\/[\w-]+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extract(source: string, regex: RegExp): string {
  const m = source.match(regex);
  return m ? m[1] : '';
}

function parseAtomFeed(xml: string, fallbackSub: string): NormalizedRedditPost[] {
  const entries: NormalizedRedditPost[] = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let m: RegExpExecArray | null;

  while ((m = entryRegex.exec(xml)) !== null) {
    const e = m[1];

    // Reddit's <id> is like "tag:reddit.com,2008:/r/sub/comments/abc123/..."
    // or sometimes just "t3_abc123". Extract the 5-7 char post id either way.
    const idRaw = extract(e, /<id>([^<]+)<\/id>/);
    const idMatch =
      idRaw.match(/t3_([a-z0-9]+)/i) ||
      idRaw.match(/\/comments\/([a-z0-9]+)/i);
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
      isSelfPost: true, // RSS doesn't reliably expose this; default true
      score: 0,
      numComments: 0,
      createdAtRedditMs: published ? new Date(published).getTime() : 0,
    });
  }
  return entries;
}

async function fetchSubredditRss(
  subreddit: string,
  limit: number
): Promise<NormalizedRedditPost[]> {
  const cleaned = subreddit.replace(/^\/?r\//i, '');
  const url = `https://www.reddit.com/r/${encodeURIComponent(cleaned)}/new/.rss?limit=${limit}`;
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
  let body: { subreddits?: unknown; limit?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const subreddits = Array.isArray(body.subreddits)
    ? body.subreddits.filter(
        (s): s is string => typeof s === 'string' && s.trim().length > 0
      )
    : [];
  const limit =
    typeof body.limit === 'number' && body.limit > 0 && body.limit <= 100
      ? Math.floor(body.limit)
      : 25;

  if (subreddits.length === 0) {
    return NextResponse.json({ error: 'No subreddits provided' }, { status: 400 });
  }
  if (subreddits.length > 20) {
    return NextResponse.json({ error: 'Too many subreddits (max 20)' }, { status: 400 });
  }

  const results = await runThrottled(subreddits, (s) => fetchSubredditRss(s, limit));

  const posts: NormalizedRedditPost[] = [];
  const errors: { subreddit: string; message: string }[] = [];

  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      posts.push(...r.value);
    } else {
      errors.push({
        subreddit: subreddits[i],
        message: r.reason instanceof Error ? r.reason.message : String(r.reason),
      });
    }
  });

  const seen = new Set<string>();
  const unique = posts.filter((p) => {
    if (seen.has(p.redditPostId)) return false;
    seen.add(p.redditPostId);
    return true;
  });

  return NextResponse.json({ posts: unique, errors });
}
