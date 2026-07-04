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
run(process.execPath, ['build.js']);

fs.rmSync(BUILD_ROOT, { recursive: true, force: true });
fs.mkdirSync(BUILD_ROOT, { recursive: true });
fs.mkdirSync(GO_BUILD_CACHE, { recursive: true });
fs.cpSync(path.join(ROOT, 'dist'), COURSE_DIST, { recursive: true });

run(process.execPath, ['generate-practice.js', 'infra-go', '--force'], {
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
    console.log(`\nBundling Go toolchain from ${goRoot}`);
    fs.cpSync(goRoot, TOOLCHAIN_DIR, {
        recursive: true,
        filter(source) {
            const rel = path.relative(goRoot, source);
            // These trees are not needed to compile or test course exercises.
            return !/^(doc|test)([\\/]|$)/.test(rel);
        },
    });
}

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
fs.writeFileSync(path.join(BUILD_ROOT, 'metadata.json'), JSON.stringify({
    appVersion: pkg.version,
    profile: 'course',
    preparedAt: new Date().toISOString(),
    goVersion: output(GO_BINARY, ['version']),
}, null, 2) + '\n');

console.log(`\nDesktop resources ready: ${path.relative(ROOT, BUILD_ROOT)}`);
