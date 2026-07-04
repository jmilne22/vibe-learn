'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { syncWorkspaceSeed } = require('./workspace');

function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-workspace-'));
    const seed = path.join(root, 'seed');
    const workspace = path.join(root, 'workspace');
    fs.mkdirSync(path.join(seed, 'module1', 'warmup_1_v1'), { recursive: true });
    fs.writeFileSync(path.join(seed, 'module1', 'warmup_1_v1', 'exercise.go'), 'seed v1\n');
    fs.writeFileSync(path.join(seed, 'module1', 'warmup_1_v1', 'exercise_test.go'), 'test v1\n');
    return { root, seed, workspace };
}

test('seeds a new workspace', t => {
    const f = fixture();
    t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
    syncWorkspaceSeed(f.seed, f.workspace);
    assert.equal(fs.readFileSync(path.join(f.workspace, 'module1/warmup_1_v1/exercise.go'), 'utf8'), 'seed v1\n');
});

test('updates untouched seed files but preserves learner edits', t => {
    const f = fixture();
    t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
    syncWorkspaceSeed(f.seed, f.workspace);

    const exercise = path.join(f.workspace, 'module1/warmup_1_v1/exercise.go');
    const testFile = path.join(f.workspace, 'module1/warmup_1_v1/exercise_test.go');
    fs.writeFileSync(exercise, 'my solution\n');
    fs.writeFileSync(path.join(f.seed, 'module1/warmup_1_v1/exercise.go'), 'seed v2\n');
    fs.writeFileSync(path.join(f.seed, 'module1/warmup_1_v1/exercise_test.go'), 'test v2\n');

    syncWorkspaceSeed(f.seed, f.workspace);
    assert.equal(fs.readFileSync(exercise, 'utf8'), 'my solution\n');
    assert.equal(fs.readFileSync(testFile, 'utf8'), 'test v2\n');
});

test('preserves any generated file the learner changed', t => {
    const f = fixture();
    t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
    syncWorkspaceSeed(f.seed, f.workspace);

    const testFile = path.join(f.workspace, 'module1/warmup_1_v1/exercise_test.go');
    fs.writeFileSync(testFile, 'my custom test\n');
    fs.writeFileSync(path.join(f.seed, 'module1/warmup_1_v1/exercise_test.go'), 'test v2\n');

    syncWorkspaceSeed(f.seed, f.workspace);
    assert.equal(fs.readFileSync(testFile, 'utf8'), 'my custom test\n');
});
