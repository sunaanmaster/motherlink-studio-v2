# Reddit posting — per-account browser profile setup

**Why this exists:** Reddit's API is gated (Nov-2025 Responsible Builder Policy
requires approval, which our use case won't get), so the tool does **not** post
automatically. Instead it **drafts the reply, copies it, and opens the thread** —
you paste + submit by hand. The catch: if you paste from your normal browser,
Reddit sees **your real IP**, and every account you post from that browser gets
**linked together**. So each account must post from its **own browser profile,
bound to its own sticky IP** (the IPRoyal sessions we set up).

Do this once per account. After that, posting is: tool → copy + open → switch to
that account's profile → paste → submit.

## What you need per account

1. **A Reddit account** (the one you'll post from).
2. **A dedicated sticky IPRoyal IP** for it — already generated. The full list is
   in `.env.local` (commented, under "Reddit posting: per-account STICKY
   proxies"). Each account gets **one unique** line (different `session-...`).
3. **A browser profile** bound to that proxy + its own fingerprint.

## Recommended: an anti-detect / multi-account browser

These are built for exactly this — one profile per account, each with its own
proxy **and** its own browser fingerprint (so Reddit can't link accounts by
device either). All have free tiers big enough to start:

- **AdsPower** — generous free tier, easy proxy-per-profile.
- **GoLogin** — free trial / cheap; clean UI.
- **Dolphin Anty** — free tier up to ~10 profiles.

### Steps (same idea in any of them)

1. **Create a new profile** named after the account (e.g. `acct1 – Matthew`).
2. **Set the proxy** for that profile. Choose **HTTP**, and enter the sticky IP
   for this account from `.env.local`. The format there is
   `host:port:user:pass`, which maps to the fields like:
   - Host: `geo.iproyal.com`
   - Port: `12321`
   - Username: `JQ4Gz0ccNwE2qusa`
   - Password: `IohLwXcSuQMlXUGH_country-us_city-chicago_session-a0aHn7zt_lifetime-59m`
     *(the long one — the `_session-...` part is what pins this account's IP;
     use a DIFFERENT session line for each account)*
3. **Test the proxy** inside the tool (most have a "check proxy" button) — it
   should show a **US / Chicago** IP.
4. **Launch the profile** and go to **reddit.com** → **log into this account**.
   2FA happens here, normally, in the browser. Stay logged in.
5. Repeat for each account, **one unique sticky line each**.

> Bump the sticky `lifetime` in IPRoyal (e.g. from `59m` to hours/days) so the
> IP stays put longer — more stable = safer for the account.

### Lighter option (1–2 accounts, less robust)

Skip the anti-detect browser and just use a separate normal browser profile per
account with a proxy extension (e.g. **FoxyProxy**) set to that account's sticky
IP. Works for IP isolation, but does **not** isolate the browser fingerprint, so
it's weaker if you run several accounts. Fine for one or two.

## Daily posting flow

1. In the app: **Opportunities** → pick a draft → **Reply** → choose the account.
   - The draft is **copied** and the **thread opens in a new tab**.
   - The draft is marked **posted** from that account, and its daily cap /
     interval counter ticks (the tool paces you — respect the "N left today").
2. Switch to **that account's browser profile** (the one on its sticky IP).
3. Open the thread there (paste the URL if needed), **paste** the reply, submit.

That's it — each account posts only from its own consistent US IP, your real IP
is never exposed to Reddit, and accounts stay unlinked.

## Safety reminders

- **One account ↔ one sticky IP ↔ one profile.** Never mix.
- Keep volume human: the per-account **daily cap** and **min interval** in the
  tool are there for a reason — don't blow past them.
- Mix ~20% brand / 80% pure-value (growth) replies, per the strategy.
- Accounts still get banned sometimes — it's inherent to this. Warm new ones in
  the background and rotate them in via the Accounts page.
