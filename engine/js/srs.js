/**
 * Spaced Repetition Engine for Go Course
 *
 * FSRS-4.5 scheduler (stability / difficulty / retrievability) for exercise
 * reviews. Entries written by the previous SM-2 scheduler are migrated
 * lazily: stability is seeded from the SM-2 interval and difficulty from
 * the ease factor, so no history is lost.
 *
 * localStorage key: 'go-course-srs'
 * Schema: { "m2_warmup_1": { stability, difficulty, lastReview, nextReview,
 *           easeFactor, interval, repetitions, lastQuality, reviewCount } }
 * (easeFactor/interval/repetitions are still maintained for backwards
 * compatibility with older consumers and exported backups.)
 *
 * Quality scale (0-5), mapped to FSRS grades:
 *   5 = "got it", no hints          -> Easy
 *   4 = "got it", used hints        -> Good
 *   3 = "struggled"                 -> Hard
 *   1 = "needed solution"           -> Again
 *   0 = not engaged                 -> Again
 *
 * @typedef {Object} SRSEntry
 * @property {number} stability - FSRS stability (days until recall drops to 90%)
 * @property {number} difficulty - FSRS difficulty (1-10)
 * @property {string} lastReview - ISO 8601 date of the most recent review
 * @property {string} nextReview - ISO 8601 date of next scheduled review
 * @property {number} easeFactor - Legacy SM-2 ease factor (kept in sync)
 * @property {number} interval - Days until next review
 * @property {number} repetitions - Consecutive correct responses
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

    // --- FSRS-4.5 core ---
    //
    // Retrievability: R(t, S) = (1 + FACTOR * t / S) ^ DECAY
    // With DECAY = -0.5 and FACTOR = 19/81, R(S, S) = 0.9 — i.e. an item's
    // stability is exactly the interval at which predicted recall is 90%.

    var DECAY = -0.5;
    var FACTOR = 19 / 81;
    var REQUEST_RETENTION = 0.9;
    var MAX_INTERVAL = 365;
    var DAY_MS = 24 * 60 * 60 * 1000;

    // FSRS-4.5 default weights
    var W = [0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14,
             0.94, 2.18, 0.05, 0.34, 1.26, 0.29, 2.61];

    function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

    // Quality (0-5) -> FSRS grade: 1 Again, 2 Hard, 3 Good, 4 Easy
    function qualityToGrade(quality) {
        if (quality >= 5) return 4;
        if (quality >= 4) return 3;
        if (quality >= 3) return 2;
        return 1;
    }

    function retrievability(elapsedDays, stability) {
        if (!stability || stability <= 0) return 0;
        return Math.pow(1 + FACTOR * elapsedDays / stability, DECAY);
    }

    function intervalForRetention(stability, retention) {
        var days = stability / FACTOR * (Math.pow(retention, 1 / DECAY) - 1);
        return clamp(Math.round(days), 1, MAX_INTERVAL);
    }

    function initStability(grade) {
        return Math.max(W[grade - 1], 0.1);
    }

    function initDifficulty(grade) {
        return clamp(W[4] - (grade - 3) * W[5], 1, 10);
    }

    function nextDifficulty(d, grade) {
        var next = d - W[6] * (grade - 3);
        // Mean reversion toward the initial difficulty of a "Good" answer
        return clamp(W[7] * initDifficulty(3) + (1 - W[7]) * next, 1, 10);
    }

    function nextRecallStability(d, s, r, grade) {
        var hardPenalty = grade === 2 ? W[15] : 1;
        var easyBonus = grade === 4 ? W[16] : 1;
        return s * (1 + Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) *
            (Math.exp((1 - r) * W[10]) - 1) * hardPenalty * easyBonus);
    }

    function nextForgetStability(d, s, r) {
        var sf = W[11] * Math.pow(d, -W[12]) *
            (Math.pow(s + 1, W[13]) - 1) * Math.exp((1 - r) * W[14]);
        return Math.min(sf, s); // forgetting never increases stability
    }

    /**
     * Migrate an SM-2 era entry in place: seed stability from the interval
     * and difficulty from the ease factor. Idempotent.
     */
    function migrateEntry(item) {
        if (typeof item.stability === 'number' && typeof item.difficulty === 'number') return item;
        // SM-2 intervals also targeted ~90% recall, so interval ≈ stability
        item.stability = Math.max(item.interval || 0, 0.5);
        // ease 1.3 (hardest) -> ~9, ease 2.5+ (default) -> ~4.5
        var ease = item.easeFactor || 2.5;
        item.difficulty = clamp(4.5 + (2.5 - ease) * 3.75, 1, 10);
        if (!item.lastReview) {
            if (item.nextReview && item.interval) {
                item.lastReview = new Date(new Date(item.nextReview).getTime() - item.interval * DAY_MS).toISOString();
            } else {
                item.lastReview = new Date().toISOString();
            }
        }
        return item;
    }

    function elapsedDays(item, now) {
        if (!item.lastReview) return 0;
        return Math.max(0, ((now || Date.now()) - new Date(item.lastReview).getTime()) / DAY_MS);
    }

    /**
     * Current predicted recall probability for an entry (0..1).
     */
    function entryRetrievability(item, now) {
        migrateEntry(item);
        if (!item.reviewCount && !item.repetitions && !item.stability) return 0;
        return retrievability(elapsedDays(item, now), item.stability);
    }

    // FSRS scheduling: compute next review parameters
    function calculateNext(item, quality) {
        migrateEntry(item);
        var grade = qualityToGrade(quality);
        var now = new Date();
        var isNew = !(item.reviewCount > 0 || item.repetitions > 0 || item.interval > 0);

        var stability, difficulty;
        if (isNew) {
            stability = initStability(grade);
            difficulty = initDifficulty(grade);
        } else {
            var r = retrievability(elapsedDays(item, now.getTime()), item.stability);
            difficulty = nextDifficulty(item.difficulty, grade);
            stability = grade === 1
                ? nextForgetStability(item.difficulty, item.stability, r)
                : nextRecallStability(item.difficulty, item.stability, r, grade);
        }
        stability = Math.max(stability, 0.1);

        var interval = grade === 1 ? 1 : intervalForRetention(stability, REQUEST_RETENTION);
        var repetitions = grade === 1 ? 0 : (item.repetitions || 0) + 1;

        // Keep legacy ease factor in sync (used by older consumers/backups)
        var easeFactor = (item.easeFactor || 2.5) +
            (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
        if (easeFactor < 1.3) easeFactor = 1.3;

        var nextReview = new Date(now.getTime() + interval * DAY_MS);

        return {
            stability: Math.round(stability * 100) / 100,
            difficulty: Math.round(difficulty * 100) / 100,
            lastReview: now.toISOString(),
            easeFactor: Math.round(easeFactor * 100) / 100,
            interval: interval,
            repetitions: repetitions,
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
    function cloneEvidence(evidence) {
        if (!evidence) return {
            objectiveAttempts: 0,
            objectivePasses: 0,
            cleanPasses: 0,
            assistedPasses: 0,
            objectiveFailures: 0,
            consecutiveObjectiveFailures: 0,
            selfReviews: 0,
            variants: {}
        };
        try { return JSON.parse(JSON.stringify(evidence)); }
        catch (e) { return Object.assign({ variants: {} }, evidence); }
    }

    function updateEvidence(current, quality, opts) {
        opts = opts || {};
        var evidence = cloneEvidence(current.evidence);
        evidence.variants = evidence.variants || {};

        if (opts.source === 'objective') {
            var passed = opts.pass !== undefined ? !!opts.pass : quality >= 3;
            var variantKey = opts.variantKey || opts.key || 'unknown';
            var variant = evidence.variants[variantKey] || {
                attempts: 0,
                passes: 0,
                cleanPasses: 0,
                firstAt: opts.at || Date.now()
            };

            evidence.objectiveAttempts++;
            variant.attempts++;
            variant.lastAt = opts.at || Date.now();
            if (passed) {
                evidence.objectivePasses++;
                variant.passes++;
                evidence.consecutiveObjectiveFailures = 0;
                if (!opts.assist && !(opts.sessionFailures > 0)) {
                    evidence.cleanPasses++;
                    variant.cleanPasses++;
                } else {
                    evidence.assistedPasses++;
                }
            } else {
                evidence.objectiveFailures++;
                evidence.consecutiveObjectiveFailures++;
            }
            evidence.lastObjectiveResult = passed ? 'pass' : 'fail';
            evidence.lastObjectiveAt = new Date(opts.at || Date.now()).toISOString();
            evidence.variants[variantKey] = variant;
        } else {
            evidence.selfReviews++;
            evidence.lastSelfQuality = quality;
            evidence.lastSelfAt = new Date().toISOString();
        }
        return evidence;
    }

    /**
     * Record a review result. The optional evidence object is used for
     * objective local-runner results; older callers remain self-review data.
     * @param {string} exerciseKey
     * @param {number} quality
     * @param {string} [label]
     * @param {{source?: string, pass?: boolean, variantKey?: string, assist?: string, sessionFailures?: number, at?: number}} [opts]
     */
    function recordReview(exerciseKey, quality, label, opts) {
        const srsData = loadSRS();
        const current = srsData[exerciseKey] || {
            easeFactor: 2.5,
            interval: 0,
            repetitions: 0,
            nextReview: new Date().toISOString(),
            lastQuality: 0
        };

        var evidence = updateEvidence(current, quality, opts);
        srsData[exerciseKey] = calculateNext(current, quality);
        srsData[exerciseKey].evidence = evidence;
        srsData[exerciseKey].reviewCount = (current.reviewCount || 0) + 1;
        if (label) {
            srsData[exerciseKey].label = label;
        } else if (current.label) {
            srsData[exerciseKey].label = current.label;
        }

        // Clean up legacy variant-suffixed entries that map to this base key
        const basePattern = new RegExp('^' + exerciseKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '_(?:v|tp)\\w+$');
        for (const k of Object.keys(srsData)) {
            if (basePattern.test(k)) delete srsData[k];
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
            // Skip legacy variant-suffixed entries — reviews now use stripped keys
            if (/_(?:v|tp)\w+$/.test(key)) continue;
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
            .filter(([key]) => !/_(?:v|tp)\w+$/.test(key))
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

    // --- Concept Strength API ---

    var MIN_CONCEPT_REVIEWS = 3;

    function extractModuleNum(key) {
        if (key.indexOf('algo_') === 0) return 'algo';
        var match = key.match(/^(?:fc_)?m(\d+)_/);
        return match ? parseInt(match[1], 10) : null;
    }

    function stripVariantSuffix(key) {
        return key.replace(/_(?:v|tp)\d+$/, '');
    }

    function strengthLabel(avgEase, count, minReviews) {
        if (count < (minReviews || MIN_CONCEPT_REVIEWS)) return 'Too early';
        if (avgEase >= 2.5) return 'Strong';
        if (avgEase >= 2.3) return 'Good';
        if (avgEase >= 1.8) return 'Moderate';
        return 'Weak';
    }

    function strengthColor(label) {
        switch (label) {
            case 'Strong':    return 'var(--green-bright)';
            case 'Good':      return 'var(--cyan)';
            case 'Moderate':  return 'var(--orange)';
            case 'Weak':      return 'var(--red)';
            case 'Too early': return 'var(--text-secondary)';
            default:          return 'var(--text-secondary)';
        }
    }

    /**
     * Compute per-concept strength using recency-weighted ease factors.
     * @param {Object} [opts] - Options
     * @param {number|string} [opts.moduleNum] - Filter to a specific module
     * @returns {Array<{concept: string, moduleNum: number|string, avgEase: number, count: number, label: string, color: string}>}
     */
    function getConceptStrengths(opts) {
        var srsData = loadSRS();
        var conceptIndex = window.ConceptIndex || {};
        var moduleFilter = opts && opts.moduleNum !== undefined ? opts.moduleNum : null;
        var now = Date.now();

        var conceptMap = {}; // "moduleNum|concept" -> { weightedEase, totalWeight, count }
        var srsKeys = Object.keys(srsData);

        for (var i = 0; i < srsKeys.length; i++) {
            var key = srsKeys[i];
            if (key.indexOf('fc_') === 0) continue; // skip flashcards
            var entry = srsData[key];
            var modNum = extractModuleNum(key);
            if (modNum === null) continue;
            if (moduleFilter !== null && String(modNum) !== String(moduleFilter)) continue;

            var baseKey = stripVariantSuffix(key);
            var conceptName = conceptIndex[baseKey];
            if (!conceptName) continue;

            // Recency weight: 1 / (1 + daysSinceLastReview / 30)
            var weight = 1;
            if (entry.nextReview && entry.interval) {
                var lastReview = new Date(entry.nextReview);
                lastReview.setDate(lastReview.getDate() - entry.interval);
                var daysSince = Math.max(0, (now - lastReview) / (1000 * 60 * 60 * 24));
                weight = 1 / (1 + daysSince / 30);
            }

            var groupKey = modNum + '|' + conceptName;
            if (!conceptMap[groupKey]) {
                conceptMap[groupKey] = { moduleNum: modNum, concept: conceptName, weightedEase: 0, totalWeight: 0, count: 0 };
            }
            conceptMap[groupKey].weightedEase += entry.easeFactor * weight;
            conceptMap[groupKey].totalWeight += weight;
            conceptMap[groupKey].count += (entry.reviewCount || Math.max(entry.repetitions, 1));
        }

        var concepts = [];
        var groupKeys = Object.keys(conceptMap);
        for (var g = 0; g < groupKeys.length; g++) {
            var data = conceptMap[groupKeys[g]];
            var avgEase = data.totalWeight > 0 ? data.weightedEase / data.totalWeight : data.weightedEase / data.count;
            var label = strengthLabel(avgEase, data.count, MIN_CONCEPT_REVIEWS);
            concepts.push({
                moduleNum: data.moduleNum,
                concept: data.concept,
                avgEase: Math.round(avgEase * 10) / 10,
                count: data.count,
                label: label,
                color: strengthColor(label)
            });
        }

        // Sort: "Too early" at bottom, then weakest-first
        concepts.sort(function(a, b) {
            var aEarly = a.label === 'Too early' ? 1 : 0;
            var bEarly = b.label === 'Too early' ? 1 : 0;
            if (aEarly !== bEarly) return aEarly - bEarly;
            return a.avgEase - b.avgEase;
        });

        return concepts;
    }

    // --- Predicted Recall API (FSRS) ---

    function isTrackableKey(key) {
        return !/_(?:v|tp)\w+$/.test(key);
    }

    // Evidence bands intentionally avoid exposing the scheduler's internal
    // probability as if it were a direct measurement of programming skill.
    var MASTERY_BANDS = {
        insufficient: { id: 'insufficient', label: 'Insufficient evidence', shortLabel: 'Early', color: 'var(--text-secondary)', rank: 0 },
        learning: { id: 'learning', label: 'Learning', shortLabel: 'Learning', color: 'var(--purple)', rank: 1 },
        needsPractice: { id: 'needs-practice', label: 'Needs practice', shortLabel: 'Practice', color: 'var(--red)', rank: 1 },
        refresh: { id: 'refresh', label: 'Refresh soon', shortLabel: 'Refresh', color: 'var(--orange)', rank: 2 },
        ready: { id: 'ready', label: 'Ready', shortLabel: 'Ready', color: 'var(--cyan)', rank: 3 },
        strong: { id: 'strong', label: 'Strong', shortLabel: 'Strong', color: 'var(--green-bright)', rank: 4 }
    };

    function bandCopy(id, extra) {
        return Object.assign({}, MASTERY_BANDS[id] || MASTERY_BANDS.insufficient, extra || {});
    }

    /**
     * Mastery band for one scheduled item. Objective results determine Ready
     * and Strong; self-ratings can identify learning needs but do not certify
     * strong performance.
     */
    function getItemMasteryBand(keyOrEntry) {
        var item = typeof keyOrEntry === 'string' ? loadSRS()[keyOrEntry] : keyOrEntry;
        if (!item) return bandCopy('insufficient', { objectiveCount: 0 });
        var ev = item.evidence || {};
        var objectiveCount = ev.objectiveAttempts || 0;
        var recall = entryRetrievability(item);

        if (objectiveCount > 0) {
            if ((ev.consecutiveObjectiveFailures || 0) >= 2 ||
                ((ev.objectivePasses || 0) === 0 && objectiveCount >= 2)) {
                return bandCopy('needsPractice', { objectiveCount: objectiveCount, recall: recall });
            }
            if ((ev.objectivePasses || 0) === 0) {
                return bandCopy('learning', { objectiveCount: objectiveCount, recall: recall });
            }
            if (recall < 0.7) {
                return bandCopy('refresh', { objectiveCount: objectiveCount, recall: recall });
            }
            var passedVariants = Object.keys(ev.variants || {}).filter(function(v) {
                return (ev.variants[v].passes || 0) > 0;
            }).length;
            if (passedVariants >= 2 && (ev.cleanPasses || 0) >= 1 && objectiveCount >= 2) {
                return bandCopy('strong', { objectiveCount: objectiveCount, recall: recall, passedVariants: passedVariants });
            }
            return bandCopy('ready', { objectiveCount: objectiveCount, recall: recall, passedVariants: passedVariants });
        }

        if ((ev.lastSelfQuality || item.lastQuality || 0) < 3 && (ev.selfReviews || item.reviewCount || 0) > 0) {
            return bandCopy('needsPractice', { objectiveCount: 0, selfOnly: true, recall: recall });
        }
        if ((ev.selfReviews || item.reviewCount || 0) > 0) {
            return bandCopy('learning', { objectiveCount: 0, selfOnly: true, recall: recall });
        }
        return bandCopy('insufficient', { objectiveCount: 0, recall: recall });
    }

    function aggregateBands(entries) {
        if (!entries.length) return bandCopy('insufficient', { count: 0, objectiveCount: 0, objectiveItems: 0, bands: {} });
        var counts = {};
        var objectiveCount = 0;
        var objectiveItems = 0;
        entries.forEach(function(entry) {
            var band = getItemMasteryBand(entry);
            counts[band.id] = (counts[band.id] || 0) + 1;
            objectiveCount += band.objectiveCount || 0;
            if ((band.objectiveCount || 0) > 0) objectiveItems++;
        });
        var id = 'learning';
        if (objectiveCount === 0) id = 'learning';
        else if ((counts['needs-practice'] || 0) >= Math.max(1, Math.ceil(entries.length * 0.25))) id = 'needsPractice';
        else if ((counts.refresh || 0) > 0) id = 'refresh';
        else if ((counts.strong || 0) >= Math.ceil(entries.length * 0.5)) id = 'strong';
        else id = 'ready';
        return bandCopy(id, { count: entries.length, objectiveCount: objectiveCount, objectiveItems: objectiveItems, bands: counts });
    }

    function getModuleMastery() {
        var srsData = loadSRS();
        var groups = {};
        Object.keys(srsData).forEach(function(key) {
            if (!isTrackableKey(key) || key.indexOf('fc_') === 0) return;
            var moduleNum = extractModuleNum(key);
            if (moduleNum === null) return;
            if (!groups[moduleNum]) groups[moduleNum] = [];
            groups[moduleNum].push(srsData[key]);
        });
        var out = {};
        Object.keys(groups).forEach(function(moduleNum) {
            out[moduleNum] = aggregateBands(groups[moduleNum]);
        });
        return out;
    }

    /**
     * Predicted recall probability for one exercise right now (0..1).
     * @param {string} key
     * @returns {number|null} null if the exercise is untracked
     */
    function getRetrievability(key) {
        var srsData = loadSRS();
        var item = srsData[key];
        if (!item) return null;
        return entryRetrievability(item);
    }

    /**
     * Aggregate memory state: average predicted recall across tracked items.
     * @returns {{count: number, avgRecall: number|null}}
     */
    function getMemorySummary() {
        var srsData = loadSRS();
        var now = Date.now();
        var sum = 0, count = 0, entries = [];
        for (var key in srsData) {
            if (!isTrackableKey(key)) continue;
            sum += entryRetrievability(srsData[key], now);
            count++;
            if (key.indexOf('fc_') !== 0) entries.push(srsData[key]);
        }
        return { count: count, avgRecall: count > 0 ? sum / count : null, band: aggregateBands(entries) };
    }

    /**
     * Average predicted recall per module.
     * @returns {Object<string, {recall: number, count: number}>}
     */
    function getModuleRecall() {
        var srsData = loadSRS();
        var now = Date.now();
        var byModule = {};
        for (var key in srsData) {
            if (!isTrackableKey(key)) continue;
            if (key.indexOf('fc_') === 0) continue;
            var modNum = extractModuleNum(key);
            if (modNum === null) continue;
            var r = entryRetrievability(srsData[key], now);
            if (!byModule[modNum]) byModule[modNum] = { sum: 0, count: 0 };
            byModule[modNum].sum += r;
            byModule[modNum].count++;
        }
        var out = {};
        for (var m in byModule) {
            out[m] = { recall: byModule[m].sum / byModule[m].count, count: byModule[m].count };
        }
        return out;
    }

    var GATE_THRESHOLD = 0.7;
    var GATE_MIN_ITEMS = 3;

    /**
     * Modules whose average predicted recall has fallen below the mastery
     * gate (default 70%, needs >= 3 tracked items to count).
     * @param {number} [threshold=0.7]
     * @returns {Array<{moduleNum: string, recall: number, count: number}>} ascending by recall
     */
    function getFadingModules(threshold) {
        threshold = threshold || GATE_THRESHOLD;
        var byModule = getModuleRecall();
        var out = [];
        for (var m in byModule) {
            if (byModule[m].count >= GATE_MIN_ITEMS && byModule[m].recall < threshold) {
                out.push({ moduleNum: m, recall: byModule[m].recall, count: byModule[m].count });
            }
        }
        out.sort(function(a, b) { return a.recall - b.recall; });
        return out;
    }

    /**
     * Modules worth refreshing. This is a recommendation queue, never a
     * progression lock. Requires objective evidence before surfacing a module.
     */
    function getRefreshModules() {
        var mastery = getModuleMastery();
        var recall = getModuleRecall();
        var out = [];
        Object.keys(mastery).forEach(function(moduleNum) {
            var band = mastery[moduleNum];
            if (band.objectiveCount < 2) return;
            if (band.id !== 'refresh' && band.id !== 'needs-practice') return;
            out.push({
                moduleNum: moduleNum,
                band: band,
                recall: recall[moduleNum] ? recall[moduleNum].recall : null,
                count: band.count
            });
        });
        out.sort(function(a, b) {
            if (a.band.id === 'needs-practice' && b.band.id !== 'needs-practice') return -1;
            if (b.band.id === 'needs-practice' && a.band.id !== 'needs-practice') return 1;
            return (a.recall || 0) - (b.recall || 0);
        });
        return out;
    }

    /**
     * A module's tracked exercises with the lowest predicted recall.
     * @param {number|string} moduleNum
     * @param {number} [count=4]
     * @returns {Array<SRSEntry & {key: string, recall: number}>}
     */
    function getLowestRecall(moduleNum, count) {
        count = count || 4;
        var srsData = loadSRS();
        var now = Date.now();
        var items = [];
        for (var key in srsData) {
            if (!isTrackableKey(key)) continue;
            if (key.indexOf('fc_') === 0) continue;
            if (String(extractModuleNum(key)) !== String(moduleNum)) continue;
            var item = srsData[key];
            items.push(Object.assign({ key: key, recall: entryRetrievability(item, now) }, item));
        }
        items.sort(function(a, b) { return a.recall - b.recall; });
        return items.slice(0, count);
    }

    /**
     * Concepts with the lowest average predicted recall, ascending.
     * @param {number} [limit=4]
     * @returns {Array<{concept: string, moduleNum: number|string, recall: number, count: number}>}
     */
    function getFadingConcepts(limit) {
        limit = limit || 4;
        var srsData = loadSRS();
        var conceptIndex = window.ConceptIndex || {};
        var now = Date.now();
        var map = {}; // "mod|concept" -> { sum, count }

        for (var key in srsData) {
            if (!isTrackableKey(key)) continue;
            if (key.indexOf('fc_') === 0) continue;
            var modNum = extractModuleNum(key);
            if (modNum === null) continue;
            var concept = conceptIndex[stripVariantSuffix(key)];
            if (!concept) continue;
            var groupKey = modNum + '|' + concept;
            if (!map[groupKey]) map[groupKey] = { moduleNum: modNum, concept: concept, sum: 0, count: 0 };
            map[groupKey].sum += entryRetrievability(srsData[key], now);
            map[groupKey].count++;
        }

        var list = [];
        for (var g in map) {
            list.push({
                concept: map[g].concept,
                moduleNum: map[g].moduleNum,
                recall: map[g].sum / map[g].count,
                count: map[g].count
            });
        }
        list.sort(function(a, b) { return a.recall - b.recall; });
        return list.slice(0, limit);
    }

    // Public API
    window.SRS = {
        recordReview,
        deriveQuality,
        getDueExercises,
        getWeakestExercises,
        getDueCount,
        getAll,
        getItemMasteryBand,
        getModuleMastery,
        getRefreshModules,
        masteryBands: MASTERY_BANDS,
        getConceptStrengths,
        strengthLabel,
        strengthColor,
        // FSRS predicted-recall API
        getRetrievability,
        getMemorySummary,
        getModuleRecall,
        getFadingConcepts,
        getFadingModules,
        getLowestRecall
    };
})();
