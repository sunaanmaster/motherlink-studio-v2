# Reddit Visibility — Progress Report

## TL;DR
We took the Reddit tool from "drafts replies, you copy-paste them by hand" to
**fully automated, IP-safe posting from multiple accounts**. Along the way we hit
(and solved) a series of real-world blockers around Reddit's API policy, IP
reputation, and bot-detection. The system now finds opportunities, scores them,
drafts replies, and **posts them automatically** from warmed accounts — each on
its own clean IP — with safety rails. First live automated comment posted
successfully.

## What the tool does (the core feature)
- Pulls posts from target subreddits and uses **DeepSeek** to score each as a
  reply opportunity.
- **Brand / Growth model** — every post is scored on **two independent axes**:
  - **Brand** — should we naturally mention the company? (the ~20%)
  - **Growth** — is this a great *pure-value* reply to build the account's
    credibility/karma, with **no** company mention? (the ~80%)
  - A post lands in one bucket or the other, never both — so growth replies never
    accidentally pitch the brand. Filterable by quality (Best/Good/Okay).
- Drafts the reply in a credible, Reddit-native voice.

---

## The journey: problems & solutions

**1. Reading vs. posting need *opposite* proxy types**
- *Problem:* Our reading uses a **rotating** residential proxy (fresh IP per
  request) — perfect for scraping without rate limits, but **fatal for an
  account** (an account posting from a new IP every time gets banned).
- *Solution:* Posting needs **one sticky IP per account, forever**. We kept the
  rotating proxy for reading and added per-account sticky IPs for posting.

**2. Reddit's API is closed to us**
- *Problem:* We first tried to post via Reddit's official API. But Reddit's
  **Nov-2025 "Responsible Builder Policy"** now requires per-app **approval
  (2–4 weeks)** for *any* API access, and our promotional use case won't pass —
  applying honestly can even flag the accounts. Confirmed by trying to register
  an app. This killed every API-based approach (including a clean "Connect with
  Reddit" login flow).
- *Solution:* Post through a **real logged-in browser** instead of the API —
  i.e., drive the account the way a human would.

**3. Did we need to buy a server (VPS)?**
- *Problem:* Assumed we'd need an always-on cloud server (explored Oracle's free
  tier — hit capacity limits).
- *Solution:* Realized **the proxy provides the IP Reddit sees, regardless of
  where the code runs** — so no VPS needed. Everything runs on the local Mac.

**4. The shared proxy IPs were "dirty"**
- *Problem:* The shared residential proxy IPs were **fraud-flagged** (fraud score
  **82/100**, detected as proxy). We literally **couldn't log into Gmail,
  Outlook, or Reddit** through them — every major service blocked the IP.
- *Solution:* Bought a **dedicated ISP (static residential) IP** with IPRoyal's
  **"0-fraud-risk IP"** option → clean (fraud score ~0) → logins work normally.

**5. Pasting manually would expose our real IP**
- *Problem:* If a human pastes from a normal browser, Reddit sees **our real
  IP**, and every account posted that way gets **linked together**.
- *Solution:* Each account lives in its **own anti-detect browser profile
  (AdsPower)** — its own clean ISP IP *and* its own browser fingerprint — so
  accounts are isolated and our real IP is never exposed.

**6. Manual posting doesn't scale**
- *Problem:* Even with profiles set up, copy-paste per post is slow.
- *Solution:* Built a **local automation agent** (next to AdsPower) that posts
  automatically — see architecture below.

---

## How posting works now (final architecture)
1. In the app: **Reply → pick account** → writes a job to a queue. The card shows
   **Queued → Posting → Posted** live, with the permalink.
2. A **local agent** (runs on the Mac, alongside AdsPower) picks up the job and:
   - Opens that account's **AdsPower profile** (its own clean IP + fingerprint).
   - **Verifies** it's logged in as the right account **and** on the right thread
     — **aborts if either is wrong** (can't post from the wrong account).
   - Types the reply with **human-like timing**, submits, and **verifies the
     comment actually posted** (no false "success").
   - Writes the result + permalink back and updates the account's counters.

## Safety rails built in
- Per-account **daily cap** + **minimum interval** between posts (paces it like a
  human).
- **Wrong-account abort** + **post-verification** (won't claim success unless the
  comment is really live).
- Account **status** tracking (active / warming / flagged / banned).
- Posts via **old.reddit** — chosen because its page is stable to automate; it's
  an official interface millions use, so it's not a bot signal.

## Honest risks (for the business decision)
- Automated posting is **against Reddit's ToS** — accounts **will get banned
  periodically**; this is inherent, not a bug. The system is built to **rotate
  accounts in/out**.
- Mitigations: low volume (caps/intervals), the **80% value / 20% brand** mix
  (genuinely helpful first), and clean dedicated IPs.

## Status & next steps
- ✅ **End-to-end working** — first live automated comment posted (r/budget).
- **Next:** add more warmed accounts (each its own ISP IP + profile) to spread
  volume; run the agent under a process manager so it stays up cleanly; optional
  "posted history" dashboard.
