// ============================================================
// POST /api/reddit-visibility/generate-draft
//
// Takes { project, sources, post, analysis } and calls DeepSeek
// (plain text, not JSON mode) to produce a reply draft body.
// Client persists to Firestore.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  buildDraftPrompt,
  DRAFT_PROMPT_VERSION,
} from '@/lib/reddit-visibility/prompts';
import type {
  RedditProject,
  RedditSource,
  RedditPost,
  RedditOpportunityAnalysis,
} from '@/lib/reddit-visibility/types';

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat';

interface DeepSeekResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

function rehydratePost(raw: unknown): RedditPost {
  const r = raw as Record<string, unknown>;
  return {
    ...(r as unknown as RedditPost),
    createdAtReddit: new Date(r.createdAtReddit as string),
  };
}

function rehydrateAnalysis(raw: unknown): RedditOpportunityAnalysis {
  const r = raw as Record<string, unknown>;
  return {
    ...(r as unknown as RedditOpportunityAnalysis),
    createdAt: new Date(r.createdAt as string),
  };
}

// Strip common leftover wrappers the model sometimes adds despite the prompt.
function cleanDraft(s: string): string {
  let out = s.trim();
  // Strip surrounding markdown code fences
  if (out.startsWith('```')) {
    out = out.replace(/^```[a-z]*\n?/, '').replace(/\n?```\s*$/, '').trim();
  }
  // Strip surrounding quotes
  if ((out.startsWith('"') && out.endsWith('"')) || (out.startsWith('“') && out.endsWith('”'))) {
    out = out.slice(1, -1).trim();
  }
  return out;
}

export async function POST(req: NextRequest) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: 'DEEPSEEK_API_KEY not configured.' },
      { status: 503 }
    );
  }

  let body: {
    project?: RedditProject;
    sources?: RedditSource[];
    post?: unknown;
    analysis?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body.project || !Array.isArray(body.sources) || !body.post || !body.analysis) {
    return NextResponse.json(
      { error: 'Missing project, sources, post, or analysis' },
      { status: 400 }
    );
  }

  const post = rehydratePost(body.post);
  const analysis = rehydrateAnalysis(body.analysis);

  // Allow drafting for either a brand opportunity (mention fits) or a growth
  // opportunity (good value reply, no mention) — even when the brand decision
  // is "skip". Block only when it's neither.
  const isBrand =
    analysis.decision !== 'skip' &&
    (analysis.mentionRecommendation === 'yes' || analysis.mentionRecommendation === 'soft');
  const isGrowth = analysis.mentionRecommendation === 'no' && (analysis.growthScore ?? 0) >= 40;
  if (!isBrand && !isGrowth) {
    return NextResponse.json(
      { error: 'This post is neither a brand nor a growth opportunity.' },
      { status: 400 }
    );
  }

  const { system, user } = buildDraftPrompt(body.project, body.sources, post, analysis);

  let dsRes: Response;
  try {
    dsRes = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
    });
  } catch (err) {
    return NextResponse.json(
      { error: `DeepSeek request failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 }
    );
  }

  if (!dsRes.ok) {
    const text = await dsRes.text().catch(() => '');
    return NextResponse.json(
      { error: `DeepSeek returned ${dsRes.status}: ${text.slice(0, 300)}` },
      { status: 502 }
    );
  }

  const json = (await dsRes.json()) as DeepSeekResponse;
  const content = json.choices?.[0]?.message?.content;
  if (!content) {
    return NextResponse.json({ error: 'DeepSeek returned no content' }, { status: 502 });
  }

  return NextResponse.json({
    draft: cleanDraft(content),
    meta: {
      model: DEEPSEEK_MODEL,
      promptVersion: DRAFT_PROMPT_VERSION,
      inputTokens: json.usage?.prompt_tokens ?? 0,
      outputTokens: json.usage?.completion_tokens ?? 0,
    },
  });
}
