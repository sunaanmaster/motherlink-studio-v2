# Motherlink Poster (menu-bar app)

A macOS menu-bar app that runs the Reddit posting agent — **no terminal, no Node,
no pm2**. It bundles the tested agent (`../reddit-poster-agent`) inside the app.
For the **one posting station** (the Mac with AdsPower + the account profiles).

## For the person who uses it (zero terminal)
1. Install: double-click **Motherlink Poster.dmg** → drag to Applications → open.
   (First open: right-click → **Open** once, to get past the "unidentified
   developer" warning if the app isn't code-signed.)
2. The **Settings** window opens on first launch:
   - **Choose** your Firebase `service-account.json`.
   - Confirm the AdsPower Local API URL (default `http://127.0.0.1:50325`).
   - Set the tool URL (your Vercel or localhost address).
   - Leave "Dry run" **off** to post for real.
   - **Save & Start.**
3. A **🟢 Poster** appears in the menu bar. Keep **AdsPower open** and the Mac
   awake. That's it — replies queued in the tool post automatically.

Menu bar → Start / Stop / Restart / posts this session / Open the tool / Settings.
It also auto-starts at login.

## For whoever builds the .dmg (one-time, technical)
```bash
cd motherlink-poster
npm install
npm run dist        # → dist/Motherlink Poster-1.0.0.dmg
```
Prereqs: the sibling `../reddit-poster-agent` must have its deps installed
(`npm install` there) — they get bundled into the app.

- **Only run ONE agent.** If you previously ran the agent under pm2, stop it
  (`pm2 stop reddit-agent`) so you don't have two posting at once.
- **Code-signing (optional but nicer):** without an Apple Developer cert, users
  right-click → Open once. With one, set `build.mac.identity` and notarize so it
  opens cleanly.
- The agent is bundled unchanged; to update posting logic, edit
  `../reddit-poster-agent/index.mjs` and rebuild.
