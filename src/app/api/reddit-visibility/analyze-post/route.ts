// ============================================================
// POST /api/reddit-visibility/analyze-post
//
// Pure compute: receives { project, sources, post } from the client,
// builds the analysis prompt, calls DeepSeek with JSON-mode output,
// validates the shape, returns the structured analysis + token usage.
// Client persists the result to Firestore.
//
// Requires env: DEEPSEEK_API_KEY
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  buildAnalysisPrompt,
  ANALYSIS_PROMPT_VERSION,
} from '@/lib/reddit-visibility/prompts';
import type {
  RedditProject,
  RedditSource,
  RedditPost,
  AnalysisDecision,
  AnalysisRisk,
  AnalysisMention,
} from '@/lib/reddit-visibility/types';

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat';

interface DeepSeekResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

interface AnalysisJson {
  decision: AnalysisDecision;
  score: number;
  reason: string;
  relevantSourceIds: string[];
  riskLevel: AnalysisRisk;
  mentionRecommendation: AnalysisMention;
  suggestedAngle: string;
  growthScore?: number;
  growthAngle?: string;
}

function isAnalysisJson(x: unknown): x is AnalysisJson {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    (o.decision === 'reply' || o.decision === 'maybe' || o.decision === 'skip') &&
    typeof o.score === 'number' &&
    typeof o.reason === 'string' &&
    Array.isArray(o.relevantSourceIds) &&
    o.relevantSourceIds.every((s) => typeof s === 'string') &&
    (o.riskLevel === 'low' || o.riskLevel === 'medium' || o.riskLevel === 'high') &&
    (o.mentionRecommendation === 'yes' ||
      o.mentionRecommendation === 'soft' ||
      o.mentionRecommendation === 'no') &&
    typeof o.suggestedAngle === 'string'
  );
}

// Client sends Dates as ISO strings; rehydrate just the one field we use.
function rehydratePost(raw: unknown): RedditPost {
  const r = raw as Record<string, unknown>;
  return {
    ...(r as unknown as RedditPost),
    createdAtReddit: new Date(r.createdAtReddit as string),
  };
}

export async function POST(req: NextRequest) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) {
    return NextResponse.json(
      {
        error:
          'DeepSeek key not configured. Set DEEPSEEK_API_KEY in .env.local and restart the dev server.',
      },
      { status: 503 }
    );
  }

  let body: { project?: RedditProject; sources?: RedditSource[]; post?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body.project || !Array.isArray(body.sources) || !body.post) {
    return NextResponse.json(
      { error: 'Missing project, sources, or post' },
      { status: 400 }
    );
  }

  const post = rehydratePost(body.post);
  const { system, user } = buildAnalysisPrompt(body.project, body.sources, post);

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
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 800,
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
    return NextResponse.json(
      { error: 'DeepSeek returned no content' },
      { status: 502 }
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return NextResponse.json(
      { error: 'DeepSeek output was not valid JSON', raw: content.slice(0, 500) },
      { status: 502 }
    );
  }

  if (!isAnalysisJson(parsed)) {
    return NextResponse.json(
      { error: 'DeepSeek output did not match the analysis schema', raw: parsed },
      { status: 502 }
    );
  }

  // Clamp score into 1..100 (model occasionally goes outside)
  const score = Math.max(1, Math.min(100, Math.round(parsed.score)));
  // Growth fields are lenient: default rather than fail if the model omits them.
  const growthScore =
    typeof parsed.growthScore === 'number'
      ? Math.max(1, Math.min(100, Math.round(parsed.growthScore)))
      : 0;
  const growthAngle = typeof parsed.growthAngle === 'string' ? parsed.growthAngle : '';

  return NextResponse.json({
    analysis: {
      ...parsed,
      score,
      growthScore,
      growthAngle,
    },
    meta: {
      model: DEEPSEEK_MODEL,
      promptVersion: ANALYSIS_PROMPT_VERSION,
      inputTokens: json.usage?.prompt_tokens ?? 0,
      outputTokens: json.usage?.completion_tokens ?? 0,
    },
  });
}
