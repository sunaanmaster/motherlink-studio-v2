# Reddit poster agent (local)

Runs on **your Mac**, next to AdsPower. It drains the `reddit_post_jobs` queue
the tool writes, and for each job it opens the right **AdsPower profile**,
**verifies** the logged-in account + the thread, types the reply like a human,
and submits. No VPS — your computer + AdsPower is the runtime.

## How a post flows

1. In the tool: **Opportunities → draft → Reply → pick account** → writes a job.
2. This agent (running) claims it →
   - opens the account's **AdsPower profile** (Local API),
   - **aborts** if the logged-in user ≠ the account's Reddit username,
   - **aborts** if it's not on the expected thread,
   - types the reply with human-like timing, **submits**,
   - writes back `posted` + permalink, and ticks the account's counters.

The verification means it **can never post from the wrong account** — if the
profile isn't logged into the expected user, the job fails instead of posting.

## One-time setup

```bash
npm install                       # installs firebase-admin + puppeteer-core
cp .env.example .env              # then: chmod 600 .env
# put the Firebase service-account JSON next to index.mjs as service-account.json
```

Prereqs:
- **AdsPower is running**, and **Settings → Local API is enabled** (default port 50325).
- Each account on the Accounts page has its **AdsPower profile ID** filled in
  (AdsPower shows it on the profile), and its **Reddit username** is the exact
  handle (no email). The profile must be **logged into that account** already
  (you did this once, on its sticky IP).

### Where to find the AdsPower profile ID
In AdsPower, open the profile list — each profile has an ID (e.g. `k1abcd23`).
Put that into the account's **"AdsPower profile ID"** field in the tool.

## Run

```bash
npm start            # = node --env-file=.env index.mjs
```

Leave it running while you work. Click **Reply** in the tool and watch the card
go **Queued → Posting → Posted**, while the AdsPower profile pops up and posts.

## Start safe: DRY_RUN

`.env` ships with **`DRY_RUN=1`** — the agent does everything *except the final
submit*: opens the profile, verifies account + thread, types the comment, then
stops. Watch the first few jobs do this correctly, then set **`DRY_RUN=0`** and
restart to post for real.

## Notes & limits

- Posts via **old.reddit.com** (stable markup). Make sure the account works on
  old.reddit (it will if it's logged into reddit.com — same session).
- **One job at a time**, oldest first; it re-checks the account's daily cap /
  min interval before posting (interval-blocked jobs go back to the queue).
- Reddit changes its HTML occasionally — if posting starts failing with "could
  not find the comment box", the selectors in `postComment()` need a tweak.
- This is browser automation of Reddit, which is against Reddit's ToS; accounts
  still get banned periodically. Keep volume human (the caps/intervals help).
- Keep `.env` and `service-account.json` out of git (already in `.gitignore`).
