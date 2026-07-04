/**
 * vibe-learn desktop — frameless Electron shell around the vibe daemon.
 *
 * The daemon (`vibe.js watch`) is the app server: it serves dist/ and the
 * test-run results on one port. This process:
 *
 *   1. reuses a running daemon, or spawns one (and owns its lifetime)
 *   2. opens a frameless window straight into the last-opened course's
 *      Today view — the site's own titlebar is the window chrome
 *   3. answers the titlebar's minimize / maximize / close IPC
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = readPort();
const BASE = `http://127.0.0.1:${PORT}`;

let daemon = null; // child process, only if we spawned it

function readPort() {
    try {
        const config = JSON.parse(fs.readFileSync(path.join(ROOT, '.vibe', 'config.json'), 'utf8'));
        if (config.port) return config.port;
    } catch {}
    return 4711;
}

function getJson(url, timeoutMs) {
    return new Promise((resolve, reject) => {
        const req = http.get(url, { timeout: timeoutMs || 1500 }, (res) => {
            let body = '';
            res.on('data', c => { body += c; });
            res.on('end', () => {
                try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
            });
        });
        req.on('timeout', () => req.destroy(new Error('timeout')));
        req.on('error', reject);
    });
}

async function daemonUp() {
    try {
        const health = await getJson(`${BASE}/health`);
        return !!health.ok;
    } catch { return false; }
}

async function ensureDaemon() {
    if (await daemonUp()) return;
    daemon = spawn(process.execPath, [path.join(ROOT, 'vibe.js'), 'watch'], {
        cwd: ROOT,
        stdio: 'ignore',
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    });
    daemon.on('exit', () => { daemon = null; });
    for (let i = 0; i < 40; i++) {
        if (await daemonUp()) return;
        await new Promise(r => setTimeout(r, 250));
    }
    throw new Error('vibe daemon did not come up on ' + BASE);
}

// --- last-opened course ---

function stateFile() {
    return path.join(app.getPath('userData'), 'state.json');
}

function loadState() {
    try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch { return {}; }
}

function saveState(state) {
    try { fs.writeFileSync(stateFile(), JSON.stringify(state)); } catch {}
}

async function startUrl() {
    let courses = [];
    try { courses = (await getJson(`${BASE}/api/courses`)).courses || []; } catch {}
    const state = loadState();
    if (state.lastCourse && courses.some(c => c.slug === state.lastCourse)) {
        return `${BASE}/${state.lastCourse}/index.html`;
    }
    if (courses.length > 0) return `${BASE}/${courses[0].slug}/index.html`;
    return null; // nothing built
}

// --- window ---

function createWindow(url) {
    const state = loadState();
    const win = new BrowserWindow({
        width: state.width || 1280,
        height: state.height || 860,
        minWidth: 760,
        minHeight: 560,
        frame: false,
        backgroundColor: '#101413',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    if (url) {
        win.loadURL(url);
    } else {
        win.loadURL('data:text/html,' + encodeURIComponent(
            '<body style="margin:0;display:grid;place-items:center;height:100vh;' +
            'background:#101413;color:#a8b5b0;font:15px system-ui">' +
            '<div style="text-align:center"><p style="color:#eef5f2;font-weight:700">No built courses found</p>' +
            '<p>Run <code style="color:#2dd4bf">npm run build</code> in the vibe-learn repo, then reopen.</p></div></body>'));
    }

    // Remember the course being viewed (first path segment) and window size
    win.webContents.on('did-navigate', (e, navUrl) => {
        try {
            const u = new URL(navUrl);
            const slug = u.pathname.split('/').filter(Boolean)[0];
            if (slug) saveState({ ...loadState(), lastCourse: slug });
        } catch {}
    });
    win.on('close', () => {
        const [width, height] = win.getSize();
        saveState({ ...loadState(), width, height });
    });

    return win;
}

ipcMain.on('win:minimize', (e) => BrowserWindow.fromWebContents(e.sender)?.minimize());
ipcMain.on('win:toggle-maximize', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
});
ipcMain.on('win:close', (e) => BrowserWindow.fromWebContents(e.sender)?.close());

app.whenReady().then(async () => {
    await ensureDaemon();
    createWindow(await startUrl());

    app.on('activate', async () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow(await startUrl());
    });
});

app.on('window-all-closed', () => {
    // One window is the app, on every platform — quitting also stops a
    // daemon we spawned (an externally started `vibe watch` is left alone).
    app.quit();
});

app.on('quit', () => {
    if (daemon) { try { daemon.kill(); } catch {} }
});
