// ============================================================
// Reddit Visibility — Firestore Helpers
// Mirrors patterns in src/lib/firebase/firestore.ts
// ============================================================

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  Timestamp,
  serverTimestamp,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type {
  RedditProject,
  RedditSource,
  RedditPost,
  NormalizedRedditPost,
  RedditPostProcessingStatus,
  RedditOpportunityAnalysis,
  RedditDraft,
  DraftStatus,
  RedditAccount,
  RedditPostJob,
  RedditAgentStatus,
} from './types';

function toDate(ts: unknown): Date {
  if (ts instanceof Timestamp) return ts.toDate();
  if (ts instanceof Date) return ts;
  if (typeof ts === 'string') return new Date(ts);
  return new Date();
}

function parseTimestamps<T extends DocumentData>(data: DocumentData): T {
  const result = { ...data };
  for (const field of [
    'createdAt',
    'updatedAt',
    'createdAtReddit',
    'fetchedAt',
    'postedAt',
    'lastPostAt',
    'postCountResetAt',
    'claimedAt',
    'completedAt',
    'lastSeenAt',
  ]) {
    if (result[field]) result[field] = toDate(result[field]);
  }
  return result as T;
}

// ---- Projects ----

export async function listProjects(): Promise<RedditProject[]> {
  const snap = await getDocs(
    query(collection(db, 'reddit_projects'), orderBy('createdAt', 'desc'))
  );
  return snap.docs.map((d) =>
    parseTimestamps<RedditProject>({ ...d.data(), projectId: d.id })
  );
}

export async function getProject(projectId: string): Promise<RedditProject | null> {
  const snap = await getDoc(doc(db, 'reddit_projects', projectId));
  if (!snap.exists()) return null;
  return parseTimestamps<RedditProject>({ ...snap.data(), projectId: snap.id });
}

export async function createProject(
  data: Omit<RedditProject, 'projectId' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const ref = await addDoc(collection(db, 'reddit_projects'), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateProject(
  projectId: string,
  data: Partial<RedditProject>
): Promise<void> {
  await updateDoc(doc(db, 'reddit_projects', projectId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function archiveProject(projectId: string): Promise<void> {
  await updateProject(projectId, { status: 'archived' });
}

export async function deleteProject(projectId: string): Promise<void> {
  await deleteDoc(doc(db, 'reddit_projects', projectId));
}

/**
 * Wipes a project's fetched posts, analyses, and any drafts that
 * weren't marked posted. Keeps the project, knowledge sources, and
 * drafts with status='posted' so the user retains an "answered"
 * ledger that can cross-match against future fetches/searches.
 */
export async function cleanupProjectHistory(
  projectId: string
): Promise<{
  posts: number;
  analyses: number;
  drafts: number;
  postedDraftsKept: number;
}> {
  const [postsSnap, analysesSnap, draftsSnap] = await Promise.all([
    getDocs(query(collection(db, 'reddit_posts'), where('projectId', '==', projectId))),
    getDocs(
      query(collection(db, 'reddit_opportunity_analyses'), where('projectId', '==', projectId))
    ),
    getDocs(query(collection(db, 'reddit_drafts'), where('projectId', '==', projectId))),
  ]);

  const nonPostedDrafts = draftsSnap.docs.filter((d) => d.data().status !== 'posted');
  const postedDrafts = draftsSnap.docs.filter((d) => d.data().status === 'posted');

  await Promise.all([
    ...postsSnap.docs.map((d) => deleteDoc(d.ref)),
    ...analysesSnap.docs.map((d) => deleteDoc(d.ref)),
    ...nonPostedDrafts.map((d) => deleteDoc(d.ref)),
  ]);

  return {
    posts: postsSnap.size,
    analyses: analysesSnap.size,
    drafts: nonPostedDrafts.length,
    postedDraftsKept: postedDrafts.length,
  };
}

/**
 * Deletes a project AND every dependent document
 * (sources, posts, analyses). Sequential — fine for MVP scale.
 * Returns a count of what was removed for activity logging.
 */
export async function deleteProjectCascade(
  projectId: string
): Promise<{ sources: number; posts: number; analyses: number }> {
  const [sourcesSnap, postsSnap, analysesSnap] = await Promise.all([
    getDocs(query(collection(db, 'reddit_sources'), where('projectId', '==', projectId))),
    getDocs(query(collection(db, 'reddit_posts'), where('projectId', '==', projectId))),
    getDocs(
      query(collection(db, 'reddit_opportunity_analyses'), where('projectId', '==', projectId))
    ),
  ]);

  await Promise.all([
    ...sourcesSnap.docs.map((d) => deleteDoc(d.ref)),
    ...postsSnap.docs.map((d) => deleteDoc(d.ref)),
    ...analysesSnap.docs.map((d) => deleteDoc(d.ref)),
  ]);

  await deleteDoc(doc(db, 'reddit_projects', projectId));

  return {
    sources: sourcesSnap.size,
    posts: postsSnap.size,
    analyses: analysesSnap.size,
  };
}

// ---- Knowledge Sources ----

export async function listSources(projectId: string): Promise<RedditSource[]> {
  // No orderBy here — avoids needing a composite index. Sort client-side.
  const snap = await getDocs(
    query(collection(db, 'reddit_sources'), where('projectId', '==', projectId))
  );
  const rows = snap.docs.map((d) =>
    parseTimestamps<RedditSource>({ ...d.data(), sourceId: d.id })
  );
  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function getSource(sourceId: string): Promise<RedditSource | null> {
  const snap = await getDoc(doc(db, 'reddit_sources', sourceId));
  if (!snap.exists()) return null;
  return parseTimestamps<RedditSource>({ ...snap.data(), sourceId: snap.id });
}

export async function createSource(
  data: Omit<RedditSource, 'sourceId' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const ref = await addDoc(collection(db, 'reddit_sources'), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateSource(
  sourceId: string,
  data: Partial<RedditSource>
): Promise<void> {
  await updateDoc(doc(db, 'reddit_sources', sourceId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteSource(sourceId: string): Promise<void> {
  await deleteDoc(doc(db, 'reddit_sources', sourceId));
}

// ---- Reddit Posts ----

export interface SaveFetchedPostsResult {
  created: number;
  skipped: number;
  total: number;
}

/**
 * Persist a batch of normalized Reddit posts under a project, skipping
 * any composite id (`<projectId>_<redditPostId>`) that already exists.
 * This preserves processingStatus on re-fetch.
 */
export async function saveFetchedPosts(
  projectId: string,
  posts: NormalizedRedditPost[]
): Promise<SaveFetchedPostsResult> {
  let created = 0;
  let skipped = 0;

  for (const p of posts) {
    const id = `${projectId}_${p.redditPostId}`;
    const ref = doc(db, 'reddit_posts', id);
    const existing = await getDoc(ref);
    if (existing.exists()) {
      skipped++;
      continue;
    }
    await setDoc(ref, {
      projectId,
      redditPostId: p.redditPostId,
      subreddit: p.subreddit,
      title: p.title,
      body: p.body,
      author: p.author,
      url: p.url,
      permalink: p.permalink,
      isSelfPost: p.isSelfPost,
      score: p.score,
      numComments: p.numComments,
      createdAtReddit: Timestamp.fromMillis(p.createdAtRedditMs),
      fetchedAt: serverTimestamp(),
      processingStatus: 'fetched' satisfies RedditPostProcessingStatus,
      isFavorite: false,
    });
    created++;
  }

  return { created, skipped, total: posts.length };
}

export async function listPostsByProject(
  projectId: string,
  max?: number
): Promise<RedditPost[]> {
  // No orderBy here — avoids needing a composite index. Sort client-side.
  // No default cap: a search can easily land hundreds of posts, and silently
  // hiding them after a save is much worse than the cost of a few hundred reads.
  const snap = await getDocs(
    query(collection(db, 'reddit_posts'), where('projectId', '==', projectId))
  );
  const rows = snap.docs.map((d) =>
    parseTimestamps<RedditPost>({ ...d.data(), postId: d.id })
  );
  rows.sort((a, b) => b.createdAtReddit.getTime() - a.createdAtReddit.getTime());
  return max ? rows.slice(0, max) : rows;
}

export async function updatePostStatus(
  postId: string,
  status: RedditPostProcessingStatus
): Promise<void> {
  await updateDoc(doc(db, 'reddit_posts', postId), { processingStatus: status });
}

export async function setPostFavorite(
  postId: string,
  isFavorite: boolean
): Promise<void> {
  await updateDoc(doc(db, 'reddit_posts', postId), { isFavorite });
}

/**
 * Keeps the project's post list clean: after a new fetch/search, delete every
 * stored post EXCEPT the ones worth keeping —
 *   1. posts in `keepPostIds` (the current fetch/search result set),
 *   2. favorited posts (isFavorite === true),
 *   3. posts that already have a draft (a reply was generated for them).
 * Analyses belonging to deleted posts are removed too. Drafts are never
 * touched, and any post a draft points at is kept by rule 3.
 */
export async function purgeUnkeptPosts(
  projectId: string,
  keepPostIds: string[],
  opts: { onlySubreddits?: string[] } = {}
): Promise<{
  deletedPosts: number;
  deletedAnalyses: number;
  keptFavorites: number;
  keptDrafted: number;
}> {
  const [postsSnap, draftsSnap, analysesSnap] = await Promise.all([
    getDocs(query(collection(db, 'reddit_posts'), where('projectId', '==', projectId))),
    getDocs(query(collection(db, 'reddit_drafts'), where('projectId', '==', projectId))),
    getDocs(
      query(collection(db, 'reddit_opportunity_analyses'), where('projectId', '==', projectId))
    ),
  ]);

  const draftedPostIds = new Set(draftsSnap.docs.map((d) => d.data().postId as string));
  const freshIds = new Set(keepPostIds);
  // When staggering, only a subset of subreddits is refreshed per run — never
  // delete posts from subreddits that weren't part of this run.
  const scope = opts.onlySubreddits
    ? new Set(opts.onlySubreddits.map((s) => s.replace(/^\/?r\//i, '').toLowerCase()))
    : null;

  let keptFavorites = 0;
  let keptDrafted = 0;
  const toDelete = postsSnap.docs.filter((d) => {
    const data = d.data();
    if (scope && !scope.has(String(data.subreddit || '').toLowerCase())) return false;
    const isFav = data.isFavorite === true;
    const hasDraft = draftedPostIds.has(d.id);
    const isFresh = freshIds.has(d.id);
    // Tally what's kept (only count posts NOT in the fresh result set, so the
    // numbers reflect "extra history retained" rather than the current batch).
    if (!isFresh && isFav) keptFavorites++;
    if (!isFresh && !isFav && hasDraft) keptDrafted++;
    return !isFav && !hasDraft && !isFresh;
  });

  const deleteIds = new Set(toDelete.map((d) => d.id));
  const analysesToDelete = analysesSnap.docs.filter((d) =>
    deleteIds.has(d.data().postId as string)
  );

  await Promise.all([
    ...toDelete.map((d) => deleteDoc(d.ref)),
    ...analysesToDelete.map((d) => deleteDoc(d.ref)),
  ]);

  return {
    deletedPosts: toDelete.length,
    deletedAnalyses: analysesToDelete.length,
    keptFavorites,
    keptDrafted,
  };
}

// ---- Opportunity Analyses ----

export async function createAnalysis(
  data: Omit<RedditOpportunityAnalysis, 'analysisId' | 'createdAt'>
): Promise<string> {
  const ref = await addDoc(collection(db, 'reddit_opportunity_analyses'), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function listAnalysesByProject(
  projectId: string
): Promise<RedditOpportunityAnalysis[]> {
  const snap = await getDocs(
    query(
      collection(db, 'reddit_opportunity_analyses'),
      where('projectId', '==', projectId)
    )
  );
  const rows = snap.docs.map((d) =>
    parseTimestamps<RedditOpportunityAnalysis>({ ...d.data(), analysisId: d.id })
  );
  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

// ---- Drafts ----

export async function createDraft(
  data: Omit<RedditDraft, 'draftId' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const ref = await addDoc(collection(db, 'reddit_drafts'), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function listDraftsByProject(
  projectId: string
): Promise<RedditDraft[]> {
  const snap = await getDocs(
    query(collection(db, 'reddit_drafts'), where('projectId', '==', projectId))
  );
  const rows = snap.docs.map((d) =>
    parseTimestamps<RedditDraft>({ ...d.data(), draftId: d.id })
  );
  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function updateDraftStatus(
  draftId: string,
  status: DraftStatus,
  reviewerNotes?: string
): Promise<void> {
  await updateDoc(doc(db, 'reddit_drafts', draftId), {
    status,
    ...(reviewerNotes !== undefined ? { reviewerNotes } : {}),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Marks a draft posted and records WHICH account posted it and the resulting
 * permalink. Used by the "Reply from tool" flow (distinct from the manual
 * "Mark posted" button, which just flips status with no attribution).
 */
export async function markDraftPosted(
  draftId: string,
  info: { accountId: string; permalink: string }
): Promise<void> {
  await updateDoc(doc(db, 'reddit_drafts', draftId), {
    status: 'posted' satisfies DraftStatus,
    postedByAccountId: info.accountId,
    postedPermalink: info.permalink,
    postedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

// ---- Accounts ----
// The Reddit identities the tool can post from. Metadata only — secrets live
// server-side in env vars keyed by `credentialKey` (see redditPost.ts).

export async function listAccounts(): Promise<RedditAccount[]> {
  // No orderBy — avoid a composite index; sort client-side.
  const snap = await getDocs(collection(db, 'reddit_accounts'));
  const rows = snap.docs.map((d) =>
    parseTimestamps<RedditAccount>({ ...d.data(), accountId: d.id })
  );
  return rows.sort((a, b) => a.label.localeCompare(b.label));
}

export async function getAccount(accountId: string): Promise<RedditAccount | null> {
  const snap = await getDoc(doc(db, 'reddit_accounts', accountId));
  if (!snap.exists()) return null;
  return parseTimestamps<RedditAccount>({ ...snap.data(), accountId: snap.id });
}

export async function createAccount(
  data: Omit<RedditAccount, 'accountId' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const ref = await addDoc(collection(db, 'reddit_accounts'), {
    ...data,
    postCountResetAt: data.postCountResetAt
      ? Timestamp.fromDate(data.postCountResetAt)
      : serverTimestamp(),
    lastPostAt: data.lastPostAt ? Timestamp.fromDate(data.lastPostAt) : null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateAccount(
  accountId: string,
  data: Partial<RedditAccount>
): Promise<void> {
  await updateDoc(doc(db, 'reddit_accounts', accountId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteAccount(accountId: string): Promise<void> {
  await deleteDoc(doc(db, 'reddit_accounts', accountId));
}

/**
 * Rolling-window post-rate accounting. Called after a successful post.
 * Resets the daily counter when the current 24h window has elapsed, then
 * increments. Returns the new counter state so the caller can update UI.
 */
export async function recordAccountPost(
  account: RedditAccount,
  nowMs: number
): Promise<{ postCountToday: number; postCountResetAt: Date; lastPostAt: Date }> {
  const windowMs = 24 * 60 * 60 * 1000;
  const resetMs = account.postCountResetAt?.getTime?.() ?? 0;
  const windowExpired = !resetMs || nowMs - resetMs >= windowMs;

  const postCountResetAt = windowExpired ? new Date(nowMs) : account.postCountResetAt;
  const postCountToday = (windowExpired ? 0 : account.postCountToday) + 1;
  const lastPostAt = new Date(nowMs);

  await updateDoc(doc(db, 'reddit_accounts', account.accountId), {
    postCountToday,
    postCountResetAt: Timestamp.fromDate(postCountResetAt),
    lastPostAt: Timestamp.fromDate(lastPostAt),
    updatedAt: serverTimestamp(),
  });

  return { postCountToday, postCountResetAt, lastPostAt };
}

/**
 * Pure helper (no I/O): given an account and "now", decide whether it may post
 * right now under its own rails. Mirrors the reset logic in recordAccountPost so
 * the UI and the write agree. Returns a reason string when blocked.
 */
export function accountPostGate(
  account: RedditAccount,
  nowMs: number
): { ok: boolean; reason?: string; remainingToday: number; nextAllowedAt: Date | null } {
  const windowMs = 24 * 60 * 60 * 1000;
  const resetMs = account.postCountResetAt?.getTime?.() ?? 0;
  const windowExpired = !resetMs || nowMs - resetMs >= windowMs;
  const usedToday = windowExpired ? 0 : account.postCountToday;
  const remainingToday = Math.max(0, account.dailyCap - usedToday);

  const lastMs = account.lastPostAt?.getTime?.() ?? 0;
  const intervalMs = account.minIntervalMinutes * 60 * 1000;
  const nextAllowedAt = lastMs ? new Date(lastMs + intervalMs) : null;

  if (account.status === 'banned')
    return { ok: false, reason: 'Account is banned.', remainingToday, nextAllowedAt };
  if (account.status === 'flagged')
    return {
      ok: false,
      reason: 'Account is flagged (possible shadowban) — review before posting.',
      remainingToday,
      nextAllowedAt,
    };
  if (remainingToday <= 0)
    return {
      ok: false,
      reason: `Daily cap reached (${account.dailyCap}/day).`,
      remainingToday,
      nextAllowedAt,
    };
  if (lastMs && nowMs - lastMs < intervalMs)
    return {
      ok: false,
      reason: `Too soon — wait ${account.minIntervalMinutes}m between posts.`,
      remainingToday,
      nextAllowedAt,
    };
  return { ok: true, remainingToday, nextAllowedAt };
}

// ---- Post Jobs (queue consumed by the local AdsPower agent) ----

export async function createPostJob(
  data: Omit<
    RedditPostJob,
    'jobId' | 'status' | 'attempts' | 'createdAt' | 'updatedAt'
  >
): Promise<string> {
  const ref = await addDoc(collection(db, 'reddit_post_jobs'), {
    ...data,
    status: 'queued' satisfies RedditPostJob['status'],
    attempts: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/**
 * Subscribe to the local agent's heartbeat (reddit_agent_status/agent). The UI
 * uses lastSeenAt to decide if the agent is online.
 */
export function subscribeAgentStatus(
  cb: (status: RedditAgentStatus | null) => void
): () => void {
  return onSnapshot(
    doc(db, 'reddit_agent_status', 'agent'),
    (snap) => {
      if (!snap.exists()) {
        cb(null);
        return;
      }
      cb(parseTimestamps<RedditAgentStatus>({ ...snap.data() }));
    },
    (err) => {
      console.error('subscribeAgentStatus failed:', err);
      cb(null);
    }
  );
}

/**
 * Subscribe to a single post job — the draft card reflects
 * queued → posting → posted/failed as the local agent progresses.
 */
export function subscribePostJob(
  jobId: string,
  cb: (job: RedditPostJob | null) => void
): () => void {
  return onSnapshot(
    doc(db, 'reddit_post_jobs', jobId),
    (snap) => {
      if (!snap.exists()) {
        cb(null);
        return;
      }
      cb(parseTimestamps<RedditPostJob>({ ...snap.data(), jobId: snap.id }));
    },
    (err) => {
      console.error('subscribePostJob failed:', err);
      cb(null);
    }
  );
}
