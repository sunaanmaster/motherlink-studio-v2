'use client';

// ============================================================
// Opportunities — fetched Reddit posts + DeepSeek analysis
// ============================================================

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Search,
  RefreshCw,
  ExternalLink,
  MessageCircle,
  ArrowUp,
  AlertCircle,
  Sparkles,
  ChevronDown,
  ChevronUp,
  PenTool,
  Copy,
  CheckCircle2,
  X,
  Star,
  Send,
  Users,
} from 'lucide-react';
import { useAuth } from '@/lib/context/AuthContext';
import {
  getProject,
  listPostsByProject,
  saveFetchedPosts,
  listSources,
  listAnalysesByProject,
  createAnalysis,
  updatePostStatus,
  listDraftsByProject,
  createDraft,
  updateDraftStatus,
  setPostFavorite,
  purgeUnkeptPosts,
  listAccounts,
  accountPostGate,
  createPostJob,
  subscribePostJob,
} from '@/lib/reddit-visibility/firestore';
import { fetchAllSubreddits, searchSubreddits } from '@/lib/reddit-visibility/redditClient';
import { sleep } from '@/lib/reddit-visibility/throttle';
import { writeActivityLog } from '@/lib/firebase/firestore';
import { LogAction, LogSeverity } from '@/lib/types';
import type {
  RedditProject,
  RedditPost,
  RedditSource,
  RedditOpportunityAnalysis,
  RedditDraft,
  RedditAccount,
  AnalysisDecision,
  AnalysisRisk,
} from '@/lib/reddit-visibility/types';

function relativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function statusBadge(status: string) {
  const styles: Record<string, { bg: string; color: string }> = {
    fetched: { bg: 'var(--surface-2)', color: 'var(--text-muted)' },
    analyzed: { bg: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6' },
    drafted: { bg: 'rgba(124, 58, 237, 0.15)', color: 'var(--primary-light)' },
    skipped: { bg: 'rgba(245, 158, 11, 0.15)', color: 'var(--warning)' },
    archived: { bg: 'var(--surface-2)', color: 'var(--text-dim)' },
  };
  const s = styles[status] ?? styles.fetched;
  return (
    <span className="badge" style={{ background: s.bg, color: s.color, fontSize: '0.6875rem' }}>
      {status.toUpperCase()}
    </span>
  );
}

function decisionStyle(decision: AnalysisDecision) {
  switch (decision) {
    case 'reply': return { bg: 'rgba(16, 185, 129, 0.18)', color: '#10b981' };
    case 'maybe': return { bg: 'rgba(245, 158, 11, 0.18)', color: 'var(--warning)' };
    case 'skip':  return { bg: 'rgba(239, 68, 68, 0.18)', color: 'var(--error)' };
  }
}

function riskStyle(risk: AnalysisRisk) {
  switch (risk) {
    case 'low':    return { bg: 'rgba(16, 185, 129, 0.12)', color: '#10b981' };
    case 'medium': return { bg: 'rgba(245, 158, 11, 0.12)', color: 'var(--warning)' };
    case 'high':   return { bg: 'rgba(239, 68, 68, 0.12)', color: 'var(--error)' };
  }
}

export default function OpportunitiesPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { userProfile, userRole } = useAuth();

  const [project, setProject] = useState<RedditProject | null>(null);
  const [posts, setPosts] = useState<RedditPost[] | null>(null);
  const [sources, setSources] = useState<RedditSource[]>([]);
  const [analyses, setAnalyses] = useState<RedditOpportunityAnalysis[]>([]);

  const [fetching, setFetching] = useState(false);
  const [fetchProgress, setFetchProgress] = useState<{ done: number; total: number; current: string } | null>(null);
  // Cooperative stop flags for the Fetch and Analyze loops (refs so the running
  // loop sees the change without waiting for a re-render).
  const fetchStop = useRef(false);
  const analyzeStop = useRef(false);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchKeywordsInput, setSearchKeywordsInput] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState<{ done: number; total: number } | null>(null);
  const [reanalyzingPostId, setReanalyzingPostId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'brand' | 'growth' | 'unanalyzed' | 'search'>('all');
  const [qualityFilter, setQualityFilter] = useState<'any' | 'best' | 'good' | 'okay'>('any');
  const [lastSearchPostIds, setLastSearchPostIds] = useState<string[] | null>(null);
  const [lastSearchKeywords, setLastSearchKeywords] = useState<string>('');
  const [lastSeenCutoff, setLastSeenCutoff] = useState<number>(0);
  const [lastSearchInfo, setLastSearchInfo] = useState<{
    query: string;
    hitsBySubreddit: Record<string, number>;
  } | null>(null);
  const [drafts, setDrafts] = useState<RedditDraft[]>([]);
  const [draftingPostId, setDraftingPostId] = useState<string | null>(null);
  const [copiedDraftId, setCopiedDraftId] = useState<string | null>(null);
  // Reply-from-tool: posting accounts + which draft's account picker is open +
  // per-draft in-flight job state (queued/posting), driven by the local agent
  // via a Firestore subscription.
  const [accounts, setAccounts] = useState<RedditAccount[]>([]);
  const [pickerDraftId, setPickerDraftId] = useState<string | null>(null);
  const [inFlight, setInFlight] = useState<Record<string, 'queued' | 'posting'>>({});
  const jobUnsubs = useRef<Record<string, () => void>>({});

  useEffect(() => {
    const subs = jobUnsubs.current;
    return () => {
      Object.values(subs).forEach((fn) => fn());
    };
  }, []);

  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetchErrors, setFetchErrors] = useState<{ subreddit: string; message: string }[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!projectId) return;
    // Snapshot the lastSeen cutoff once per session so newly-fetched posts
    // stay highlighted until the user explicitly marks them seen.
    const stored = localStorage.getItem(`reddit-visibility:lastSeen:${projectId}`);
    setLastSeenCutoff(stored ? parseInt(stored, 10) : 0);

    getProject(projectId).then(setProject);
    listPostsByProject(projectId)
      .then(setPosts)
      .catch((err) => {
        console.error('listPostsByProject failed:', err);
        setPosts([]);
        setError(err instanceof Error ? err.message : String(err));
      });
    listSources(projectId).then(setSources).catch(console.error);
    listAnalysesByProject(projectId).then(setAnalyses).catch(console.error);
    listDraftsByProject(projectId).then(setDrafts).catch(console.error);
    listAccounts().then(setAccounts).catch(console.error);
  }, [projectId]);

  const handleMarkAllSeen = () => {
    const now = Date.now();
    localStorage.setItem(`reddit-visibility:lastSeen:${projectId}`, String(now));
    setLastSeenCutoff(now);
  };

  // On the very first fetch/search of a project, set the cutoff to right
  // before this action so the arriving posts get marked NEW. After that,
  // only "Mark all seen" advances the cutoff.
  const ensureCutoffBaseline = () => {
    if (lastSeenCutoff > 0) return;
    const cutoff = Date.now() - 5000; // 5s buffer for client/server clock skew
    localStorage.setItem(`reddit-visibility:lastSeen:${projectId}`, String(cutoff));
    setLastSeenCutoff(cutoff);
  };

  const isNew = (post: RedditPost) =>
    lastSeenCutoff > 0 && post.fetchedAt.getTime() > lastSeenCutoff;

  // Latest non-rejected draft per post
  const draftByPostId = useMemo(() => {
    const map = new Map<string, RedditDraft>();
    for (const d of drafts) {
      if (d.status === 'rejected') continue;
      const existing = map.get(d.postId);
      if (!existing || existing.createdAt < d.createdAt) {
        map.set(d.postId, d);
      }
    }
    return map;
  }, [drafts]);

  // Any post id that has ever been answered (has a status='posted' draft).
  // This set survives history cleanup because posted drafts are kept on cleanup,
  // so if the same Reddit post is re-fetched later it still gets the ANSWERED tag.
  const answeredPostIds = useMemo(() => {
    const set = new Set<string>();
    for (const d of drafts) {
      if (d.status === 'posted') set.add(d.postId);
    }
    return set;
  }, [drafts]);

  // Latest analysis per post id
  const analysisByPostId = useMemo(() => {
    const map = new Map<string, RedditOpportunityAnalysis>();
    for (const a of analyses) {
      const existing = map.get(a.postId);
      if (!existing || existing.createdAt < a.createdAt) {
        map.set(a.postId, a);
      }
    }
    return map;
  }, [analyses]);

  // Mutually-exclusive buckets, split by whether a brand mention fits:
  //  Brand  = a mention is appropriate (yes/soft)  -> drafts MAY mention.
  //  Growth = a mention is NOT appropriate (no) but it's still a strong
  //           value/karma reply opportunity            -> drafts NEVER mention.
  // A post is one or the other (or neither), never both — so generating from
  // Growth can't insert the company name.
  const GROWTH_MIN = 40; // floor to count as a real value opportunity
  const isBrandPost = (a?: RedditOpportunityAnalysis) =>
    !!a && a.decision !== 'skip' && (a.mentionRecommendation === 'yes' || a.mentionRecommendation === 'soft');
  const isGrowthPost = (a?: RedditOpportunityAnalysis) =>
    !!a && a.mentionRecommendation === 'no' && (a.growthScore ?? 0) >= GROWTH_MIN;
  // Quality of a post within its bucket: brand relevance for Brand, growth score
  // for Growth (0 if it's in neither bucket).
  const postQuality = (a?: RedditOpportunityAnalysis) =>
    isBrandPost(a) ? a?.score ?? 0 : isGrowthPost(a) ? a?.growthScore ?? 0 : 0;
  // Quality-floor filter applied inside Brand / Growth.
  const QUALITY_FLOOR: Record<string, number> = { any: 0, best: 75, good: 60, okay: 40 };

  const counts = useMemo(() => {
    const c = { brand: 0, growth: 0, unanalyzed: 0, search: 0 };
    const searchSet = lastSearchPostIds ? new Set(lastSearchPostIds) : null;
    for (const p of posts ?? []) {
      const a = analysisByPostId.get(p.postId);
      if (!a) c.unanalyzed++;
      if (isBrandPost(a)) c.brand++;
      if (isGrowthPost(a)) c.growth++;
      if (searchSet && searchSet.has(p.postId)) c.search++;
    }
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts, analysisByPostId, lastSearchPostIds]);

  const visiblePosts = useMemo(() => {
    if (!posts) return null;
    if (filter === 'all') return posts;
    if (filter === 'search') {
      if (!lastSearchPostIds) return [];
      const searchSet = new Set(lastSearchPostIds);
      return posts.filter((p) => searchSet.has(p.postId));
    }
    if (filter === 'unanalyzed') return posts.filter((p) => !analysisByPostId.get(p.postId));
    // Brand / Growth: apply the quality floor, surface best-first.
    if (filter === 'brand' || filter === 'growth') {
      const floor = QUALITY_FLOOR[qualityFilter] ?? 0;
      const inBucket = filter === 'brand' ? isBrandPost : isGrowthPost;
      return posts
        .filter((p) => {
          const a = analysisByPostId.get(p.postId);
          return inBucket(a) && postQuality(a) >= floor;
        })
        .sort(
          (x, y) =>
            postQuality(analysisByPostId.get(y.postId)) - postQuality(analysisByPostId.get(x.postId))
        );
    }
    return posts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts, analysisByPostId, filter, qualityFilter, lastSearchPostIds]);

  // Posts that the Analyze button will actually process: visible AND unanalyzed.
  // This way Analyze respects the active filter (e.g. "search results").
  const analyzableInView = useMemo(
    () => (visiblePosts ?? []).filter((p) => !analysisByPostId.has(p.postId)),
    [visiblePosts, analysisByPostId]
  );

  const openSearchPanel = () => {
    if (!project) return;
    // Pre-fill with project's saved keywords on first open
    if (!searchOpen && searchKeywordsInput.trim() === '') {
      setSearchKeywordsInput(project.keywords.join(', '));
    }
    setSearchOpen((v) => !v);
  };

  const handleSearch = async () => {
    if (!project || !userProfile || !userRole) return;
    const keywords = searchKeywordsInput
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
    if (project.targetSubreddits.length === 0 || keywords.length === 0) return;

    ensureCutoffBaseline();
    setSearching(true);
    setFeedback(null);
    setError(null);
    setFetchErrors([]);
    setLastSearchInfo(null);

    try {
      const data = await searchSubreddits(project.targetSubreddits, keywords, 25);
      setFetchErrors(data.errors);
      setLastSearchInfo({ query: data.query, hitsBySubreddit: data.hitsBySubreddit });
      const saved = await saveFetchedPosts(projectId, data.posts);

      // Capture the result set so we can filter to "Search results"
      // regardless of whether each post was newly saved or a duplicate.
      const resultPostIds = data.posts.map((p) => `${projectId}_${p.redditPostId}`);
      // Same clean-slate rule as Fetch: keep this result set, favorites, and
      // posts with drafts; erase the rest. Skip on an empty result so a search
      // that matched nothing doesn't wipe the board.
      const purged =
        resultPostIds.length > 0
          ? await purgeUnkeptPosts(projectId, resultPostIds)
          : { deletedPosts: 0, deletedAnalyses: 0, keptFavorites: 0, keptDrafted: 0 };
      if (resultPostIds.length > 0) {
        setLastSearchPostIds(resultPostIds);
        setLastSearchKeywords(keywords.join(', '));
        setFilter('search');
      }

      await writeActivityLog(
        userProfile.uid,
        userProfile.email,
        userRole.slug,
        LogAction.REDDIT_POSTS_FETCHED,
        'reddit_project',
        projectId,
        project.name,
        {
          method: 'search',
          subreddits: project.targetSubreddits,
          keywords,
          fetched: data.posts.length,
          created: saved.created,
          skipped: saved.skipped,
          errors: data.errors,
        },
        data.errors.length > 0 ? LogSeverity.WARNING : LogSeverity.INFO
      );

      const fresh = await listPostsByProject(projectId);
      setPosts(fresh);

      const bits: string[] = [];
      if (saved.created > 0) bits.push(`${saved.created} new`);
      if (saved.skipped > 0) bits.push(`${saved.skipped} already saved`);
      if (purged.deletedPosts > 0) bits.push(`${purged.deletedPosts} old cleared`);
      if (data.errors.length > 0) bits.push(`${data.errors.length} subreddit error`);
      const subBits = bits.length > 0 ? ` (${bits.join(', ')})` : '';
      setFeedback(
        data.posts.length > 0
          ? `Search returned ${data.posts.length} matching post${data.posts.length === 1 ? '' : 's'}${subBits}. Showing the result set below.`
          : `Search returned 0 matching posts${subBits}. Try broader keywords or different subreddits.`
      );
      setSearchOpen(false);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Search failed.');
    } finally {
      setSearching(false);
    }
  };

  // One subreddit at a time with a short jittered gap. The residential proxy
  // gives each request a fresh exit IP, so one run can fetch every subreddit.
  const RSS_GAP_MIN_MS = 800;
  const RSS_GAP_JITTER_MS = 700; // 0.8–1.5s, randomized

  const handleFetch = async () => {
    if (!project || !userProfile || !userRole) return;
    if (project.targetSubreddits.length === 0) return;
    ensureCutoffBaseline();
    fetchStop.current = false;
    setFetching(true);
    setFeedback(null);
    setError(null);
    setFetchErrors([]);
    setLastSearchPostIds(null);
    setLastSearchKeywords('');
    if (filter === 'search') setFilter('all');

    const subs = project.targetSubreddits;
    const allErrors: { subreddit: string; message: string }[] = [];
    const resultPostIds: string[] = [];
    const successfulSubs: string[] = []; // subs that returned posts this run
    let totalFetched = 0;
    let totalCreated = 0;
    let totalSkipped = 0;
    let stopped = false;

    try {
      for (let i = 0; i < subs.length; i++) {
        if (fetchStop.current) { stopped = true; break; }
        if (i > 0) await sleep(RSS_GAP_MIN_MS + Math.floor(Math.random() * RSS_GAP_JITTER_MS));
        if (fetchStop.current) { stopped = true; break; }
        const sub = subs[i];
        setFetchProgress({ done: i, total: subs.length, current: sub });
        try {
          const data = await fetchAllSubreddits([sub], 25);
          allErrors.push(...data.errors);
          if (data.posts.length > 0) {
            const saved = await saveFetchedPosts(projectId, data.posts);
            totalCreated += saved.created;
            totalSkipped += saved.skipped;
            totalFetched += data.posts.length;
            successfulSubs.push(sub);
            resultPostIds.push(...data.posts.map((p) => `${projectId}_${p.redditPostId}`));
            const fresh = await listPostsByProject(projectId);
            setPosts(fresh);
          }
        } catch (err) {
          allErrors.push({
            subreddit: sub,
            message: err instanceof Error ? err.message : String(err),
          });
        }
        setFetchProgress({ done: i + 1, total: subs.length, current: sub });
        setFetchErrors([...allErrors]);
      }

      // Purge scoped to subs that SUCCEEDED this run: refresh-in-place, never
      // wipe a sub that errored or that we never reached (when stopped early).
      const purged =
        successfulSubs.length > 0
          ? await purgeUnkeptPosts(projectId, resultPostIds, { onlySubreddits: successfulSubs })
          : { deletedPosts: 0, deletedAnalyses: 0, keptFavorites: 0, keptDrafted: 0 };

      const fresh = await listPostsByProject(projectId);
      setPosts(fresh);

      await writeActivityLog(
        userProfile.uid,
        userProfile.email,
        userRole.slug,
        LogAction.REDDIT_POSTS_FETCHED,
        'reddit_project',
        projectId,
        project.name,
        {
          method: 'rss',
          stopped,
          subreddits: successfulSubs,
          fetched: totalFetched,
          created: totalCreated,
          skipped: totalSkipped,
          errors: allErrors,
        },
        allErrors.length > 0 ? LogSeverity.WARNING : LogSeverity.INFO
      );

      const bits = [`${totalCreated} new`];
      if (totalSkipped > 0) bits.push(`${totalSkipped} duplicate`);
      if (purged.deletedPosts > 0) bits.push(`${purged.deletedPosts} old cleared`);
      const keptBits: string[] = [];
      if (purged.keptFavorites > 0) keptBits.push(`${purged.keptFavorites} favorite${purged.keptFavorites === 1 ? '' : 's'}`);
      if (purged.keptDrafted > 0) keptBits.push(`${purged.keptDrafted} with drafts`);
      if (keptBits.length > 0) bits.push(`kept ${keptBits.join(' + ')}`);
      if (allErrors.length > 0) bits.push(`${allErrors.length} subreddit error`);
      setFeedback(
        `${stopped ? 'Stopped early. ' : ''}Fetched ${totalFetched} post${totalFetched === 1 ? '' : 's'} from ${successfulSubs.length}/${subs.length} subreddits: ${bits.join(', ')}.`
      );
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Fetch failed.');
    } finally {
      setFetchProgress(null);
      setFetching(false);
    }
  };

  // Shared per-post analyze. Calls the API, persists, returns the new analysis
  // (or throws). Used by both bulk Analyze and per-post Re-analyze.
  const analyzeOnePost = async (post: RedditPost): Promise<RedditOpportunityAnalysis> => {
    if (!project || !userProfile) throw new Error('Not ready');

    const res = await fetch('/api/reddit-visibility/analyze-post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project, sources, post }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? `HTTP ${res.status}`);
    }
    const data = await res.json();

    const analysisId = await createAnalysis({
      postId: post.postId,
      projectId,
      decision: data.analysis.decision,
      score: data.analysis.score,
      reason: data.analysis.reason,
      relevantSourceIds: data.analysis.relevantSourceIds,
      riskLevel: data.analysis.riskLevel,
      mentionRecommendation: data.analysis.mentionRecommendation,
      suggestedAngle: data.analysis.suggestedAngle,
      growthScore: data.analysis.growthScore ?? 0,
      growthAngle: data.analysis.growthAngle ?? '',
      model: data.meta.model,
      promptVersion: data.meta.promptVersion,
      inputTokens: data.meta.inputTokens,
      outputTokens: data.meta.outputTokens,
      createdBy: userProfile.uid,
    });

    await updatePostStatus(
      post.postId,
      data.analysis.decision === 'skip' ? 'skipped' : 'analyzed'
    );

    return {
      analysisId,
      postId: post.postId,
      projectId,
      decision: data.analysis.decision,
      score: data.analysis.score,
      reason: data.analysis.reason,
      relevantSourceIds: data.analysis.relevantSourceIds,
      riskLevel: data.analysis.riskLevel,
      mentionRecommendation: data.analysis.mentionRecommendation,
      suggestedAngle: data.analysis.suggestedAngle,
      growthScore: data.analysis.growthScore ?? 0,
      growthAngle: data.analysis.growthAngle ?? '',
      model: data.meta.model,
      promptVersion: data.meta.promptVersion,
      inputTokens: data.meta.inputTokens,
      outputTokens: data.meta.outputTokens,
      createdBy: userProfile.uid,
      createdAt: new Date(),
    };
  };

  const handleAnalyze = async () => {
    if (!project || !userProfile || !userRole) return;
    const target = analyzableInView;
    if (target.length === 0) return;
    analyzeStop.current = false;
    setAnalyzing(true);
    setFeedback(null);
    setError(null);
    setAnalyzeProgress({ done: 0, total: target.length });

    let successCount = 0;
    let stopped = false;
    const failures: { postId: string; message: string }[] = [];
    const newAnalyses: RedditOpportunityAnalysis[] = [];

    for (let i = 0; i < target.length; i++) {
      if (analyzeStop.current) { stopped = true; break; }
      const post = target[i];
      try {
        const analysis = await analyzeOnePost(post);
        // Each result is already persisted to Firestore by analyzeOnePost, so
        // stopping never loses completed work — reflect it live.
        newAnalyses.push(analysis);
        setAnalyses((prev) => [analysis, ...prev]);
        successCount++;
      } catch (err) {
        console.error(`Analysis failed for ${post.postId}:`, err);
        failures.push({
          postId: post.postId,
          message: err instanceof Error ? err.message : String(err),
        });
      }
      setAnalyzeProgress({ done: i + 1, total: target.length });
    }

    // Analyses were added to state incrementally above; just refresh post rows.
    void newAnalyses;
    const fresh = await listPostsByProject(projectId);
    setPosts(fresh);

    await writeActivityLog(
      userProfile.uid,
      userProfile.email,
      userRole.slug,
      LogAction.REDDIT_POST_ANALYZED,
      'reddit_project',
      projectId,
      project.name,
      {
        attempted: target.length,
        succeeded: successCount,
        failed: failures.length,
        stopped,
        filterScope: filter,
        sampleFailures: failures.slice(0, 5),
      },
      failures.length > 0 ? LogSeverity.WARNING : LogSeverity.INFO
    );

    const prefix = stopped ? 'Stopped early. ' : '';
    setFeedback(
      failures.length === 0
        ? `${prefix}Analyzed ${successCount} post${successCount === 1 ? '' : 's'}.`
        : `${prefix}Analyzed ${successCount}, failed ${failures.length}. See logs for details.`
    );
    setAnalyzeProgress(null);
    setAnalyzing(false);
  };

  const handleToggleFavorite = async (post: RedditPost) => {
    const next = !(post.isFavorite === true);
    // Optimistic toggle so the star responds instantly.
    setPosts((prev) =>
      prev ? prev.map((p) => (p.postId === post.postId ? { ...p, isFavorite: next } : p)) : prev
    );
    try {
      await setPostFavorite(post.postId, next);
    } catch (err) {
      console.error('Toggle favorite failed:', err);
      setPosts((prev) =>
        prev ? prev.map((p) => (p.postId === post.postId ? { ...p, isFavorite: !next } : p)) : prev
      );
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleGenerateDraft = async (
    post: RedditPost,
    analysis: RedditOpportunityAnalysis,
    revisionOf: string | null
  ) => {
    if (!project || !userProfile || !userRole) return;
    setDraftingPostId(post.postId);
    setError(null);
    try {
      const res = await fetch('/api/reddit-visibility/generate-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project, sources, post, analysis }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();

      const draftId = await createDraft({
        postId: post.postId,
        projectId,
        analysisId: analysis.analysisId,
        body: data.draft,
        status: 'draft',
        reviewerNotes: '',
        revisionOf,
        model: data.meta.model,
        promptVersion: data.meta.promptVersion,
        inputTokens: data.meta.inputTokens,
        outputTokens: data.meta.outputTokens,
        createdBy: userProfile.uid,
      });

      const newDraft: RedditDraft = {
        draftId,
        postId: post.postId,
        projectId,
        analysisId: analysis.analysisId,
        body: data.draft,
        status: 'draft',
        reviewerNotes: '',
        revisionOf,
        model: data.meta.model,
        promptVersion: data.meta.promptVersion,
        inputTokens: data.meta.inputTokens,
        outputTokens: data.meta.outputTokens,
        createdBy: userProfile.uid,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      setDrafts((prev) => [newDraft, ...prev]);

      await writeActivityLog(
        userProfile.uid,
        userProfile.email,
        userRole.slug,
        LogAction.REDDIT_DRAFT_GENERATED,
        'reddit_post',
        post.postId,
        post.title,
        { regenerated: !!revisionOf },
        LogSeverity.INFO
      );
    } catch (err) {
      console.error('Draft generation failed:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDraftingPostId(null);
    }
  };

  const handleCopyDraft = async (draft: RedditDraft) => {
    try {
      await navigator.clipboard.writeText(draft.body);
      setCopiedDraftId(draft.draftId);
      setTimeout(() => setCopiedDraftId(null), 2000);
    } catch (err) {
      console.error('Clipboard write failed:', err);
    }
  };

  const handleMarkPosted = async (draft: RedditDraft, post: RedditPost) => {
    if (!userProfile || !userRole) return;
    await updateDraftStatus(draft.draftId, 'posted');
    await updatePostStatus(post.postId, 'drafted');
    setDrafts((prev) =>
      prev.map((d) => (d.draftId === draft.draftId ? { ...d, status: 'posted' } : d))
    );
    const fresh = await listPostsByProject(projectId);
    setPosts(fresh);
    await writeActivityLog(
      userProfile.uid,
      userProfile.email,
      userRole.slug,
      LogAction.REDDIT_DRAFT_POSTED,
      'reddit_post',
      post.postId,
      post.title,
      { draftId: draft.draftId },
      LogSeverity.INFO
    );
  };

  // Reply from the tool: enqueue a post job for the LOCAL AGENT (running on
  // your Mac next to AdsPower) to pick up. The agent opens the account's
  // AdsPower profile, verifies the right account + thread, types the reply, and
  // submits — then writes the result back. We subscribe to the job and update
  // the card live. Rails (status/cap/interval) are checked here first; the agent
  // re-checks before it posts.
  const handlePostFromTool = async (
    draft: RedditDraft,
    post: RedditPost,
    account: RedditAccount
  ) => {
    if (!userProfile || !userRole) return;
    const gate = accountPostGate(account, Date.now());
    if (!gate.ok) {
      setError(`${account.label}: ${gate.reason}`);
      return;
    }
    if (!account.adsPowerProfileId) {
      setError(
        `${account.label} has no AdsPower profile ID set — add it on the Accounts page first.`
      );
      return;
    }
    if (
      !confirm(
        `Auto-post this reply to r/${post.subreddit} from "${account.label}" (u/${account.username})?\n\n` +
          `The local agent will open ${account.label}'s AdsPower profile and post it.`
      )
    )
      return;

    const threadUrl = post.permalink
      ? post.permalink.startsWith('http')
        ? post.permalink
        : `https://www.reddit.com${post.permalink}`
      : post.url;

    setPickerDraftId(null);
    setInFlight((prev) => ({ ...prev, [draft.draftId]: 'queued' }));
    setError(null);

    try {
      const jobId = await createPostJob({
        projectId,
        postId: post.postId,
        draftId: draft.draftId,
        redditPostId: post.redditPostId,
        subreddit: post.subreddit,
        threadUrl,
        accountId: account.accountId,
        adsPowerProfileId: account.adsPowerProfileId,
        expectedUsername: account.username,
        body: draft.body,
        createdBy: userProfile.uid,
        createdByName: userProfile.email,
      });

      await writeActivityLog(
        userProfile.uid,
        userProfile.email,
        userRole.slug,
        LogAction.REDDIT_DRAFT_POSTED,
        'reddit_post',
        post.postId,
        post.title,
        { draftId: draft.draftId, accountId: account.accountId, jobId, queued: true },
        LogSeverity.INFO
      );

      const unsub = subscribePostJob(jobId, async (job) => {
        if (!job) return;
        if (job.status === 'queued' || job.status === 'posting') {
          setInFlight((prev) => ({ ...prev, [draft.draftId]: job.status as 'queued' | 'posting' }));
          return;
        }
        // terminal
        jobUnsubs.current[jobId]?.();
        delete jobUnsubs.current[jobId];
        setInFlight((prev) => {
          const next = { ...prev };
          delete next[draft.draftId];
          return next;
        });

        if (job.status === 'failed') {
          setError(`Post failed (${account.label}): ${job.error || 'unknown error'}`);
          return;
        }
        setFeedback(`Posted from "${account.label}". ${job.permalink || ''}`);
        const [freshDrafts, freshPosts, freshAccounts] = await Promise.all([
          listDraftsByProject(projectId),
          listPostsByProject(projectId),
          listAccounts(),
        ]);
        setDrafts(freshDrafts);
        setPosts(freshPosts);
        setAccounts(freshAccounts);
      });
      jobUnsubs.current[jobId] = unsub;
    } catch (err) {
      setInFlight((prev) => {
        const next = { ...prev };
        delete next[draft.draftId];
        return next;
      });
      setError(`Could not queue post: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Re-open the thread + re-copy the draft (e.g. the first paste failed). Does
  // NOT re-mark or advance counters — it's just a convenience redo.
  const handleReopenCopy = async (draft: RedditDraft, post: RedditPost) => {
    const threadUrl = post.permalink
      ? post.permalink.startsWith('http')
        ? post.permalink
        : `https://www.reddit.com${post.permalink}`
      : post.url;
    const opened = window.open(threadUrl, '_blank', 'noopener,noreferrer');
    try {
      await navigator.clipboard.writeText(draft.body);
    } catch (err) {
      console.error('Clipboard write failed:', err);
    }
    setFeedback(
      opened
        ? 'Copied draft + reopened the thread.'
        : 'Copied draft. (Popup blocked — open the thread link manually.)'
    );
  };

  const handleDiscardDraft = async (draft: RedditDraft) => {
    if (!confirm('Discard this draft? You can always regenerate.')) return;
    await updateDraftStatus(draft.draftId, 'rejected');
    setDrafts((prev) =>
      prev.map((d) => (d.draftId === draft.draftId ? { ...d, status: 'rejected' } : d))
    );
  };

  const handleReanalyze = async (post: RedditPost) => {
    if (!project || !userProfile || !userRole) return;
    setReanalyzingPostId(post.postId);
    setError(null);
    try {
      const analysis = await analyzeOnePost(post);
      // Prepend so the .reduce-style "latest by createdAt" picks it up first
      setAnalyses((prev) => [analysis, ...prev]);
      const fresh = await listPostsByProject(projectId);
      setPosts(fresh);

      await writeActivityLog(
        userProfile.uid,
        userProfile.email,
        userRole.slug,
        LogAction.REDDIT_POST_ANALYZED,
        'reddit_post',
        post.postId,
        post.title,
        { reanalysis: true, decision: analysis.decision, score: analysis.score },
        LogSeverity.INFO
      );
    } catch (err) {
      console.error(`Re-analysis failed for ${post.postId}:`, err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setReanalyzingPostId(null);
    }
  };

  if (!project) return null;

  const noSubreddits = project.targetSubreddits.length === 0;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ marginBottom: '4px' }}>Opportunities</h2>
          <p className="text-muted">
            r/{project.targetSubreddits.join(', r/') || '—'}. Pull recent posts, or search by keywords for higher-signal hits. Analyze with DeepSeek to score reply opportunities.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {/* Analyze doubles as Stop while running — click to halt; work done so far is kept. */}
          {analyzing ? (
            <button
              className="btn btn-outline"
              onClick={() => { analyzeStop.current = true; }}
              style={{ color: 'var(--error)' }}
              title="Stop analyzing — results so far are kept"
            >
              <X size={16} />
              {analyzeProgress ? `Stop (${analyzeProgress.done}/${analyzeProgress.total})` : 'Stop'}
            </button>
          ) : (
            <button
              className="btn btn-outline"
              onClick={handleAnalyze}
              disabled={fetching || searching || analyzableInView.length === 0}
              title={
                analyzableInView.length === 0
                  ? 'Nothing left to analyze in the current view'
                  : `Analyze ${analyzableInView.length} unanalyzed post${analyzableInView.length === 1 ? '' : 's'} from the current view (${filter})`
              }
            >
              <Sparkles size={16} />
              {`Analyze${analyzableInView.length > 0 ? ` (${analyzableInView.length})` : ''}`}
            </button>
          )}
          <button
            className="btn btn-outline"
            onClick={openSearchPanel}
            disabled={fetching || analyzing || searching || noSubreddits}
            title={noSubreddits ? 'Add target subreddits first' : 'Search subreddits for posts matching keywords'}
          >
            <Search size={16} /> Search by keywords
          </button>
          {/* Fetch doubles as Stop while running — click to halt; fetched posts are kept. */}
          {fetching ? (
            <button
              className="btn btn-primary"
              onClick={() => { fetchStop.current = true; }}
              title="Stop fetching — posts pulled so far are kept"
            >
              <X size={16} />
              {fetchProgress ? `Stop (${fetchProgress.done}/${fetchProgress.total})` : 'Stop'}
            </button>
          ) : (
            <button
              className="btn btn-primary"
              onClick={handleFetch}
              disabled={analyzing || searching || noSubreddits}
              title={noSubreddits ? 'Add target subreddits to the project first' : 'Fetch latest posts'}
            >
              <RefreshCw size={16} />
              Fetch posts
            </button>
          )}
        </div>
      </div>

      {searchOpen && (
        <div className="card" style={{ marginBottom: '20px' }}>
          <strong style={{ display: 'block', marginBottom: '6px' }}>Search subreddits by keywords</strong>
          <p className="text-muted" style={{ fontSize: '0.8125rem', marginBottom: '10px' }}>
            Comma-separated keywords. Multi-word phrases are auto-quoted. Each target subreddit is searched with these terms OR'd together. Up to 15 keywords, up to 25 results per subreddit.
          </p>
          <textarea
            value={searchKeywordsInput}
            onChange={(e) => setSearchKeywordsInput(e.target.value)}
            rows={3}
            placeholder="newsletter platform, Substack alternative, paid newsletter, ..."
            style={{ width: '100%', fontSize: '0.875rem' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setSearchKeywordsInput(project?.keywords.join(', ') ?? '')}
              disabled={searching}
              style={{ fontSize: '0.75rem', padding: '4px 10px' }}
              title="Reset to the project's saved keywords"
            >
              Reset to project keywords
            </button>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setSearchOpen(false)}
                disabled={searching}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSearch}
                disabled={searching || !searchKeywordsInput.trim()}
              >
                <Search size={14} style={{ animation: searching ? 'spin 1s linear infinite' : 'none' }} />
                {searching ? 'Searching…' : 'Search'}
              </button>
            </div>
          </div>
        </div>
      )}

      {noSubreddits && (
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
          <AlertCircle size={20} className="text-warning" />
          <div style={{ flex: 1 }}>
            <strong>No target subreddits configured.</strong>{' '}
            <span className="text-muted">Add some to the project before fetching.</span>
          </div>
          <Link href={`/apps/reddit-visibility/${projectId}/edit`} className="btn btn-outline">
            Edit project
          </Link>
        </div>
      )}

      {feedback && (
        <div className="card" style={{ marginBottom: '20px', borderColor: 'rgba(16, 185, 129, 0.3)' }}>
          <span className="text-muted">{feedback}</span>
          {lastSearchInfo && (
            <div style={{ marginTop: '10px', fontSize: '0.75rem' }} className="text-dim">
              <div style={{ marginBottom: '4px' }}>
                <strong>Query sent:</strong> <code style={{ fontSize: '0.75rem' }}>{lastSearchInfo.query}</code>
              </div>
              <div>
                <strong>Hits per subreddit:</strong>{' '}
                {Object.entries(lastSearchInfo.hitsBySubreddit)
                  .map(([sub, n]) => `r/${sub}: ${n}`)
                  .join(' · ')}
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="card" style={{ marginBottom: '20px', borderColor: 'rgba(239, 68, 68, 0.3)' }}>
          <span className="text-error">{error}</span>
        </div>
      )}

      {fetchErrors.length > 0 && (
        <div className="card" style={{ marginBottom: '20px', borderColor: 'rgba(239, 68, 68, 0.3)' }}>
          <strong style={{ display: 'block', marginBottom: '8px' }}>Fetch errors</strong>
          <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.8125rem' }} className="text-muted">
            {fetchErrors.map((e, i) => (
              <li key={i}>
                <strong>r/{e.subreddit}:</strong> {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {posts && posts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
          {/* Primary axis: which kind of opportunity. */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
            {([
              ['all', `All (${posts.length})`],
              ['brand', `Brand (${counts.brand})`],
              ['growth', `Growth (${counts.growth})`],
              ['unanalyzed', `Unanalyzed (${counts.unanalyzed})`],
              ...(lastSearchPostIds
                ? ([['search', `Search (${counts.search})`]] as const)
                : []),
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={filter === key ? 'btn btn-primary' : 'btn btn-outline'}
                style={{ padding: '4px 12px', fontSize: '0.8125rem' }}
              >
                {label}
              </button>
            ))}
            <button
              onClick={handleMarkAllSeen}
              className="btn btn-outline"
              style={{ padding: '4px 12px', fontSize: '0.8125rem', marginLeft: 'auto' }}
              title="Clear the NEW badges"
            >
              <CheckCircle2 size={14} /> Mark all seen
            </button>
          </div>
          {/* Secondary axis: quality floor — only meaningful inside Brand / Growth. */}
          {(filter === 'brand' || filter === 'growth') && (
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="text-dim" style={{ fontSize: '0.75rem', marginRight: '2px' }}>Quality:</span>
              {([
                ['any', 'Any'],
                ['best', 'Best 75+'],
                ['good', 'Good 60+'],
                ['okay', 'Okay 40+'],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setQualityFilter(key)}
                  className={qualityFilter === key ? 'btn btn-primary' : 'btn btn-outline'}
                  style={{ padding: '3px 10px', fontSize: '0.75rem' }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {posts === null && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
          <div className="spinner" />
        </div>
      )}

      {posts && posts.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '48px' }}>
          <Search size={48} className="text-dim" style={{ marginBottom: '16px' }} />
          <h3>No posts yet</h3>
          <p className="text-muted">
            Click <strong>Fetch posts</strong> to pull the latest from your target subreddits.
          </p>
        </div>
      )}

      {visiblePosts && visiblePosts.length === 0 && posts && posts.length > 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '32px' }}>
          <p className="text-muted">No posts match the <strong>{filter}</strong> filter.</p>
        </div>
      )}

      {visiblePosts && visiblePosts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {visiblePosts.map((p) => {
            const analysis = analysisByPostId.get(p.postId);
            const isOpen = !!expanded[p.postId];
            const rStyle = analysis ? riskStyle(analysis.riskLevel) : null;

            return (
              <div key={p.postId} className="card" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap' }}>
                  <span className="badge" style={{ background: 'rgba(124,58,237,0.12)', color: 'var(--primary-light)' }}>
                    r/{p.subreddit}
                  </span>
                  {isNew(p) && (
                    <span
                      className="badge"
                      style={{
                        background: 'rgba(16, 185, 129, 0.18)',
                        color: '#10b981',
                        fontSize: '0.625rem',
                        fontWeight: 700,
                        letterSpacing: '0.05em',
                      }}
                    >
                      NEW
                    </span>
                  )}
                  {answeredPostIds.has(p.postId) && (
                    <span
                      className="badge"
                      style={{
                        background: 'rgba(124, 58, 237, 0.18)',
                        color: 'var(--primary-light)',
                        fontSize: '0.625rem',
                        fontWeight: 700,
                        letterSpacing: '0.05em',
                      }}
                      title="A reply for this Reddit post was marked posted previously"
                    >
                      ANSWERED
                    </span>
                  )}
                  {isBrandPost(analysis) && (
                    <span className="badge" style={{ background: 'rgba(124,58,237,0.18)', color: 'var(--primary-light)', fontSize: '0.6875rem', fontWeight: 700 }}>
                      BRAND · {analysis?.score}
                    </span>
                  )}
                  {isGrowthPost(analysis) && (
                    <span className="badge" style={{ background: 'rgba(16,185,129,0.18)', color: '#10b981', fontSize: '0.6875rem', fontWeight: 700 }}>
                      GROWTH · {analysis?.growthScore}
                    </span>
                  )}
                  {analysis && rStyle && analysis.riskLevel !== 'low' && (
                    <span className="badge" style={{ background: rStyle.bg, color: rStyle.color, fontSize: '0.6875rem' }}>
                      RISK: {analysis.riskLevel.toUpperCase()}
                    </span>
                  )}
                  <span className="text-dim" style={{ fontSize: '0.75rem' }}>
                    by u/{p.author} · {relativeTime(p.createdAtReddit)}
                  </span>
                  <button
                    onClick={() => handleToggleFavorite(p)}
                    title={p.isFavorite ? 'Favorited — kept on next fetch. Click to unfavorite.' : 'Favorite to keep this post when the next fetch clears old ones.'}
                    aria-pressed={p.isFavorite === true}
                    style={{
                      marginLeft: 'auto',
                      display: 'inline-flex',
                      alignItems: 'center',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '2px',
                      color: p.isFavorite ? '#f5b301' : 'var(--text-dim)',
                    }}
                  >
                    <Star size={16} fill={p.isFavorite ? '#f5b301' : 'none'} />
                  </button>
                </div>

                <div style={{ marginBottom: '8px' }}>
                  <a
                    href={p.permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'inherit', textDecoration: 'none', fontWeight: 600, fontSize: '0.9375rem' }}
                  >
                    {p.title}
                  </a>
                </div>

                {p.body && (
                  <p
                    className="text-muted"
                    style={{
                      fontSize: '0.8125rem',
                      marginBottom: '8px',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {p.body}
                  </p>
                )}

                <div style={{ display: 'flex', gap: '16px', fontSize: '0.75rem', color: 'var(--text-dim)', alignItems: 'center' }}>
                  {p.score > 0 && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <ArrowUp size={12} /> {p.score}
                    </span>
                  )}
                  {p.numComments > 0 && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <MessageCircle size={12} /> {p.numComments}
                    </span>
                  )}
                  <a
                    href={p.permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'inherit', textDecoration: 'none' }}
                  >
                    <ExternalLink size={12} /> View on Reddit
                  </a>
                  {analysis && (
                    <button
                      onClick={() => setExpanded((prev) => ({ ...prev, [p.postId]: !prev[p.postId] }))}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-dim)',
                        cursor: 'pointer',
                        marginLeft: 'auto',
                        padding: 0,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '0.75rem',
                      }}
                    >
                      {isOpen ? 'Hide analysis' : 'Show analysis'}
                      {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  )}
                </div>

                {analysis && isOpen && (
                  <div
                    style={{
                      marginTop: '12px',
                      paddingTop: '12px',
                      borderTop: '1px solid var(--border)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                      fontSize: '0.8125rem',
                    }}
                  >
                    <div>
                      <strong>Reason:</strong> <span className="text-muted">{analysis.reason}</span>
                    </div>
                    {isGrowthPost(analysis) && analysis.growthAngle && (
                      <div>
                        <strong style={{ color: '#10b981' }}>Growth angle:</strong>{' '}
                        <span className="text-muted">{analysis.growthAngle}</span>
                      </div>
                    )}
                    {analysis.decision !== 'skip' && (
                      <>
                        {analysis.suggestedAngle && (
                          <div>
                            <strong>Suggested angle:</strong>{' '}
                            <span className="text-muted">{analysis.suggestedAngle}</span>
                          </div>
                        )}
                        <div>
                          <strong>Mention recommendation:</strong>{' '}
                          <span className="text-muted">{analysis.mentionRecommendation}</span>
                        </div>
                        {analysis.relevantSourceIds.length > 0 && (
                          <div>
                            <strong>Relevant sources:</strong>{' '}
                            <span className="text-muted">
                              {analysis.relevantSourceIds
                                .map((sid) => sources.find((s) => s.sourceId === sid)?.title ?? sid)
                                .join(', ')}
                            </span>
                          </div>
                        )}
                      </>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                      <div className="text-dim" style={{ fontSize: '0.6875rem' }}>
                        {analysis.model} · {analysis.promptVersion} · {analysis.inputTokens + analysis.outputTokens} tokens
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => handleReanalyze(p)}
                          disabled={analyzing || reanalyzingPostId !== null || draftingPostId !== null}
                          className="btn btn-outline"
                          style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                        >
                          <Sparkles size={12} style={{ animation: reanalyzingPostId === p.postId ? 'spin 1.5s linear infinite' : 'none' }} />
                          {reanalyzingPostId === p.postId ? 'Re-analyzing…' : 'Re-analyze'}
                        </button>
                        {(isBrandPost(analysis) || isGrowthPost(analysis)) && !draftByPostId.get(p.postId) && (
                          <button
                            onClick={() => handleGenerateDraft(p, analysis, null)}
                            disabled={draftingPostId !== null || reanalyzingPostId !== null}
                            className="btn btn-primary"
                            style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                          >
                            <PenTool size={12} style={{ animation: draftingPostId === p.postId ? 'spin 1.5s linear infinite' : 'none' }} />
                            {draftingPostId === p.postId ? 'Drafting…' : 'Generate draft'}
                          </button>
                        )}
                      </div>
                    </div>

                    {(() => {
                      const draft = draftByPostId.get(p.postId);
                      if (!draft) return null;
                      const isCopied = copiedDraftId === draft.draftId;
                      const isPosted = draft.status === 'posted';
                      return (
                        <div
                          style={{
                            marginTop: '4px',
                            padding: '12px 14px',
                            background: 'var(--surface-2)',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--border)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '10px',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                            <strong style={{ fontSize: '0.8125rem' }}>
                              Draft reply {isPosted && <span className="badge badge-success" style={{ marginLeft: '8px', fontSize: '0.625rem' }}>POSTED</span>}
                            </strong>
                            <span className="text-dim" style={{ fontSize: '0.6875rem' }}>
                              {draft.model} · {draft.promptVersion} · {draft.inputTokens + draft.outputTokens} tokens
                            </span>
                          </div>
                          <div
                            style={{
                              whiteSpace: 'pre-wrap',
                              fontSize: '0.875rem',
                              lineHeight: 1.5,
                              padding: '10px 12px',
                              background: 'var(--bg)',
                              borderRadius: 'var(--radius-sm)',
                              border: '1px solid var(--border)',
                            }}
                          >
                            {draft.body}
                          </div>
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <button
                              onClick={() => handleCopyDraft(draft)}
                              className="btn btn-outline"
                              style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                            >
                              {isCopied ? <CheckCircle2 size={12} /> : <Copy size={12} />}
                              {isCopied ? 'Copied' : 'Copy'}
                            </button>
                            {!isPosted && (
                              <>
                                <button
                                  onClick={() =>
                                    setPickerDraftId((cur) =>
                                      cur === draft.draftId ? null : draft.draftId
                                    )
                                  }
                                  disabled={inFlight[draft.draftId] !== undefined}
                                  className="btn btn-primary"
                                  style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                                >
                                  <Send size={12} style={{ animation: inFlight[draft.draftId] ? 'spin 1.5s linear infinite' : 'none' }} />
                                  {inFlight[draft.draftId] === 'queued'
                                    ? 'Queued…'
                                    : inFlight[draft.draftId] === 'posting'
                                    ? 'Posting…'
                                    : 'Reply'}
                                </button>
                                <button
                                  onClick={() => handleGenerateDraft(p, analysis, draft.draftId)}
                                  disabled={draftingPostId !== null}
                                  className="btn btn-outline"
                                  style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                                >
                                  <PenTool size={12} style={{ animation: draftingPostId === p.postId ? 'spin 1.5s linear infinite' : 'none' }} />
                                  {draftingPostId === p.postId ? 'Regenerating…' : 'Regenerate'}
                                </button>
                                <button
                                  onClick={() => handleMarkPosted(draft, p)}
                                  className="btn btn-outline"
                                  style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                                >
                                  <CheckCircle2 size={12} /> Mark posted
                                </button>
                                <button
                                  onClick={() => handleDiscardDraft(draft)}
                                  className="btn btn-outline"
                                  style={{ padding: '4px 10px', fontSize: '0.75rem', color: 'var(--error)' }}
                                >
                                  <X size={12} /> Discard
                                </button>
                              </>
                            )}
                            {isPosted && (
                              <>
                                <button
                                  onClick={() => handleReopenCopy(draft, p)}
                                  className="btn btn-outline"
                                  style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                                >
                                  <ExternalLink size={12} /> Re-open + copy
                                </button>
                                {draft.postedByAccountId && (
                                  <span
                                    className="text-dim"
                                    style={{ fontSize: '0.6875rem', alignSelf: 'center' }}
                                  >
                                    Posted from{' '}
                                    {accounts.find((a) => a.accountId === draft.postedByAccountId)
                                      ?.label ?? 'account'}
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                          {!isPosted && pickerDraftId === draft.draftId && (
                            <div
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '6px',
                                padding: '10px 12px',
                                background: 'var(--bg)',
                                borderRadius: 'var(--radius-sm)',
                                border: '1px solid var(--border)',
                              }}
                            >
                              <div
                                className="text-dim"
                                style={{ fontSize: '0.6875rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                              >
                                <Users size={12} /> Auto-post from which account?
                              </div>
                              {accounts.length === 0 && (
                                <div style={{ fontSize: '0.75rem' }}>
                                  No accounts yet.{' '}
                                  <Link href="/apps/reddit-visibility/accounts" style={{ color: 'var(--accent)' }}>
                                    Add one →
                                  </Link>
                                </div>
                              )}
                              {accounts.map((acct) => {
                                const gate = accountPostGate(acct, Date.now());
                                return (
                                  <button
                                    key={acct.accountId}
                                    onClick={() => handlePostFromTool(draft, p, acct)}
                                    disabled={!gate.ok || inFlight[draft.draftId] !== undefined}
                                    className="btn btn-outline"
                                    style={{
                                      padding: '6px 10px',
                                      fontSize: '0.75rem',
                                      justifyContent: 'space-between',
                                      opacity: gate.ok ? 1 : 0.55,
                                    }}
                                    title={gate.ok ? '' : gate.reason}
                                  >
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <span
                                        style={{
                                          width: 7,
                                          height: 7,
                                          borderRadius: '50%',
                                          background:
                                            acct.status === 'active'
                                              ? 'var(--success, #22c55e)'
                                              : acct.status === 'warming'
                                              ? 'var(--warning, #eab308)'
                                              : 'var(--error, #ef4444)',
                                          display: 'inline-block',
                                        }}
                                      />
                                      {acct.label}{' '}
                                      <span className="text-dim">u/{acct.username}</span>
                                    </span>
                                    <span className="text-dim" style={{ fontSize: '0.6875rem' }}>
                                      {gate.ok
                                        ? `${gate.remainingToday} left today`
                                        : gate.reason}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
