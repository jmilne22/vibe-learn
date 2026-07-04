/**
 * vibe-learn desktop — packaged, profile-isolated Electron shell.
 *
 * Read-only assets live in the application resources directory. Writable
 * runner state and learner workspaces live in OS-managed per-user folders.
 * Development intentionally uses a different profile, port, browser storage,
 * and workspace from the packaged course app.
 */
const { app, BrowserWindow, ipcMain, session, shell } = require('electron');
const { spawn } = require('child_process');
const crypto = require('crypto');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { ensureDir, syncWorkspaceSeed } = require('./workspace');

const SOURCE_ROOT = path.join(__dirname, '..');
const PACKAGED = app.isPackaged;
const PROFILE = process.env.VIBE_PROFILE || (PACKAGED ? 'course' : 'dev');
const PROFILE_NAME = PROFILE === 'course' ? 'Vibe Learn' : 'Vibe Learn Dev';

// Set Chromium storage before ready so development can never read or mutate
// the packaged course profile's localStorage, cookies, cache, or progress.
const USER_DATA_DIR = path.resolve(process.env.VIBE_USER_DATA_DIR ||
    path.join(app.getPath('appData'), PROFILE_NAME));
ensureDir(USER_DATA_DIR);
app.setPath('userData', USER_DATA_DIR);
const SESSION_DATA_DIR = ensureDir(path.join(USER_DATA_DIR, 'browser'));
app.setPath('sessionData', SESSION_DATA_DIR);
app.setAppLogsPath(path.join(USER_DATA_DIR, 'logs'));

const RESOURCE_ROOT = PACKAGED
    ? path.join(process.resourcesPath, 'desktop-resources')
    : path.join(SOURCE_ROOT, 'build', 'desktop-resources');
const ASSETS_DIR = path.resolve(process.env.VIBE_ASSETS_DIR ||
    (PACKAGED ? path.join(RESOURCE_ROOT, 'course-dist') : path.join(SOURCE_ROOT, 'dist')));
const SEED_DIR = path.resolve(process.env.VIBE_SEED_DIR || path.join(RESOURCE_ROOT, 'practice-seed'));
const RUNNER_SCRIPT = path.resolve(process.env.VIBE_RUNNER_SCRIPT ||
    (PACKAGED ? path.join(RESOURCE_ROOT, 'runtime', 'vibe.js') : path.join(SOURCE_ROOT, 'vibe.js')));
const TOOLCHAIN_DIR = path.resolve(process.env.VIBE_TOOLCHAIN_DIR || path.join(RESOURCE_ROOT, 'go'));
const BUNDLED_GO = path.join(TOOLCHAIN_DIR, 'bin', process.platform === 'win32' ? 'go.exe' : 'go');
const GO_BINARY = process.env.VIBE_GO_BINARY || (fs.existsSync(BUNDLED_GO) ? BUNDLED_GO : 'go');

const WORKSPACE_DIR = path.resolve(process.env.VIBE_WORKSPACE_DIR ||
    path.join(app.getPath('documents'), PROFILE_NAME, 'workspaces', 'infra-go'));
const RUNNER_STATE_DIR = ensureDir(path.join(USER_DATA_DIR, 'runner'));
const PORT = readPort();
const BASE = `http://127.0.0.1:${PORT}`;
const INSTANCE_ID = crypto.createHash('sha256')
    .update(`${PROFILE}\0${WORKSPACE_DIR}`)
    .digest('hex')
    .slice(0, 20);

let daemon = null;

function readPort() {
    if (process.env.VIBE_PORT) return parseInt(process.env.VIBE_PORT, 10);
    try {
        const config = JSON.parse(fs.readFileSync(path.join(RUNNER_STATE_DIR, 'config.json'), 'utf8'));
        if (config.port) return config.port;
    } catch {}
    return PROFILE === 'course' ? 4711 : 4712;
}

function validateRuntime() {
    const required = [
        [path.join(ASSETS_DIR, 'index.html'), 'built course assets'],
        [SEED_DIR, 'practice seed'],
        [RUNNER_SCRIPT, 'runner script'],
    ];
    if (PACKAGED) required.push([BUNDLED_GO, 'bundled Go toolchain']);
    for (const [target, label] of required) {
        if (!fs.existsSync(target)) throw new Error(`${label} missing: ${target}`);
    }
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

async function daemonHealth() {
    try { return await getJson(`${BASE}/health`); }
    catch { return null; }
}

function healthMatches(health) {
    return !!health && health.ok && health.watching === true && health.profile === PROFILE &&
        health.instanceId === INSTANCE_ID &&
        path.resolve(health.workspaceDir || '') === WORKSPACE_DIR;
}

async function ensureDaemon() {
    const existing = await daemonHealth();
    if (healthMatches(existing)) return;
    if (existing) {
        throw new Error(`port ${PORT} belongs to a different vibe profile or workspace`);
    }

    const runnerEnv = {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        VIBE_PROFILE: PROFILE,
        VIBE_INSTANCE_ID: INSTANCE_ID,
        VIBE_ASSETS_DIR: ASSETS_DIR,
        VIBE_WORKSPACE_DIR: WORKSPACE_DIR,
        VIBE_STATE_DIR: RUNNER_STATE_DIR,
        VIBE_GO_BINARY: GO_BINARY,
        // `go test -race` requires an external C toolchain on several
        // platforms. Packaged builds stay self-contained; source/dev mode
        // keeps the stronger race-enabled checks.
        VIBE_GO_RACE: PACKAGED ? '0' : (process.env.VIBE_GO_RACE || '1'),
        VIBE_PORT: String(PORT),
        GOCACHE: ensureDir(path.join(RUNNER_STATE_DIR, 'go-cache')),
        GOMODCACHE: ensureDir(path.join(RUNNER_STATE_DIR, 'go-mod-cache')),
        GOFLAGS: '-mod=vendor',
        GOTOOLCHAIN: 'local',
    };
    if (fs.existsSync(BUNDLED_GO)) runnerEnv.GOROOT = TOOLCHAIN_DIR;

    daemon = spawn(process.execPath, [RUNNER_SCRIPT, 'watch', '--port', String(PORT)], {
        cwd: WORKSPACE_DIR,
        stdio: PACKAGED ? 'ignore' : 'inherit',
        env: runnerEnv,
    });
    daemon.on('exit', () => { daemon = null; });

    for (let i = 0; i < 40; i++) {
        const health = await daemonHealth();
        if (healthMatches(health)) return;
        await new Promise(r => setTimeout(r, 250));
    }
    throw new Error(`vibe runner did not start for profile ${PROFILE} on ${BASE}`);
}

function stateFile() {
    return path.join(USER_DATA_DIR, 'state.json');
}

function loadState() {
    try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch { return {}; }
}

function saveState(state) {
    try { fs.writeFileSync(stateFile(), JSON.stringify(state, null, 2) + '\n'); } catch {}
}

async function startUrl() {
    let courses = [];
    try { courses = (await getJson(`${BASE}/api/courses`)).courses || []; } catch {}
    const state = loadState();
    if (state.lastCourse && courses.some(c => c.slug === state.lastCourse)) {
        return `${BASE}/${state.lastCourse}/index.html`;
    }
    if (courses.length > 0) return `${BASE}/${courses[0].slug}/index.html`;
    return null;
}

function isTrustedAppUrl(raw) {
    try { return new URL(raw).origin === BASE; } catch { return false; }
}

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
            sandbox: true,
            additionalArguments: [
                `--vibe-profile=${PROFILE}`,
                `--vibe-port=${PORT}`,
                `--vibe-workspace=${encodeURIComponent(WORKSPACE_DIR)}`,
            ],
        },
    });

    win.webContents.on('will-navigate', (event, target) => {
        if (!isTrustedAppUrl(target)) event.preventDefault();
    });
    win.webContents.setWindowOpenHandler(({ url: target }) => {
        try {
            const parsed = new URL(target);
            if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
                setImmediate(() => shell.openExternal(parsed.toString()));
            }
        } catch {}
        return { action: 'deny' };
    });

    if (url) {
        win.loadURL(url);
    } else {
        win.loadURL('data:text/html,' + encodeURIComponent(
            '<body style="margin:0;display:grid;place-items:center;height:100vh;' +
            'background:#101413;color:#a8b5b0;font:15px system-ui">' +
            '<div style="text-align:center"><p style="color:#eef5f2;font-weight:700">No built courses found</p>' +
            '<p>The packaged course assets are missing.</p></div></body>'));
    }

    win.webContents.on('did-navigate', (event, navUrl) => {
        if (!isTrustedAppUrl(navUrl)) return;
        const slug = new URL(navUrl).pathname.split('/').filter(Boolean)[0];
        if (slug) saveState({ ...loadState(), lastCourse: slug });
    });
    win.on('close', () => {
        if (win.isMaximized()) return;
        const [width, height] = win.getSize();
        saveState({ ...loadState(), width, height });
    });

    return win;
}

function trustedIpc(event) {
    return !!event.senderFrame && isTrustedAppUrl(event.senderFrame.url);
}

ipcMain.on('win:minimize', (event) => {
    if (trustedIpc(event)) BrowserWindow.fromWebContents(event.sender)?.minimize();
});
ipcMain.on('win:toggle-maximize', (event) => {
    if (!trustedIpc(event)) return;
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
});
ipcMain.on('win:close', (event) => {
    if (trustedIpc(event)) BrowserWindow.fromWebContents(event.sender)?.close();
});
ipcMain.handle('workspace:path', (event) => trustedIpc(event) ? WORKSPACE_DIR : null);
ipcMain.handle('workspace:open', async (event, relativeDir) => {
    if (!trustedIpc(event)) return 'not allowed';
    const rel = String(relativeDir || '').replace(/\\/g, '/').replace(/^practice\/?/, '');
    const target = path.resolve(WORKSPACE_DIR, rel);
    if (target !== WORKSPACE_DIR && !target.startsWith(WORKSPACE_DIR + path.sep)) return 'not allowed';
    return shell.openPath(target);
});

app.whenReady().then(async () => {
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    validateRuntime();
    syncWorkspaceSeed(SEED_DIR, WORKSPACE_DIR);
    await ensureDaemon();
    createWindow(await startUrl());

    app.on('activate', async () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow(await startUrl());
    });
}).catch((error) => {
    console.error(error);
    app.quit();
});

app.on('window-all-closed', () => app.quit());
app.on('quit', () => {
    if (daemon) { try { daemon.kill(); } catch {} }
});
