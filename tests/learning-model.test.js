'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function browserContext() {
    const values = new Map();
    const localStorage = {
        getItem(key) { return values.has(key) ? values.get(key) : null; },
        setItem(key, value) { values.set(key, String(value)); },
        removeItem(key) { values.delete(key); },
        key(index) { return Array.from(values.keys())[index] || null; },
        get length() { return values.size; }
    };
    const window = {
        CourseConfigHelper: { storageKey(s) { return 'test-' + s; }, slug: 'test-course' },
        CourseConfig: {},
        addEventListener() {},
        dispatchEvent() {}
    };
    const context = vm.createContext({
        window,
        localStorage,
        console,
        Date,
        Math,
        JSON,
        Object,
        Array,
        String,
        Number,
        Blob: function() {},
        URL: { createObjectURL() {}, revokeObjectURL() {} },
        document: { body: { appendChild() {} }, createElement() { return { click() {}, remove() {} }; } }
    });
    return { context, window, localStorage };
}

function load(ctx, file) {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    vm.runInContext(source, ctx, { filename: file });
}

(function testBoundedComposer() {
    const b = browserContext();
    load(b.context, 'engine/js/session-composer.js');
    const compose = b.window.SessionComposer.allocate;

    const fresh = compose({ budget: 15, hasLearn: true, hasBuild: true, hasDecision: true, dueCount: 0, trackedCount: 0 });
    assert.strictEqual(fresh.reviewCount, 0, 'new learners should not receive invented review items');
    assert.ok(fresh.estimatedMinutes <= 15, 'fresh session must fit the budget');

    const dense = compose({ budget: 15, hasLearn: true, hasBuild: true, hasDecision: true, dueCount: 125, trackedCount: 125 });
    assert.strictEqual(dense.reviewCount, 2, 'a dense bank should still produce a bounded review slice');
    assert.ok(dense.estimatedMinutes <= 15, 'dense session must fit the same budget');

    const reviewOnly = compose({ budget: 15, dueCount: 100, trackedCount: 100 });
    assert.strictEqual(reviewOnly.reviewCount, 12, 'a review-only session may use the full budget');
})();

(function testEvidenceBands() {
    const b = browserContext();
    load(b.context, 'engine/js/srs.js');
    const srs = b.window.SRS;

    srs.recordReview('m1_warmup_1', 1, 'Slices', { source: 'objective', pass: false, variantKey: 'm1_warmup_1_v1' });
    srs.recordReview('m1_warmup_1', 1, 'Slices', { source: 'objective', pass: false, variantKey: 'm1_warmup_1_v1' });
    assert.strictEqual(srs.getItemMasteryBand('m1_warmup_1').id, 'needs-practice');

    srs.recordReview('m1_warmup_1', 5, 'Slices', { source: 'objective', pass: true, variantKey: 'm1_warmup_1_v1' });
    assert.strictEqual(srs.getItemMasteryBand('m1_warmup_1').id, 'ready');

    srs.recordReview('m1_warmup_1', 5, 'Slices', { source: 'objective', pass: true, variantKey: 'm1_warmup_1_v2' });
    assert.strictEqual(srs.getItemMasteryBand('m1_warmup_1').id, 'strong');

    srs.recordReview('m2_warmup_1', 5, 'Structs');
    srs.recordReview('m2_warmup_1', 5, 'Structs');
    srs.recordReview('m2_warmup_1', 5, 'Structs');
    assert.strictEqual(srs.getItemMasteryBand('m2_warmup_1').id, 'learning', 'self review alone must not certify mastery');
})();

(function testOutcomeMetrics() {
    const b = browserContext();
    load(b.context, 'engine/js/learning-metrics.js');
    const metrics = b.window.LearningMetrics;
    const now = Date.now();

    metrics.startAttempt({ key: 'm1_warmup_1', variantKey: 'm1_warmup_1_v1' });
    metrics.recordObjective({ key: 'm1_warmup_1', variantKey: 'm1_warmup_1_v1', module: 1, pass: true, at: now, elapsedMs: 5 }, {});
    const summary = metrics.summary();
    assert.strictEqual(summary.coldPass.total, 1);
    assert.strictEqual(summary.coldPass.hits, 1);

    metrics.recordDecision({ id: 'd1', family: 'errors', moduleId: 3, answer: 'is' }, 'as', false);
    assert.strictEqual(metrics.summary().decisionAccuracy.rate, 0);
})();

console.log('learning-model tests passed');
