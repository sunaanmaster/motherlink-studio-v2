// ============================================================
// Reddit poster agent (LOCAL — runs on your Mac next to AdsPower)
//
// Drains the `reddit_post_jobs` Firestore queue. For each job it:
//   1. opens the account's AdsPower (SunBrowser) profile via the Local API,
//   2. VERIFIES the logged-in user == the expected account (aborts if not),
//   3. VERIFIES it's on the correct thread (aborts if not),
//   4. types the reply with human-like timing and submits,
//   5. writes the result back (draft/post/account counters).
//
// Posting uses old.reddit.com — its markup is stable and scriptable, unlike the
// new React UI. The browser is a real AdsPower profile on the account's sticky
// IP, so the fingerprint/IP are already legit; we only drive it.
//
// DRY_RUN=1 does everything EXCEPT the final submit (open, verify, type, stop).
// ============================================================

import { readFileSync } from 'node:fs';
import admin from 'firebase-admin';
import puppeteer from 'puppeteer-core';

// ---- Config ----
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 5000);
const SERVICE_ACCOUNT_PATH = process.env.SERVICE_ACCOUNT_PATH || './service-account.json';
const ADSPOWER_API = (process.env.ADSPOWER_API || 'http://local.adspower.net:50325').replace(/\/$/, '');
const DRY_RUN = String(process.env.DRY_RUN || '').trim() === '1';
const CLOSE_AFTER = String(process.env.CLOSE_AFTER || '').trim() === '1';

// ---- Firebase admin ----
const serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const { FieldValue, Timestamp } = admin.firestore;

const log = (...a) => console.log(new Date().toISOString(), ...a);
const rand = (min, max) => Math.floor(min + Math.random() * (max - min));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- AdsPower Local API ----
async function adspower(path) {
  const res = await fetch(`${ADSPOWER_API}${path}`);
  const json = await res.json().catch(() => ({}));
  if (json.code !== 0) throw new Error(`AdsPower API ${path}: ${json.msg || 'unknown error'}`);
  return json.data;
}
async function startProfile(profileId) {
  // open_tabs=1 keeps it from restoring a pile of tabs; headless=0 = visible.
  return adspower(`/api/v1/browser/start?user_id=${encodeURIComponent(profileId)}&open_tabs=1&headless=0`);
}
async function stopProfile(profileId) {
  try {
    await adspower(`/api/v1/browser/stop?user_id=${encodeURIComponent(profileId)}`);
  } catch (e) {
    log('stopProfile warning:', e.message);
  }
}

// ---- Reddit helpers ----
function toOldReddit(url) {
  try {
    const u = new URL(url);
    u.hostname = 'old.reddit.com';
    return u.toString();
  } catch {
    return url;
  }
}

// Type like a person: focus, then char-by-char with jittered delays + the odd
// longer pause.
async function typeHuman(page, selector, text) {
  await page.waitForSelector(selector, { visible: true, timeout: 20000 });
  await page.click(selector);
  await sleep(rand(300, 900));
  for (const ch of text) {
    await page.type(selector, ch, { delay: rand(35, 110) });
    if (Math.random() < 0.04) await sleep(rand(250, 800)); // occasional think-pause
  }
}

// Returns the logged-in username (or null) by reading old.reddit's header.
// DOM read (synchronous) — never hangs, unlike an in-page fetch.
async function loggedInUser(page) {
  try {
    return await page.evaluate(() => {
      // When logged in, old.reddit's top-right header has the username link
      // pointing at /user/<name>. Logged out, there is no such link.
      const a =
        document.querySelector('#header-bottom-right .user a[href*="/user/"]') ||
        document.querySelector('.user a[href*="/user/"]');
      const name = a && a.textContent ? a.textContent.trim() : '';
      return name || null;
    });
  } catch {
    return null;
  }
}

// Post a comment on a thread. Throws on any verification failure or error.
async function postComment({ wsEndpoint, threadUrl, redditPostId, expectedUsername, body }) {
  const browser = await puppeteer.connect({
    browserWSEndpoint: wsEndpoint,
    defaultViewport: null,
    protocolTimeout: 120000,
  });
  try {
    const pages = await browser.pages();
    const page = pages[0] || (await browser.newPage());
    await page.bringToFront().catch(() => {});
    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(45000);

    // 1) Verify the right account is logged in.
    await page.goto('https://old.reddit.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(rand(800, 1800));
    const who = await loggedInUser(page);
    if (!who) throw new Error('ABORT: no user is logged in to this AdsPower profile.');
    if (expectedUsername && who.toLowerCase() !== String(expectedUsername).toLowerCase())
      throw new Error(`ABORT: profile is logged in as "${who}", expected "${expectedUsername}".`);
    if (!expectedUsername)
      log(`WARNING: no expected username set — skipping the wrong-account safety check (logged in as "${who}").`);

    // 2) Go to the thread and verify it's the right one.
    const oldUrl = toOldReddit(threadUrl);
    await page.goto(oldUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(rand(1200, 2600));
    const onRightThread = await page.evaluate(
      (id) => document.location.href.includes(id) || !!document.querySelector(`[data-fullname="t3_${id}"]`),
      redditPostId
    );
    if (!onRightThread)
      throw new Error(`ABORT: not on the expected thread (${redditPostId}).`);

    // 3) Find the top-level comment box.
    const boxSel = 'div.commentarea > div.usertext textarea[name="text"]';
    const fallbackSel = 'div.commentarea textarea[name="text"]';
    const sel = (await page.$(boxSel)) ? boxSel : fallbackSel;
    if (!(await page.$(sel)))
      throw new Error('ABORT: could not find the comment box (locked/archived thread, or markup changed).');

    // 4) Type like a human.
    await typeHuman(page, sel, body);
    await sleep(rand(900, 2200));

    if (DRY_RUN) {
      log('DRY_RUN: typed the comment but NOT submitting.');
      return { ok: true, dryRun: true, permalink: '' };
    }

    // 5) Submit — click the button INSIDE the same form as the box we typed in
    // (old.reddit has a hidden reply form per comment; a loose selector hits the
    // wrong one). The button is "save".
    const taHandle = await page.$(sel);
    const btnHandle = await page.evaluateHandle((el) => {
      const form = el.closest('form');
      if (!form) return null;
      return (
        form.querySelector('button[type="submit"]') ||
        form.querySelector('button.save') ||
        Array.from(form.querySelectorAll('button')).find((b) =>
          /^(save|comment|reply|post)$/i.test((b.textContent || '').trim())
        ) ||
        form.querySelector('button')
      );
    }, taHandle);
    const submitBtn = btnHandle.asElement();
    if (!submitBtn) {
      await page.screenshot({ path: 'last-attempt.png' }).catch(() => {});
      throw new Error('ABORT: could not find the submit button in the comment form (saved last-attempt.png).');
    }
    log('submitting…');
    await sleep(rand(300, 800));
    await submitBtn.click().catch(() => {}); // trusted CDP click (auto-scrolls)
    await sleep(rand(2500, 4000));
    // If the box hasn't cleared, the coordinate click missed — fall back to a
    // direct click on the element (old.reddit responds to its own handler, which
    // is what a manual click triggers).
    let stillFull = await page.$eval(sel, (el) => el.value.trim().length > 0).catch(() => true);
    if (stillFull) {
      log('first click did not submit — trying a direct click…');
      await submitBtn.evaluate((el) => el.click());
      await sleep(rand(2500, 4000));
    }

    // 6) VERIFY it actually posted — no more assuming success.
    const check = await page.evaluate((user) => {
      // a) did old.reddit show an error (rate limit, restricted, etc.)?
      const errEl = document.querySelector('div.commentarea .error, .ratelimit, .status .error');
      const err = errEl && errEl.offsetParent !== null && errEl.textContent ? errEl.textContent.trim() : '';
      // b) did the top reply box clear? (still-full box = submit didn't register)
      const box =
        document.querySelector('div.commentarea > div.usertext textarea[name="text"]') ||
        document.querySelector('div.commentarea textarea[name="text"]');
      const boxText = box ? box.value : '';
      // c) can we see our freshly posted comment?
      let permalink = '';
      if (user) {
        const mine = Array.from(document.querySelectorAll('div.commentarea .comment')).find((c) => {
          const a = c.querySelector('a.author');
          return a && a.textContent.trim().toLowerCase() === String(user).toLowerCase();
        });
        permalink = mine?.querySelector('a.bylink')?.href || '';
      }
      return { err, boxText, permalink };
    }, expectedUsername);

    if (check.err) {
      await page.screenshot({ path: 'last-attempt.png' }).catch(() => {});
      throw new Error(`Reddit rejected the comment: "${check.err}" (saved last-attempt.png).`);
    }
    if (check.boxText && check.boxText.trim().length > 0) {
      await page.screenshot({ path: 'last-attempt.png' }).catch(() => {});
      throw new Error(
        'Submit did not register — the comment box still has the text. ' +
          'Likely the submit-button selector or an account restriction (saved last-attempt.png).'
      );
    }
    if (!check.permalink) {
      // Box cleared + no error, but we couldn't find the comment by author. Could
      // be a username mismatch or a shadowban (posts but hidden). Flag it loudly.
      log('WARNING: box cleared but could not confirm the comment by author — check username / shadowban.');
      await page.screenshot({ path: 'last-attempt.png' }).catch(() => {});
    }
    return { ok: true, dryRun: false, permalink: check.permalink };
  } finally {
    browser.disconnect();
  }
}

// ---- Account rails (mirror the app's accountPostGate / recordAccountPost) ----
const DAY_MS = 24 * 60 * 60 * 1000;
function gate(account, nowMs) {
  const resetMs = account.postCountResetAt?.toMillis?.() ?? 0;
  const windowExpired = !resetMs || nowMs - resetMs >= DAY_MS;
  const usedToday = windowExpired ? 0 : account.postCountToday || 0;
  const remaining = Math.max(0, (account.dailyCap || 0) - usedToday);
  const lastMs = account.lastPostAt?.toMillis?.() ?? 0;
  const intervalMs = (account.minIntervalMinutes || 0) * 60 * 1000;
  if (account.status === 'banned') return { ok: false, hard: true, reason: 'Account banned.' };
  if (account.status === 'flagged') return { ok: false, hard: true, reason: 'Account flagged.' };
  if (remaining <= 0) return { ok: false, hard: true, reason: `Daily cap reached (${account.dailyCap}).` };
  if (lastMs && nowMs - lastMs < intervalMs)
    return { ok: false, hard: false, reason: `Min interval not elapsed (${account.minIntervalMinutes}m).` };
  return { ok: true };
}
function nextCounters(account, nowMs) {
  const resetMs = account.postCountResetAt?.toMillis?.() ?? 0;
  const windowExpired = !resetMs || nowMs - resetMs >= DAY_MS;
  return {
    postCountToday: (windowExpired ? 0 : account.postCountToday || 0) + 1,
    postCountResetAt: windowExpired ? Timestamp.fromMillis(nowMs) : account.postCountResetAt,
    lastPostAt: Timestamp.fromMillis(nowMs),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

// ---- Heartbeat (so the app + menu bar know the agent is alive) ----
let postedSession = 0; // successful posts since this agent started

async function writeHeartbeat(queued) {
  try {
    await db.collection('reddit_agent_status').doc('agent').set(
      {
        lastSeenAt: FieldValue.serverTimestamp(),
        dryRun: DRY_RUN,
        queued,
        postedSession,
        pid: process.pid,
      },
      { merge: true }
    );
  } catch {
    // non-fatal — never let a heartbeat failure stop posting
  }
}

// ---- Job processing ----
const deferLogged = {}; // jobId → last time we logged a "waiting" message (throttle)

async function claimOldestQueuedJob() {
  const snap = await db.collection('reddit_post_jobs').where('status', '==', 'queued').limit(20).get();
  log(`poll — ${snap.size} queued job(s)`);
  await writeHeartbeat(snap.size);
  if (snap.empty) return null;
  const docs = snap.docs.sort(
    (a, b) => (a.data().createdAt?.toMillis?.() ?? 0) - (b.data().createdAt?.toMillis?.() ?? 0)
  );
  for (const d of docs) {
    const claimed = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(d.ref);
      if (!fresh.exists || fresh.data().status !== 'queued') return false;
      tx.update(d.ref, {
        status: 'posting',
        claimedAt: FieldValue.serverTimestamp(),
        attempts: (fresh.data().attempts || 0) + 1,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return true;
    });
    if (claimed) return d.ref;
  }
  return null;
}

async function failJob(ref, error) {
  await ref.update({
    status: 'failed',
    error: String(error).slice(0, 500),
    completedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  log(`job ${ref.id} FAILED: ${error}`);
}

async function processJob(ref) {
  const job = (await ref.get()).data();
  const nowMs = Date.now();

  if (!job.adsPowerProfileId) return failJob(ref, 'No AdsPower profile id on the job.');

  // Re-check rails against fresh account state.
  const accountRef = db.collection('reddit_accounts').doc(job.accountId);
  const accountSnap = await accountRef.get();
  if (!accountSnap.exists) return failJob(ref, 'Account no longer exists.');
  const account = accountSnap.data();
  const g = gate(account, nowMs);
  if (!g.ok) {
    if (g.hard) return failJob(ref, g.reason);
    // Interval not elapsed → put it back and re-check next poll using LIVE
    // account settings (so lowering the interval takes effect immediately).
    // Clear any stale notBefore from older agent versions.
    await ref.update({
      status: 'queued',
      notBefore: FieldValue.delete(),
      claimedAt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    const t = Date.now();
    if (!deferLogged[ref.id] || t - deferLogged[ref.id] > 60000) {
      log(`job ${ref.id} waiting: ${g.reason}`);
      deferLogged[ref.id] = t;
    }
    return 'deferred';
  }

  // Open the AdsPower profile.
  let data;
  try {
    data = await startProfile(job.adsPowerProfileId);
  } catch (e) {
    return failJob(ref, `AdsPower could not open profile ${job.adsPowerProfileId}: ${e.message}`);
  }
  const wsEndpoint = data?.ws?.puppeteer;
  if (!wsEndpoint) return failJob(ref, 'AdsPower did not return a Puppeteer endpoint.');
  await sleep(1500); // let the browser settle

  let result;
  try {
    result = await postComment({
      wsEndpoint,
      threadUrl: job.threadUrl,
      redditPostId: job.redditPostId,
      expectedUsername: job.expectedUsername,
      body: job.body,
    });
  } catch (e) {
    if (CLOSE_AFTER) await stopProfile(job.adsPowerProfileId);
    return failJob(ref, e.message);
  }
  if (CLOSE_AFTER) await stopProfile(job.adsPowerProfileId);

  if (result.dryRun) {
    await ref.update({
      status: 'failed',
      error: 'DRY_RUN — typed but did not submit. Set DRY_RUN=0 to post for real.',
      completedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    log(`job ${ref.id} DRY_RUN complete (not posted).`);
    return;
  }

  // Success → write job + draft + post + account counters together.
  const batch = db.batch();
  batch.update(ref, {
    status: 'posted',
    permalink: result.permalink || job.threadUrl,
    completedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.update(db.collection('reddit_drafts').doc(job.draftId), {
    status: 'posted',
    postedByAccountId: job.accountId,
    postedPermalink: result.permalink || job.threadUrl,
    postedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.update(db.collection('reddit_posts').doc(job.postId), { processingStatus: 'drafted' });
  batch.update(accountRef, nextCounters(account, nowMs));
  await batch.commit();
  postedSession += 1;
  log(`job ${ref.id} POSTED ${result.permalink || job.threadUrl}`);
}

// ---- Main loop ----
let running = true;
process.on('SIGINT', () => { running = false; });
process.on('SIGTERM', () => { running = false; });

async function main() {
  log(`agent started — DRY_RUN=${DRY_RUN}, poll=${POLL_INTERVAL_MS}ms, AdsPower=${ADSPOWER_API}, project=${serviceAccount.project_id}`);

  // One-time diagnostic: what jobs can the agent see at all?
  try {
    const all = await db.collection('reddit_post_jobs').get();
    log(`startup diagnostic: ${all.size} total job(s) in reddit_post_jobs`);
    all.docs.slice(0, 10).forEach((d) => {
      const j = d.data();
      log(`  • ${d.id} status=${j.status} sub=${j.subreddit}${j.error ? ` error="${j.error}"` : ''}`);
    });
  } catch (e) {
    log('startup diagnostic FAILED (Firestore read error):', e?.message || e);
  }

  while (running) {
    try {
      const ref = await claimOldestQueuedJob();
      if (ref) {
        const outcome = await processJob(ref);
        // If it was just deferred (waiting out its interval), fall through to the
        // poll sleep instead of immediately re-claiming it (no tight loop).
        if (outcome !== 'deferred') continue;
      }
    } catch (e) {
      log('loop error:', e?.message || e);
    }
    await sleep(POLL_INTERVAL_MS);
  }
  log('agent stopped.');
  process.exit(0);
}

main();
