# Reddit Visibility — Session Handoff

_Last updated: 2026-06-26. Hand this to a new session to continue the work._

## What this feature is
An internal tool in the Motherlink app that pulls posts from target subreddits,
uses **DeepSeek** to score each post as a reply opportunity, and helps draft
Reddit replies. Two goals:
1. **Brand** mentions — reply where naming the company fits.
2. **Growth / account warming** — reply with pure value (no mention) to build
   the account's karma/credibility. Target mix ≈ 20% brand / 80% growth.

Drafts are **copy-paste, human-posted** — the app never auto-posts to Reddit.

## Where it lives
- UI page (the hub): `src/app/(apps)/apps/reddit-visibility/[projectId]/opportunities/page.tsx`
- API routes: `src/app/api/reddit-visibility/`
  - `fetch-posts/route.ts` — RSS fetch (per-subreddit), proxy-aware, browser UA
  - `search-posts/route.ts` — keyword search via Reddit search RSS
  - `analyze-post/route.ts` — DeepSeek analysis (JSON mode), returns structured analysis
  - `generate-draft/route.ts` — DeepSeek draft generation (plain text)
- Lib: `src/lib/reddit-visibility/`
  - `prompts.ts` — analysis + draft prompt builders, prompt versions
  - `types.ts` — all types
  - `firestore.ts` — Firestore helpers (CRUD, purge, favorites)
  - `redditClient.ts` — client→route fetch wrappers (`fetchAllSubreddits`, `searchSubreddits`)
  - `throttle.ts` — **client-safe** helpers (`sleep`, `runThrottled`, `Settled`)
  - `redditFetch.ts` — **SERVER-ONLY** (`fetchWithRetry` + residential-proxy dispatcher; imports `undici`)

## Data source — how we landed here (important context)
Tried and rejected, in order: Apify (slow + the good actor is $45/mo rental),
direct `.json` (HTTP 403 — Reddit hard-blocks it for this IP), `old.reddit`
(429), heavier scrapers (YARS / Scrapling / reddit-universal-scraper — all
Python, wrong stack, all punt to proxies). Official OAuth API works but now has
a **Nov-2025 pre-approval gate** the user didn't want.

**Current solution (working): RSS via residential proxy.**
- Endpoint: `https://www.reddit.com/r/<sub>/new/.rss` (only endpoint returning 200 for this IP).
- **Browser User-Agent** is required (Reddit throttles bot UAs hard).
- Routed through **IPRoyal rotating residential proxy** → fresh exit IP per request → no rate limit.
- Apify code was **fully removed** this session.

## Environment (`.env.local`, restart dev server after changes)
- `DEEPSEEK_API_KEY` — for analyze + draft (DeepSeek `deepseek-chat`).
- `REDDIT_PROXY_URL` — IPRoyal residential. Accepts `http://user:pass@host:port`
  OR `host:port:user:pass` (IPRoyal "Copy list" format). Currently
  `geo.iproyal.com:12321` rotating. Auth is sent as a Basic **token** in
  `redditFetch.ts` so special chars in the password don't break URL parsing.
  If unset, fetch falls back to direct (will get rate-limited).
- `APIFY_TOKEN` — **now unused** (Apify removed). Safe to delete from `.env.local`.

## Data model (`types.ts` → `RedditOpportunityAnalysis`)
Analysis prompt version is **`v3`** (`ANALYSIS_PROMPT_VERSION` in prompts.ts).
Key fields:
- `decision` (reply|maybe|skip), `score` (1-100 brand relevance)
- `mentionRecommendation` (yes|soft|no)
- `riskLevel`, `reason`, `suggestedAngle`, `relevantSourceIds`
- `growthScore` (1-100, optional) — value/karma opportunity, **independent of brand**
- `growthAngle` (optional) — brand-free angle for a value reply

Posts: `RedditPost` has `isFavorite?` (starred posts survive purge).

## The Brand/Growth model (current UX)
**Mutually exclusive buckets**, derived in `page.tsx` from analysis:
- `isBrandPost`  = decision≠skip AND mention ∈ {yes, soft}. Quality = `score`.
- `isGrowthPost` = mention === 'no' AND `growthScore ≥ 40` (`GROWTH_MIN`). Quality = `growthScore`.
- A post is one, the other, or neither — never both. This is why generating
  from Growth never inserts the company name (Growth = mention 'no').

**Filters (tabs):** `All · Brand · Growth · Unanalyzed` (+ `Search` when active).
**Quality sub-filter** (only shown for Brand/Growth): `Any · Best 75+ · Good 60+ · Okay 40+`
(`QUALITY_FLOOR` map). Lists sort best-first.

**Cards** show one badge: `BRAND · {score}` or `GROWTH · {growthScore}`, plus
RISK only when medium/high. NEW + ANSWERED still show as badges.

**Draft generation:** allowed for brand OR growth posts (route guard updated).
Growth posts (mention 'no') produce pure-value replies with no company name;
the draft prompt passes `growthAngle` and an explicit "do NOT name the company"
instruction when mention is 'no'.

## Fetch + Analyze behavior
- **Fetch** loops all target subreddits one at a time (~0.8–1.5s jittered gap),
  streams results in, purges stale posts **scoped to the subs that succeeded**
  (favorites + posts-with-drafts always kept; empty/failed runs never wipe).
- **Stop:** while running, Fetch and Analyze buttons become red **"Stop (n/total)"**;
  clicking sets a ref (`fetchStop` / `analyzeStop`) the loop checks each iteration.
  Everything already fetched/analyzed is preserved (analyses are saved per-post).

## Key gotchas (don't re-trip these)
- **`undici` is server-only.** It needs `node:net`. It must NEVER be imported by
  a client component. That's why proxy code lives in `redditFetch.ts` (server)
  and `throttle.ts` stays client-safe. The page imports `sleep` from throttle.
- **Reddit `.json` = 403 for this IP**; only RSS via proxy works. Don't switch to `.json`.
- **Browser UA matters** — both fetch + search routes use a Chrome UA.
- **Growth needs v3 analysis.** Posts analyzed before v3 have no `growthScore`
  and won't appear in Growth until re-analyzed.
- `purgeUnkeptPosts(projectId, keepPostIds, { onlySubreddits })` — pass the
  succeeded subs so a transient 429 doesn't delete a sub's existing posts.
- This is the non-standard Next.js (v16.2.5 Turbopack) — see `AGENTS.md`. Match
  existing route patterns; read `node_modules/next/dist/docs/` before using new Next APIs.

## Posting from the tool ("Reply from tool" = local AdsPower agent, auto-post)
A draft card has a **Reply** button → **account picker** → it enqueues a job that
a **local agent** posts by driving that account's AdsPower browser profile.

**Why this shape:** Reddit's API is gated — the **Nov-2025 Responsible Builder
Policy** requires per-app approval (confirmed: `prefs/apps` registration demands
an approval application), and our promotional-reply use case won't pass / risks
bans. So all API paths are dead. Posting therefore happens through a real
logged-in **browser** (AdsPower / SunBrowser), one profile per account, each on
its own clean **dedicated ISP** sticky IP (the shared rotating-residential pool
is fraud-flagged and can't even log in — see the saga; we moved to IPRoyal ISP
+ the "0 fraud risk IP" option). Reddit only ever sees the clean per-account IP.

**Architecture (app on Vercel/local; agent on the Mac next to AdsPower):**
- App enqueues a job to Firestore `reddit_post_jobs` (`createPostJob`) and
  subscribes (`subscribePostJob`). Card shows **Queued → Posting → Posted/Failed**.
- **Agent** = `reddit-poster-agent/` (standalone Node; firebase-admin +
  puppeteer-core). Polls the queue, claims a job, calls the **AdsPower Local API**
  to open the account's profile, **verifies** the logged-in user == the account's
  Reddit username AND that it's on the right thread (**aborts otherwise — can't
  post from the wrong account**), types the reply with human-like timing, submits
  via **old.reddit.com** (stable markup), then writes back `posted` + permalink +
  ticks the account counters. `DRY_RUN=1` types-but-doesn't-submit for safe
  first runs. See `reddit-poster-agent/README.md`.
- No VPS — the Mac + AdsPower is the runtime. The agent must be running, AdsPower
  open with Local API enabled.

**Where it lives:**
- Job model: `RedditPostJob` in `types.ts`; `createPostJob` + `subscribePostJob`
  in `firestore.ts` (`reddit_post_jobs`).
- Accounts model: `RedditAccount` (now has **`adsPowerProfileId`**) + CRUD +
  `accountPostGate` in `firestore.ts` (`reddit_accounts`).
- Accounts UI: `accounts/page.tsx` — has the AdsPower profile ID field. Picker +
  `handlePostFromTool` (enqueue + subscribe) in opportunities `page.tsx`.
- Agent: `reddit-poster-agent/index.mjs` (the Reddit interaction is `postComment()`).

**Per-account setup** (`REDDIT_POSTING_SETUP.md`): one AdsPower profile per
account, its dedicated ISP sticky proxy pasted into the profile, logged into the
Reddit account once; then put the **AdsPower profile ID** + exact **Reddit
handle** on the Accounts page.

**Sticky proxies** live in the AdsPower profiles, NOT the app. The rotating
`REDDIT_PROXY_URL` is still used by the app for *reading* (untouched).

**Detection note (researched):** with a real AdsPower profile driven over CDP,
the submit click is a *trusted* event and `navigator.webdriver` stays false, so
the click itself isn't the tell. Residual risk = automation-environment + (mainly)
account-level behavior; mitigated by human-like timing in the agent + caps. Full
ToS/ban reality still applies.

## Status
**Done & typecheck-clean:** RSS+proxy fetch, browser UA, stop buttons, Apify
removal, simplified tabs, mutually-exclusive Brand/Growth, quality filter,
growth scoring (v3), growth drafting (no mention), favorites, scoped purge,
draft capitalization fix (draft prompt `v2`), **Reply-from-tool = auto-post via a
LOCAL AdsPower agent (`reddit-poster-agent/`): job queue + per-account AdsPower
profile + account/thread verification + human-like typing via old.reddit.
Accounts have `adsPowerProfileId`. Reddit API gated; posting is browser-driven on
per-account dedicated ISP IPs. See REDDIT_POSTING_SETUP.md + the agent README.**

**Parked / next ideas (per user):**
- **Account "personality"** feature: per-account followed subreddits, hobbies,
  and interacting (not just posting) in those communities. Explicitly deferred.
- Possible tuning: `GROWTH_MIN` (40), quality thresholds, fetch gap.
- Cleanup (optional): remove now-dead `decisionStyle`, `statusBadge`,
  `lastSearchKeywords` in page.tsx (harmless; `noUnusedLocals` is off). Remove
  unused `APIFY_TOKEN` from `.env.local`.
- If deploying to Vercel: fetch must run from a residential IP — the proxy
  handles that, but confirm timeouts (each fetch is one short per-sub call now).

## Run / test
```
cd "/Users/sayeed/Ai projects/ML Studio/motherlink-app"
npm run dev   # http://localhost:3000
npx tsc --noEmit -p tsconfig.json   # typecheck
```
Test loop: Fetch → Analyze → Growth tab → Best quality → Generate draft →
confirm NO company name in growth drafts.
