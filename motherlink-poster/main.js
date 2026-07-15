// ============================================================
// Motherlink Poster — Electron menu-bar app.
//
// Wraps the tested posting agent (reddit-poster-agent/index.mjs, bundled as an
// app resource) in a friendly menu-bar UI. No terminal, no Node install, no pm2.
//
//   • Menu bar: 🟢/🔴 status, Start / Stop, posts this session, open the tool.
//   • First run: a Settings window to pick the Firebase key (once).
//   • Auto-starts at login; the agent runs as a managed child process.
//
// The agent is unchanged — it reads its config from env vars, which we set here
// from the saved settings instead of a .env file.
// ============================================================

const { app, Tray, Menu, BrowserWindow, dialog, ipcMain, shell, nativeImage } = require('electron');
const { fork } = require('child_process');
const path = require('path');
const fs = require('fs');

const isDev = !app.isPackaged;
const userData = app.getPath('userData');
const CONFIG_PATH = path.join(userData, 'config.json');
const SA_DEST = path.join(userData, 'service-account.json'); // copied Firebase key

// Where the bundled agent lives (dev vs packaged).
const agentDir = isDev
  ? path.join(__dirname, '..', 'reddit-poster-agent')
  : path.join(process.resourcesPath, 'agent');
const agentEntry = path.join(agentDir, 'index.mjs');

const DEFAULT_CONFIG = {
  adspowerApi: 'http://127.0.0.1:50325',
  dryRun: false,
  toolUrl: 'http://localhost:3005/apps/reddit-visibility',
};

let tray = null;
let settingsWin = null;
let agentProc = null;
let postedSession = 0;
let lastLine = '';

// ---- Config ----
function loadConfig() {
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}
function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}
function isConfigured() {
  return fs.existsSync(SA_DEST) && fs.existsSync(CONFIG_PATH);
}

// ---- Agent lifecycle ----
function startAgent() {
  if (agentProc || !isConfigured()) {
    if (!isConfigured()) openSettings();
    return;
  }
  const cfg = loadConfig();
  postedSession = 0;
  agentProc = fork(agentEntry, [], {
    cwd: agentDir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1', // run the Electron binary as plain Node
      SERVICE_ACCOUNT_PATH: SA_DEST,
      ADSPOWER_API: cfg.adspowerApi,
      DRY_RUN: cfg.dryRun ? '1' : '0',
      POLL_INTERVAL_MS: '5000',
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  const onData = (buf) => {
    const text = buf.toString();
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      lastLine = line;
      if (/ POSTED /.test(line)) postedSession += 1;
    }
    updateTray();
  };
  agentProc.stdout?.on('data', onData);
  agentProc.stderr?.on('data', onData);
  agentProc.on('exit', () => {
    agentProc = null;
    updateTray();
  });
  updateTray();
}
function stopAgent() {
  if (agentProc) {
    agentProc.kill('SIGTERM');
    agentProc = null;
  }
  updateTray();
}
const isRunning = () => agentProc !== null;

// ---- Settings window ----
function openSettings() {
  if (settingsWin) {
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 460,
    height: 420,
    resizable: false,
    title: 'Motherlink Poster — Settings',
    webPreferences: { preload: path.join(__dirname, 'settings-preload.js') },
  });
  settingsWin.loadFile('settings.html');
  settingsWin.on('closed', () => {
    settingsWin = null;
  });
}

ipcMain.handle('get-config', () => ({
  ...loadConfig(),
  hasServiceAccount: fs.existsSync(SA_DEST),
}));

ipcMain.handle('pick-service-account', async () => {
  const res = await dialog.showOpenDialog(settingsWin, {
    title: 'Select your Firebase service-account.json',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (res.canceled || !res.filePaths[0]) return { ok: false };
  try {
    const raw = fs.readFileSync(res.filePaths[0], 'utf8');
    const j = JSON.parse(raw);
    if (!j.project_id || !j.private_key) return { ok: false, error: 'That does not look like a Firebase service-account key.' };
    fs.copyFileSync(res.filePaths[0], SA_DEST);
    return { ok: true, projectId: j.project_id };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
});

ipcMain.handle('save-config', (_e, cfg) => {
  saveConfig({ ...loadConfig(), ...cfg });
  updateTray();
  return { ok: true };
});

// ---- Tray ----
function updateTray() {
  if (!tray) return;
  const running = isRunning();
  tray.setTitle(running ? '🟢 Poster' : '🔴 Poster');

  const menu = Menu.buildFromTemplate([
    { label: running ? 'Status: running' : isConfigured() ? 'Status: stopped' : 'Status: needs setup', enabled: false },
    { label: `Posted this session: ${postedSession}`, enabled: false },
    ...(lastLine ? [{ label: lastLine.slice(0, 60), enabled: false }] : []),
    { type: 'separator' },
    running
      ? { label: 'Stop', click: stopAgent }
      : { label: 'Start', click: startAgent },
    { label: 'Restart', enabled: running, click: () => { stopAgent(); setTimeout(startAgent, 800); } },
    { type: 'separator' },
    { label: 'Open the tool', click: () => shell.openExternal(loadConfig().toolUrl) },
    { label: 'Settings…', click: openSettings },
    { type: 'separator' },
    { label: 'Reminder: keep AdsPower open', enabled: false },
    { label: 'Quit Motherlink Poster', click: () => { stopAgent(); app.quit(); } },
  ]);
  tray.setContextMenu(menu);
}

// ---- App lifecycle ----
app.whenReady().then(() => {
  // Menu-bar-only app (no dock icon).
  if (app.dock) app.dock.hide();

  tray = new Tray(nativeImage.createEmpty());
  tray.setToolTip('Motherlink Poster');
  updateTray();

  // Auto-start at login, hidden.
  app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true });

  if (!isConfigured()) {
    openSettings();
  } else {
    startAgent();
  }
});

app.on('window-all-closed', (e) => {
  // Stay alive in the menu bar even with no windows open.
  e.preventDefault?.();
});

app.on('before-quit', () => stopAgent());
