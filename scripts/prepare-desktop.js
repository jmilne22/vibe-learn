#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BUILD_ROOT = path.join(ROOT, 'build', 'desktop-resources');
const COURSE_DIST = path.join(BUILD_ROOT, 'course-dist');
const PRACTICE_SEED = path.join(BUILD_ROOT, 'practice-seed');
const RUNTIME_DIR = path.join(BUILD_ROOT, 'runtime');
const TOOLCHAIN_DIR = path.join(BUILD_ROOT, 'go');
const GO_BUILD_CACHE = path.join(ROOT, 'build', '.go-cache');
const SKIP_GO = process.argv.includes('--skip-go');
const GO_BINARY = process.env.VIBE_GO_BINARY || 'go';
// One course per packaged app: the same slug drives dist pruning, practice
// seed generation, and (via metadata.json) the learner workspace directory.
const SHIPPED_COURSE = (process.env.VIBE_DESKTOP_COURSE || 'infra-go').trim();

function run(command, args, options = {}) {
    console.log(`\n$ ${command} ${args.join(' ')}`);
    const result = spawnSync(command, args, {
        cwd: ROOT,
        stdio: 'inherit',
        env: process.env,
        ...options,
    });
    if (result.status !== 0) {
        if (result.error) throw result.error;
        process.exit(result.status || 1);
    }
}

function output(command, args, options = {}) {
    const result = spawnSync(command, args, {
        cwd: ROOT,
        encoding: 'utf8',
        env: process.env,
        ...options,
    });
    if (result.status !== 0) {
        if (result.error) throw result.error;
        process.stderr.write(result.stderr || '');
        process.exit(result.status || 1);
    }
    return result.stdout.trim();
}

console.log(`Preparing desktop resources${SKIP_GO ? ' (system Go for development)' : ''}...`);
// Share the persistent Go build cache with build.js's <variations> runner so
// its go run calls start warm on CI (the workflow restores build/.go-cache).
fs.mkdirSync(GO_BUILD_CACHE, { recursive: true });
run(process.execPath, ['build.js'], {
    env: { ...process.env, GOCACHE: GO_BUILD_CACHE },
});

fs.rmSync(BUILD_ROOT, { recursive: true, force: true });
fs.mkdirSync(BUILD_ROOT, { recursive: true });
fs.cpSync(path.join(ROOT, 'dist'), COURSE_DIST, { recursive: true });

// The root index.html is the web download page, and courses other than the
// shipped one must not reach the packaged course switcher. Shared assets
// (style.css, theme.js, guide/settings pages, themes/) stay: course pages
// link to them.
fs.rmSync(path.join(COURSE_DIST, 'index.html'), { force: true });
for (const entry of fs.readdirSync(COURSE_DIST, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const isCourse = fs.existsSync(path.join(COURSE_DIST, entry.name, 'course-data.js'));
    if (isCourse && entry.name !== SHIPPED_COURSE) {
        fs.rmSync(path.join(COURSE_DIST, entry.name), { recursive: true, force: true });
    }
}
if (!fs.existsSync(path.join(COURSE_DIST, SHIPPED_COURSE, 'index.html'))) {
    console.error(`Shipped course "${SHIPPED_COURSE}" is missing from dist/. Check courses/ or VIBE_DESKTOP_COURSE.`);
    process.exit(1);
}

run(process.execPath, ['generate-practice.js', SHIPPED_COURSE, '--force'], {
    env: {
        ...process.env,
        VIBE_PRACTICE_DIR: PRACTICE_SEED,
        VIBE_MANIFEST_FILE: path.join(BUILD_ROOT, 'practice-manifest.json'),
        VIBE_GO_BINARY: GO_BINARY,
        GOCACHE: GO_BUILD_CACHE,
    },
});

// Vendor every module dependency into the seed. The packaged runner sets
// GOFLAGS=-mod=vendor and GOTOOLCHAIN=local, so exercises work offline and
// never alter the learner's global Go environment.
run(GO_BINARY, ['mod', 'vendor'], {
    cwd: PRACTICE_SEED,
    env: { ...process.env, GOCACHE: GO_BUILD_CACHE },
});

fs.mkdirSync(RUNTIME_DIR, { recursive: true });
fs.copyFileSync(path.join(ROOT, 'vibe.js'), path.join(RUNTIME_DIR, 'vibe.js'));

if (!SKIP_GO) {
    const goRoot = output(GO_BINARY, ['env', 'GOROOT']);
    const goHostOS = output(GO_BINARY, ['env', 'GOHOSTOS']);
    const goHostArch = output(GO_BINARY, ['env', 'GOHOSTARCH']);
    console.log(`\nBundling Go toolchain from ${goRoot}`);
    fs.cpSync(goRoot, TOOLCHAIN_DIR, {
        recursive: true,
        filter(source) {
            const rel = path.relative(goRoot, source);
            if (!rel) return true;
            const parts = rel.split(/[\\/]/);
            // Not needed to compile or test course exercises. testdata and
            // foreign-arch .syso fixtures also break rpmbuild's brp-strip,
            // which refuses non-native object files.
            if (/^(api|doc|misc|test)$/.test(parts[0])) return false;
            if (parts.includes('testdata')) return false;
            if (parts[0] === 'bin' && parts[parts.length - 1].startsWith('gofmt')) return false;
            if (rel.endsWith('.syso') && !rel.includes(`${goHostOS}_${goHostArch}`)) return false;
            return true;
        },
    });
}

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
fs.writeFileSync(path.join(BUILD_ROOT, 'metadata.json'), JSON.stringify({
    appVersion: pkg.version,
    course: SHIPPED_COURSE,
    profile: 'course',
    preparedAt: new Date().toISOString(),
    goVersion: output(GO_BINARY, ['version']),
}, null, 2) + '\n');

console.log(`\nDesktop resources ready: ${path.relative(ROOT, BUILD_ROOT)}`);
