/**
 * Spaced Repetition Engine for Go Course
 *
 * Simplified SM-2 algorithm for scheduling exercise reviews.
 * Tracks ease factor, interval, and repetition count per exercise.
 *
 * localStorage key: 'go-course-srs'
 * Schema: { "m2_warmup_1": { easeFactor, interval, repetitions, nextReview, lastQuality, reviewCount } }
 *
 * Quality scale (0-5):
 *   5 = self-rated "got it", no hints
 *   4 = self-rated "got it", used hints
 *   3 = self-rated "struggled" (SM-2 minimum correct)
 *   1 = self-rated "needed solution" (reset)
 *   0 = not engaged
 *
 * @typedef {Object} SRSEntry
 * @property {number} easeFactor - SM-2 ease factor (minimum 1.3, default 2.5)
 * @property {number} interval - Days until next review
 * @property {number} repetitions - Consecutive correct responses
 * @property {string} nextReview - ISO 8601 date of next scheduled review
 * @property {number} lastQuality - Most recent quality score (0-5)
 * @property {number} reviewCount - Total number of reviews recorded
 * @property {string} [label] - Human-readable exercise label for display
 */
(function() {
    'use strict';

    var SRS_KEY = window.CourseConfigHelper ? window.CourseConfigHelper.storageKey('srs') : 'go-course-srs';

    function loadSRS() {
        try {
            return JSON.parse(localStorage.getItem(SRS_KEY) || '{}');
        } catch {
            return {};
        }
    }

    function saveSRS(data) {
        try {
            localStorage.setItem(SRS_KEY, JSON.stringify(data));
        } catch (e) {
            console.warn('Failed to save SRS data:', e);
        }
    }

    // SM-2 algorithm: compute next review parameters
    function calculateNext(item, quality) {
        let { easeFactor, interval, repetitions } = item;

        if (quality >= 3) {
            // Correct response
            if (repetitions === 0) {
                interval = 1;
            } else if (repetitions === 1) {
                interval = 6;
            } else {
                interval = Math.round(interval * easeFactor);
            }
            repetitions++;
        } else {
            // Incorrect — reset
            repetitions = 0;
            interval = 1;
        }

        // Update ease factor (never below 1.3)
        easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
        if (easeFactor < 1.3) easeFactor = 1.3;

        const nextReview = new Date();
        nextReview.setDate(nextReview.getDate() + interval);

        return {
            easeFactor: Math.round(easeFactor * 100) / 100,
            interval,
            repetitions,
            nextReview: nextReview.toISOString(),
            lastQuality: quality
        };
    }

    /**
     * Derive quality score from exercise progress interaction data.
     * The UI flow is: attempt -> open solution to check -> self-rate.
     * Self-rating is the primary signal; solutionViewed is the normal
     * "check your answer" step, not a penalty. Hints provide nuance.
     * @param {ExerciseProgressEntry} progressData
     * @returns {number} Quality score (0-5)
     */
    function deriveQuality(progressData) {
        if (!progressData) return 0;

        const { hintsUsed, solutionViewed, selfRating } = progressData;

        // Primary path: self-rating provided (normal flow — solution is always viewed)
        if (selfRating) {
            if (selfRating === 1) return hintsUsed ? 4 : 5;  // got it
            if (selfRating === 2) return 3;                    // struggled (SM-2 minimum correct)
            if (selfRating === 3) return 1;                    // needed solution (reset)
        }

        // Fallback: no self-rating yet (edge case / future UI changes)
        if (!solutionViewed && !hintsUsed) return 4;
        if (!solutionViewed && hintsUsed) return 3;
        return 2;
    }

    /**
     * Record a review result for an exercise.
     * @param {string} exerciseKey - Exercise identifier (e.g. "m2_warmup_1")
     * @param {number} quality - Quality score (0-5)
     * @param {string} [label] - Human-readable label for display
     * @returns {SRSEntry} Updated SRS entry
     */
    function recordReview(exerciseKey, quality, label) {
        const srsData = loadSRS();
        const current = srsData[exerciseKey] || {
            easeFactor: 2.5,
            interval: 0,
            repetitions: 0,
            nextReview: new Date().toISOString(),
            lastQuality: 0
        };

        srsData[exerciseKey] = calculateNext(current, quality);
        srsData[exerciseKey].reviewCount = (current.reviewCount || 0) + 1;
        if (label) {
            srsData[exerciseKey].label = label;
        } else if (current.label) {
            srsData[exerciseKey].label = current.label;
        }
        saveSRS(srsData);
        return srsData[exerciseKey];
    }

    /**
     * Get exercises that are due for review (past their nextReview date).
     * @returns {Array<SRSEntry & {key: string}>} Due exercises, most overdue first
     */
    function getDueExercises() {
        const srsData = loadSRS();
        const now = new Date();
        const due = [];

        for (const [key, item] of Object.entries(srsData)) {
            if (new Date(item.nextReview) <= now) {
                due.push({ key, ...item });
            }
        }

        // Sort: most overdue first, then by ease factor (hardest first)
        due.sort((a, b) => {
            const overdueDiff = new Date(a.nextReview) - new Date(b.nextReview);
            if (overdueDiff !== 0) return overdueDiff;
            return a.easeFactor - b.easeFactor;
        });

        return due;
    }

    /**
     * Get the exercises the user struggles with most (lowest ease factor).
     * Only returns items reviewed at least twice with ease below the "Good" threshold (2.5).
     * @param {number} [count=10] - Maximum number of results
     * @returns {Array<SRSEntry & {key: string}>} Weakest exercises, lowest ease first
     */
    function getWeakestExercises(count) {
        count = count || 10;
        const srsData = loadSRS();
        const items = Object.entries(srsData)
            .map(([key, item]) => ({ key, ...item }))
            .filter(item => item.repetitions >= 2 && item.easeFactor < 2.5);

        items.sort((a, b) => a.easeFactor - b.easeFactor);

        return items.slice(0, count);
    }

    /**
     * Get count of due exercises (for dashboard badges).
     * @returns {number}
     */
    function getDueCount() {
        return getDueExercises().length;
    }

    /**
     * Get all SRS data (for analytics/debugging).
     * @returns {Object<string, SRSEntry>}
     */
    function getAll() {
        return loadSRS();
    }

    // Public API
    window.SRS = {
        recordReview,
        deriveQuality,
        getDueExercises,
        getWeakestExercises,
        getDueCount,
        getAll
    };
})();
