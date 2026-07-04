#!/usr/bin/env node
// vibe.js — local exercise runner + result relay for vibe-learn courses.
//
//   node vibe.js next             what the browser queued up for you
//   node vibe.js check [dir]      go vet + go test -race on one exercise
//   node vibe.js watch [--port N] serve results to the course pages
//
// The browser is the scheduler, the terminal is the workbench:
//   1. `vibe watch` runs a tiny daemon on 127.0.0.1 (default port 4711).
//   2. The course page announces the current exercise (POST /queue) and
//      polls for results (GET /results). CORS is pinned to local origins
//      plus anything listed in .vibe/config.json `origins`.
//   3. `vibe check` runs the real Go toolchain and appends a result record
//      to .vibe/results.jsonl, which the page picks up within a poll tick.
//
// No dependencies; state lives in .vibe/ (gitignored).

'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const PRACTICE_DIR = path.join(ROOT, 'practice');
const STATE_DIR = path.join(ROOT, '.vibe');
const RESULTS_FILE = path.join(STATE_DIR, 'results.jsonl');
const QUEUE_FILE = path.join(STATE_DIR, 'queue.json');
const CONFIG_FILE = path.join(STATE_DIR, 'config.json');
const DIST_DIR = path.join(ROOT, 'dist');
const DEFAULT_PORT = 4711;
const VERSION = '1.0.0';

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
};

const C = {
    green: s => `\x1b[32m${s}\x1b[0m`,
    red: s => `\x1b[31m${s}\x1b[0m`,
    dim: s => `\x1b[2m${s}\x1b[0m`,
    bold: s => `\x1b[1m${s}\x1b[0m`,
};

function loadConfig() {
    try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
    catch { return {}; }
}

function ensureStateDir() {
    fs.mkdirSync(STATE_DIR, { recursive: true });
}

function loadResults() {
    try {
        return fs.readFileSync(RESULTS_FILE, 'utf8')
            .split('\n')
            .filter(Boolean)
            .map(line => { try { return JSON.parse(line); } catch { return null; } })
            .filter(Boolean);
    } catch {
        return [];
    }
}

// practice/module6/challenge_1_v2 -> { module: 6, exerciseId: 'challenge_1',
// variantId: 'v2', key: 'm6_challenge_1', variantKey: 'm6_challenge_1_v2' }
function parseExerciseDir(dir) {
    const rel = path.relative(PRACTICE_DIR, path.resolve(dir));
    const m = rel.match(/^module(\d+)[\/\\]([^\/\\]+)$/);
    if (!m) return null;
    const modNum = parseInt(m[1], 10);
    const dirName = m[2];
    const vm = dirName.match(/^(.+)_(v\w+)$/);
    const exerciseId = vm ? vm[1] : dirName;
    const variantId = vm ? vm[2] : null;
    return {
        module: modNum,
        exerciseId,
        variantId,
        key: `m${modNum}_${exerciseId}`,
        variantKey: `m${modNum}_${exerciseId}${variantId ? '_' + variantId : ''}`,
        dir: path.join('practice', rel),
        pkg: './' + rel.replace(/\\/g, '/'),
    };
}

// Scan practice/ for exercise workspaces that have a test file.
function listWorkspaces() {
    const out = [];
    let moduleDirs = [];
    try { moduleDirs = fs.readdirSync(PRACTICE_DIR); } catch { return out; }
    for (const mod of moduleDirs) {
        if (!/^module\d+$/.test(mod)) continue;
        const modPath = path.join(PRACTICE_DIR, mod);
        for (const ex of fs.readdirSync(modPath)) {
            const exPath = path.join(modPath, ex);
            if (!fs.existsSync(path.join(exPath, 'exercise_test.go'))) continue;
            const info = parseExerciseDir(exPath);
            if (info) out.push(info);
        }
    }
    return out;
}

// --- vibe check ---

function runCheck(argDir) {
    const target = argDir ? path.resolve(argDir) : process.cwd();
    const info = parseExerciseDir(target);
    if (!info) {
        console.error('Not inside a practice exercise. Run from practice/module<N>/<exercise>/,');
        console.error('or pass the path: vibe check practice/module6/challenge_1_v2');
        process.exit(2);
    }

    console.log(C.dim(`→ go vet ${info.pkg} && go test -race ${info.pkg}`));

    const vet = spawnSync('go', ['vet', info.pkg], { cwd: PRACTICE_DIR, encoding: 'utf8' });
    const vetOk = vet.status === 0;
    const vetOutput = ((vet.stderr || '') + (vet.stdout || '')).trim();

    const started = Date.now();
    const test = spawnSync('go', ['test', '-race', '-count=1', '-json', info.pkg],
        { cwd: PRACTICE_DIR, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    const elapsedMs = Date.now() - started;

    // Parse `go test -json` event stream into per-test outcomes
    const tests = {}; // name -> { pass, output: [] }
    let buildFailed = false;
    let rawOutput = [];
    for (const line of (test.stdout || '').split('\n')) {
        if (!line.trim()) continue;
        let ev;
        try { ev = JSON.parse(line); } catch { continue; }
        if (ev.Test) {
            if (!tests[ev.Test]) tests[ev.Test] = { pass: null, output: [] };
            if (ev.Action === 'pass') tests[ev.Test].pass = true;
            if (ev.Action === 'fail') tests[ev.Test].pass = false;
            if (ev.Action === 'output') tests[ev.Test].output.push(ev.Output);
        } else if (ev.Action === 'output') {
            rawOutput.push(ev.Output);
        }
    }
    if (test.stderr && /(build failed|# )/.test(test.stderr)) buildFailed = true;

    const testList = Object.entries(tests)
        .filter(([name]) => !name.includes('/')) // keep top-level tests; subtests roll up
        .map(([name, t]) => ({
            name,
            pass: t.pass === true,
            // Only keep output for failures, trimmed — this travels to the browser
            output: t.pass === false ? t.output.join('').trim().slice(0, 2000) : undefined,
        }));

    const pass = !buildFailed && test.status === 0 && vetOk;

    const prior = loadResults().filter(r => r.variantKey === info.variantKey).length;
    const record = {
        key: info.key,
        variantKey: info.variantKey,
        module: info.module,
        dir: info.dir,
        pass,
        vetOk,
        vetOutput: vetOk ? undefined : vetOutput.slice(0, 2000),
        buildFailed: buildFailed || undefined,
        buildOutput: buildFailed ? (test.stderr || rawOutput.join('')).trim().slice(0, 2000) : undefined,
        tests: testList,
        elapsedMs,
        attempt: prior + 1,
        at: Date.now(),
    };

    ensureStateDir();
    fs.appendFileSync(RESULTS_FILE, JSON.stringify(record) + '\n');

    // Human summary
    console.log('');
    if (buildFailed) {
        console.log(C.red('✗ build failed'));
        console.log(C.dim((test.stderr || rawOutput.join('')).trim()));
    } else {
        for (const t of testList) {
            console.log(t.pass ? C.green(`✓ ${t.name}`) : C.red(`✗ ${t.name}`));
            if (!t.pass && t.output) console.log(C.dim('  ' + t.output.split('\n').join('\n  ')));
        }
    }
    if (!vetOk) console.log(C.dim(`  go vet: ${vetOutput}`));
    console.log('');
    console.log(pass
        ? C.green(C.bold(`PASS`)) + C.dim(` · ${info.variantKey} · ${elapsedMs}ms · attempt ${record.attempt}`)
        : C.red(C.bold(`FAIL`)) + C.dim(` · ${info.variantKey} · attempt ${record.attempt}`));
    console.log(C.dim('result recorded — the course page picks it up if `vibe watch` is running'));
    process.exit(pass ? 0 : 1);
}

// --- vibe next ---

function runNext() {
    let queued = null;
    try { queued = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8')); } catch {}

    const workspaces = listWorkspaces();
    if (workspaces.length === 0) {
        console.error('No practice workspaces found. Generate them first:  npm run practice');
        process.exit(2);
    }

    let target = null;
    if (queued && queued.variantKey) {
        target = workspaces.find(w => w.variantKey === queued.variantKey) ||
                 workspaces.find(w => w.key === queued.key) || null;
        if (!target) {
            console.error(`Browser queued ${queued.variantKey}, but no matching workspace exists.`);
            console.error('Regenerate workspaces:  npm run practice');
            process.exit(2);
        }
    } else {
        // No browser queue: pick the first workspace without a passing result
        const passed = new Set(loadResults().filter(r => r.pass).map(r => r.variantKey));
        target = workspaces.find(w => !passed.has(w.variantKey)) || workspaces[0];
    }

    const absDir = path.join(ROOT, target.dir);
    const readme = path.join(absDir, 'README.md');
    console.log(C.bold(`→ ${target.variantKey}`) + (queued && queued.title ? C.dim(` · ${queued.title}`) : ''));
    console.log(C.dim(`  scaffolded at ${target.dir}/`));
    if (fs.existsSync(readme)) {
        const head = fs.readFileSync(readme, 'utf8').split('\n').slice(0, 6).join('\n');
        console.log('');
        console.log(head.trim());
    }
    console.log('');
    console.log(`  cd ${target.dir} && \${EDITOR:-hx} exercise.go`);
    console.log(`  node ${path.relative(process.cwd(), path.join(ROOT, 'vibe.js')) || 'vibe.js'} check ${target.dir}`);
}

// --- vibe watch ---

// The hosted site is a first-class origin: browsers let HTTPS pages fetch
// 127.0.0.1 (trustworthy-origin exemption), so vibe-learn.ai polls this
// daemon directly — no backend involved.
const HOSTED_ORIGINS = ['https://vibe-learn.ai', 'https://www.vibe-learn.ai'];

function isOriginAllowed(origin, extraOrigins) {
    if (!origin) return true; // same-origin / curl
    if (origin === 'null') return true; // file:// pages
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
    if (HOSTED_ORIGINS.includes(origin)) return true;
    return extraOrigins.includes(origin);
}

function runWatch(args) {
    const config = loadConfig();
    let port = config.port || DEFAULT_PORT;
    const extraOrigins = Array.isArray(config.origins) ? config.origins.slice() : [];

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--port' && args[i + 1]) port = parseInt(args[++i], 10);
        if (args[i] === '--origin' && args[i + 1]) extraOrigins.push(args[++i]);
    }

    ensureStateDir();

    const server = http.createServer((req, res) => {
        const origin = req.headers.origin;
        if (!isOriginAllowed(origin, extraOrigins)) {
            res.writeHead(403).end();
            return;
        }
        const cors = {
            'Access-Control-Allow-Origin': origin || '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Vary': 'Origin',
        };
        if (req.method === 'OPTIONS') {
            // Chrome Private Network Access: a public HTTPS page fetching
            // 127.0.0.1 preflights with this header and needs the ack.
            if (req.headers['access-control-request-private-network']) {
                cors['Access-Control-Allow-Private-Network'] = 'true';
            }
            res.writeHead(204, cors).end();
            return;
        }
        const url = new URL(req.url, `http://127.0.0.1:${port}`);
        const json = (code, body) => {
            res.writeHead(code, { ...cors, 'Content-Type': 'application/json' });
            res.end(JSON.stringify(body));
        };

        if (req.method === 'GET' && url.pathname === '/health') {
            json(200, { ok: true, version: VERSION, workspaces: listWorkspaces().length });
        } else if (req.method === 'GET' && url.pathname === '/exercises') {
            json(200, { exercises: listWorkspaces().map(w => w.variantKey) });
        } else if (req.method === 'GET' && url.pathname === '/results') {
            const since = parseInt(url.searchParams.get('since') || '0', 10);
            const results = loadResults().filter(r => r.at > since);
            json(200, { now: Date.now(), results });
        } else if (req.method === 'GET' && url.pathname === '/queue') {
            let queued = null;
            try { queued = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8')); } catch {}
            json(200, { queued });
        } else if (req.method === 'POST' && url.pathname === '/queue') {
            let body = '';
            req.on('data', c => { body += c; if (body.length > 64 * 1024) req.destroy(); });
            req.on('end', () => {
                try {
                    const q = JSON.parse(body);
                    const queued = {
                        key: String(q.key || ''),
                        variantKey: String(q.variantKey || q.key || ''),
                        title: String(q.title || '').slice(0, 200),
                        requestedAt: Date.now(),
                    };
                    fs.writeFileSync(QUEUE_FILE, JSON.stringify(queued, null, 2));
                    json(200, { ok: true });
                } catch {
                    json(400, { ok: false });
                }
            });
        } else if (req.method === 'GET') {
            // Serve the built course site so `vibe watch` is the only
            // background process needed: same origin, no CORS, one URL.
            let rel;
            try { rel = decodeURIComponent(url.pathname); } catch { rel = url.pathname; }
            let file = path.normalize(path.join(DIST_DIR, rel));
            if (!file.startsWith(DIST_DIR)) { json(403, { ok: false }); return; }
            try {
                if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
            } catch {}
            fs.readFile(file, (err, data) => {
                if (err) { json(404, { ok: false, hint: 'run `npm run build` first' }); return; }
                res.writeHead(200, { ...cors, 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
                res.end(data);
            });
        } else {
            json(404, { ok: false });
        }
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`Port ${port} is already in use — another \`vibe watch\` is probably running.`);
            console.error(`Stop it (Ctrl+C in its terminal) and rerun, or use --port <other>.`);
            process.exit(1);
        }
        throw err;
    });

    server.listen(port, '127.0.0.1', () => {
        console.log(C.bold(`vibe watch`) + C.dim(` · serving dist/ + results on one port`));
        let courses = [];
        try {
            courses = fs.readdirSync(DIST_DIR).filter(f =>
                fs.existsSync(path.join(DIST_DIR, f, 'index.html')));
        } catch {}
        if (courses.length) {
            courses.forEach(c => console.log(`  → http://127.0.0.1:${port}/${c}/`));
        } else {
            console.log(C.dim(`  no built courses found — run \`npm run build\` first`));
        }
        const watching = startFileWatcher();
        console.log(watching
            ? C.dim('  watching practice/ — saving a .go file runs its tests automatically')
            : C.dim('  practice/ not found — run `npm run practice`, then restart to enable auto-check'));
        console.log(C.dim('  results reach the open course page within a few seconds'));
    });
}

// Rustlings-style auto-check: watch practice/ and run `vibe check` on the
// exercise whose files you save. Runs checks serially in a child process so
// the HTTP server stays responsive; results reach the browser the same way
// manual checks do.
function startFileWatcher() {
    if (!fs.existsSync(PRACTICE_DIR)) return false;
    const { spawn } = require('child_process');
    const timers = new Map();  // exercise dir -> debounce timer
    const queue = [];
    let child = null;

    const runNext = () => {
        if (child || queue.length === 0) return;
        const dir = queue.shift();
        console.log(C.dim(`\n— ${path.relative(ROOT, dir)} saved — checking…`));
        child = spawn(process.execPath, [__filename, 'check', dir], { stdio: 'inherit' });
        child.on('exit', () => { child = null; runNext(); });
    };

    try {
        fs.watch(PRACTICE_DIR, { recursive: true }, (event, filename) => {
            if (!filename || !filename.endsWith('.go')) return;
            const parts = filename.split(path.sep);
            if (parts.length < 3 || !/^module\d+$/.test(parts[0])) return;
            const dir = path.join(PRACTICE_DIR, parts[0], parts[1]);
            clearTimeout(timers.get(dir));
            timers.set(dir, setTimeout(() => {
                timers.delete(dir);
                if (!queue.includes(dir)) queue.push(dir);
                runNext();
            }, 400));
        });
        return true;
    } catch (e) {
        return false;
    }
}

// --- main ---

const [, , cmd, ...rest] = process.argv;
switch (cmd) {
    case 'check': runCheck(rest[0]); break;
    case 'next': runNext(); break;
    case 'watch': runWatch(rest); break;
    default:
        console.log('vibe — local exercise runner for vibe-learn');
        console.log('');
        console.log('  vibe next             show the exercise the course page queued');
        console.log('  vibe check [dir]      run go vet + go test -race, record the result');
        console.log('  vibe watch            relay results to the course page (127.0.0.1)');
        process.exit(cmd ? 2 : 0);
}
