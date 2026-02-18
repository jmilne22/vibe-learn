/**
 * Analytics Dashboard
 *
 * Reads SRS and exercise-progress data from localStorage,
 * groups by module, computes strength rankings, and renders
 * a dashboard with health cards, module grid, action items,
 * and collapsible detail panels.
 *
 * @typedef {Object} AnalyticsReport
 * @property {number} totalTracked - Total items in SRS
 * @property {number} masteredCount - Items with 2+ reviews and ease >= 2.5
 * @property {number} weakCount - Items with 2+ reviews and ease < 1.8
 * @property {ModuleSummary[]} modules - Per-module strength summaries (weakest first)
 * @property {ConceptSummary[]} concepts - Per-concept strength summaries
 * @property {Array<{key: string, easeFactor: number, nextReview: string, label: string}>} weakest - Top 10 weakest exercises
 * @property {{gotIt: number, struggled: number, peeked: number}} ratings - Self-rating breakdown
 *
 * @typedef {Object} ModuleSummary
 * @property {number|string} num - Module number or "algo"
 * @property {string} name - Module display name
 * @property {number} avgEase - Recency-weighted average ease factor
 * @property {number} count - Number of tracked items in this module
 * @property {number} mastered - Items with ease >= 2.5
 * @property {string} label - Strength label: "Strong", "Good", "Moderate", "Weak", or "Too early"
 * @property {string} color - CSS color variable for the strength label
 *
 * @typedef {Object} ConceptSummary
 * @property {number|string} moduleNum - Module number or "algo"
 * @property {string} concept - Concept name
 * @property {number} avgEase - Recency-weighted average ease factor
 * @property {number} count - Total review count across exercises for this concept
 * @property {string} label - Strength label
 * @property {string} color - CSS color variable
 */
(function() {
    'use strict';

    var MODULE_NAMES = (window.CourseConfigHelper && window.CourseConfigHelper.moduleNames) || {};

    /** Return the correct page URL for a module, accounting for split modules */
    function modulePageUrl(modId) {
        if (modId === 'algo') return 'algorithms.html';
        var modules = (window.CourseConfigHelper && window.CourseConfigHelper.modules) || [];
        var mod = null;
        for (var i = 0; i < modules.length; i++) {
            if (modules[i].id === modId) { mod = modules[i]; break; }
        }
        if (mod && mod.isSplit) return mod.file + '-1.html';
        return 'module' + modId + '.html';
    }

    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------

    /** Extract module number from an exercise or flashcard key like "m2_warmup_1" or "fc_m1_0" */
    function extractModuleNum(key) {
        if (key.indexOf('algo_') === 0) return 'algo';
        var match = key.match(/^(?:fc_)?m(\d+)_/);
        return match ? parseInt(match[1], 10) : null;
    }

    /** Prettify an exercise/flashcard key for display */
    function prettifyKey(key, srsEntry) {
        // Use stored label if available
        if (srsEntry && srsEntry.label) return srsEntry.label;

        // Algorithm keys: algo_arrays-hashing_two-sum_v1 -> "Algo — Two Sum v1"
        var algoMatch = key.match(/^algo_([^_]+(?:-[^_]+)*)_([^_]+(?:-[^_]+)*)(?:_(v\d+))?$/);
        if (algoMatch) {
            var probId = algoMatch[2];
            var varId = algoMatch[3] || '';
            var probName = probId.replace(/-/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
            return 'Algo \u2014 ' + probName + (varId ? ' ' + varId : '');
        }

        // Exercise keys: m2_warmup_1 -> "Module 2 — Warmup 1"
        var exMatch = key.match(/^m(\d+)_(\w+?)_(\d+)$/);
        if (exMatch) {
            var modNum = exMatch[1];
            var type = exMatch[2].charAt(0).toUpperCase() + exMatch[2].slice(1);
            var num = exMatch[3];
            return 'Module ' + modNum + ' \u2014 ' + type + ' ' + num;
        }

        // Flashcard keys: fc_m1_0 -> "M1 Flashcard 1 (Go Fundamentals)"
        var fcMatch = key.match(/^fc_m(\d+)_(\d+)$/);
        if (fcMatch) {
            var fcMod = fcMatch[1];
            var fcIdx = parseInt(fcMatch[2], 10);
            var modName = MODULE_NAMES[parseInt(fcMod, 10)] || '';
            return 'M' + fcMod + ' Flashcard ' + (fcIdx + 1) + (modName ? ' (' + modName + ')' : '');
        }

        return key;
    }

    /** Return a human-readable relative-date string for a nextReview ISO date */
    function dueStatus(nextReview) {
        if (!nextReview) return '';
        var now = new Date();
        now.setHours(0, 0, 0, 0);
        var due = new Date(nextReview);
        due.setHours(0, 0, 0, 0);
        var diffMs = due.getTime() - now.getTime();
        var diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays === 0) return 'Due today';
        if (diffDays < 0) return 'Due ' + Math.abs(diffDays) + ' day' + (Math.abs(diffDays) === 1 ? '' : 's') + ' ago';
        return 'Due in ' + diffDays + ' day' + (diffDays === 1 ? '' : 's');
    }

    /** Map a strength label to a CSS color variable */
    function strengthColor(label) {
        switch (label) {
            case 'Strong':   return 'var(--green-bright)';
            case 'Good':     return 'var(--cyan)';
            case 'Moderate': return 'var(--orange)';
            case 'Weak':     return 'var(--red)';
            case 'Too early': return 'var(--text-secondary)';
            default:         return 'var(--text-secondary)';
        }
    }

    /** Text color for strength badges: dark text on bright backgrounds, light on dim */
    function badgeTextColor(label) {
        return label === 'Too early' ? 'var(--text-primary)' : '#111';
    }

    /** Minimum reviews per module before showing a strength label */
    var MIN_REVIEWS = 5;
    var MIN_CONCEPT_REVIEWS = 3;

    /** Determine strength label from average ease factor */
    function strengthLabel(avgEase, count, minReviews) {
        if (count < (minReviews || MIN_REVIEWS)) return 'Too early';
        if (avgEase >= 2.5) return 'Strong';
        if (avgEase >= 2.3) return 'Good';
        if (avgEase >= 1.8) return 'Moderate';
        return 'Weak';
    }

    /** Strip variant suffix from SRS key: m1_challenge_4_v9 -> m1_challenge_4 */
    function stripVariantSuffix(key) {
        return key.replace(/_v\d+$/, '');
    }

    // ---------------------------------------------------------------------------
    // Trend Snapshots
    // ---------------------------------------------------------------------------

    var SNAPSHOT_KEY = window.CourseConfigHelper ? window.CourseConfigHelper.storageKey('analytics-snapshots') : 'go-course-analytics-snapshots';
    var MAX_SNAPSHOT_DAYS = 30;

    function todayStr() {
        return new Date().toISOString().slice(0, 10);
    }

    function loadSnapshots() {
        try {
            return JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || '{}');
        } catch (e) {
            return {};
        }
    }

    function saveSnapshot(report) {
        var snapshots = loadSnapshots();
        snapshots[todayStr()] = {
            totalTracked: report.totalTracked,
            mastered: report.masteredCount,
            weak: report.weakCount
        };
        // Prune entries older than MAX_SNAPSHOT_DAYS
        var cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - MAX_SNAPSHOT_DAYS);
        var cutoffStr = cutoff.toISOString().slice(0, 10);
        var keys = Object.keys(snapshots);
        for (var i = 0; i < keys.length; i++) {
            if (keys[i] < cutoffStr) delete snapshots[keys[i]];
        }
        try {
            localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshots));
        } catch (e) { /* quota exceeded — ignore */ }
    }

    /** Find the snapshot closest to `daysAgo` days in the past (window: 5–10 days) */
    function findComparisonSnapshot() {
        var snapshots = loadSnapshots();
        var dates = Object.keys(snapshots).sort();
        var today = new Date();
        var bestDate = null;
        var bestDist = Infinity;
        for (var i = 0; i < dates.length; i++) {
            var d = new Date(dates[i] + 'T00:00:00');
            var daysAgo = Math.round((today - d) / (1000 * 60 * 60 * 24));
            if (daysAgo >= 5 && daysAgo <= 10) {
                var dist = Math.abs(daysAgo - 7);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestDate = dates[i];
                }
            }
        }
        return bestDate ? snapshots[bestDate] : null;
    }

    /** Return a trend arrow span comparing current to previous value (higher = better for mastered, lower = better for weak) */
    function trendArrow(current, previous, higherIsBetter) {
        if (previous === null || previous === undefined) return '';
        var diff = current - previous;
        if (diff === 0) return ' <span class="trend-arrow" title="No change from last week">\u2192</span>';
        var good = higherIsBetter ? diff > 0 : diff < 0;
        var arrow = diff > 0 ? '\u2191' : '\u2193';
        var color = good ? 'var(--green-bright)' : 'var(--red)';
        var label = (diff > 0 ? '+' : '') + diff + ' from last week';
        return ' <span class="trend-arrow" title="' + label + '" style="--stat-color: ' + color + ';">' + arrow + '</span>';
    }

    // ---------------------------------------------------------------------------
    // Data Building
    // ---------------------------------------------------------------------------

    function buildReport() {
        // 1. Load SRS data
        var srsData;
        if (window.SRS && typeof window.SRS.getAll === 'function') {
            srsData = window.SRS.getAll();
        } else {
            try {
                srsData = JSON.parse(localStorage.getItem(window.CourseConfigHelper ? window.CourseConfigHelper.storageKey('srs') : 'go-course-srs') || '{}');
            } catch (e) {
                srsData = {};
            }
        }

        // 2. Load exercise progress data
        var progressData;
        if (window.ExerciseProgress && typeof window.ExerciseProgress.loadAll === 'function') {
            progressData = window.ExerciseProgress.loadAll();
        } else {
            try {
                progressData = JSON.parse(localStorage.getItem(window.CourseConfigHelper ? window.CourseConfigHelper.storageKey('exercise-progress') : 'go-course-exercise-progress') || '{}');
            } catch (e) {
                progressData = {};
            }
        }

        var srsKeys = Object.keys(srsData);
        if (srsKeys.length === 0) {
            return null; // no data yet
        }

        // 3. Group SRS entries by module (recency-weighted averages)
        var now = new Date();
        var moduleMap = {}; // moduleNum -> { weightedEase, totalWeight, count, mastered, entries[] }

        for (var i = 0; i < srsKeys.length; i++) {
            var key = srsKeys[i];
            var entry = srsData[key];
            var modNum = extractModuleNum(key);
            if (modNum === null) continue;

            if (!moduleMap[modNum]) {
                moduleMap[modNum] = { weightedEase: 0, totalWeight: 0, count: 0, mastered: 0, entries: [] };
            }

            // Recency weight: 1 / (1 + daysSinceLastReview / 30)
            var weight = 1;
            if (entry.nextReview && entry.interval) {
                var lastReview = new Date(entry.nextReview);
                lastReview.setDate(lastReview.getDate() - entry.interval);
                var daysSince = Math.max(0, (now - lastReview) / (1000 * 60 * 60 * 24));
                weight = 1 / (1 + daysSince / 30);
            }

            moduleMap[modNum].weightedEase += entry.easeFactor * weight;
            moduleMap[modNum].totalWeight += weight;
            moduleMap[modNum].count++;
            if (entry.easeFactor >= 2.5) {
                moduleMap[modNum].mastered++;
            }
            moduleMap[modNum].entries.push({ key: key, easeFactor: entry.easeFactor, nextReview: entry.nextReview, label: entry.label });
        }

        // 4. Build module summaries
        var modules = [];
        var moduleNums = Object.keys(moduleMap);
        for (var j = 0; j < moduleNums.length; j++) {
            var num = moduleNums[j] === 'algo' ? 'algo' : parseInt(moduleNums[j], 10);
            var data = moduleMap[moduleNums[j]];
            var avgEase = data.totalWeight > 0 ? data.weightedEase / data.totalWeight : data.weightedEase / data.count;
            var label = strengthLabel(avgEase, data.count);
            modules.push({
                num: num,
                name: num === 'algo' ? 'Algorithms' : (MODULE_NAMES[num] || ('Module ' + num)),
                avgEase: Math.round(avgEase * 10) / 10,
                count: data.count,
                mastered: data.mastered,
                label: label,
                color: strengthColor(label)
            });
        }

        // Sort by average ease ascending (weakest first)
        modules.sort(function(a, b) { return a.avgEase - b.avgEase; });

        // 5. Top 10 weakest individual exercises
        // Only actual exercises (not flashcards), reviewed at least twice,
        // with ease below "Good" (2.5). Flashcards use a different quality
        // scale so mixing them with exercises is meaningless.
        var allExercises = [];
        for (var k = 0; k < srsKeys.length; k++) {
            var exKey = srsKeys[k];
            if (exKey.indexOf('fc_') === 0) continue; // skip flashcard keys
            var entry = srsData[exKey];
            if (entry.repetitions >= 2 && entry.easeFactor < 2.5) {
                allExercises.push({
                    key: exKey,
                    easeFactor: entry.easeFactor,
                    nextReview: entry.nextReview,
                    label: entry.label
                });
            }
        }
        allExercises.sort(function(a, b) { return a.easeFactor - b.easeFactor; });
        var weakest = allExercises.slice(0, 10);

        // 6. Rating breakdown from exercise progress
        var gotIt = 0;
        var struggled = 0;
        var peeked = 0;
        var progressKeys = Object.keys(progressData);
        for (var p = 0; p < progressKeys.length; p++) {
            var prog = progressData[progressKeys[p]];
            if (prog.selfRating === 1) gotIt++;
            else if (prog.selfRating === 2) struggled++;
            else if (prog.selfRating === 3) peeked++;
        }

        // 7. Global stats
        var totalTracked = srsKeys.length;
        var masteredCount = 0;
        var weakCount = 0;
        for (var t = 0; t < srsKeys.length; t++) {
            var srsEntry = srsData[srsKeys[t]];
            // Only count items with enough reviews to be meaningful
            if (srsEntry.repetitions >= 2 && srsEntry.easeFactor >= 2.5) masteredCount++;
            if (srsEntry.repetitions >= 2 && srsEntry.easeFactor < 1.8) weakCount++;
        }

        // 8. Concept strength breakdown (recency-weighted)
        var conceptMap = {}; // "moduleNum|concept" -> { weightedEase, totalWeight, count }
        var conceptIndex = window.ConceptIndex || {};

        for (var ci = 0; ci < srsKeys.length; ci++) {
            var cKey = srsKeys[ci];
            if (cKey.indexOf('fc_') === 0) continue; // skip flashcards
            var cEntry = srsData[cKey];
            var cModNum = extractModuleNum(cKey);
            if (cModNum === null) continue;

            var baseKey = stripVariantSuffix(cKey);
            var conceptName = conceptIndex[baseKey];
            if (!conceptName) continue;

            // Recency weight: 1 / (1 + daysSinceLastReview / 30)
            var cWeight = 1;
            if (cEntry.nextReview && cEntry.interval) {
                var cLastReview = new Date(cEntry.nextReview);
                cLastReview.setDate(cLastReview.getDate() - cEntry.interval);
                var cDaysSince = Math.max(0, (now - cLastReview) / (1000 * 60 * 60 * 24));
                cWeight = 1 / (1 + cDaysSince / 30);
            }

            var conceptGroupKey = cModNum + '|' + conceptName;
            if (!conceptMap[conceptGroupKey]) {
                conceptMap[conceptGroupKey] = { moduleNum: cModNum, concept: conceptName, weightedEase: 0, totalWeight: 0, count: 0 };
            }
            conceptMap[conceptGroupKey].weightedEase += cEntry.easeFactor * cWeight;
            conceptMap[conceptGroupKey].totalWeight += cWeight;
            conceptMap[conceptGroupKey].count += (cEntry.reviewCount || Math.max(cEntry.repetitions, 1));
        }

        var concepts = [];
        var conceptGroupKeys = Object.keys(conceptMap);
        for (var cg = 0; cg < conceptGroupKeys.length; cg++) {
            var cData = conceptMap[conceptGroupKeys[cg]];
            var cAvgEase = cData.totalWeight > 0 ? cData.weightedEase / cData.totalWeight : cData.weightedEase / cData.count;
            var cLabel = strengthLabel(cAvgEase, cData.count, MIN_CONCEPT_REVIEWS);
            concepts.push({
                moduleNum: cData.moduleNum,
                concept: cData.concept,
                avgEase: Math.round(cAvgEase * 10) / 10,
                count: cData.count,
                label: cLabel,
                color: strengthColor(cLabel)
            });
        }

        // Sort: "Too early" at bottom, then weakest-first by avgEase
        concepts.sort(function(a, b) {
            var aEarly = a.label === 'Too early' ? 1 : 0;
            var bEarly = b.label === 'Too early' ? 1 : 0;
            if (aEarly !== bEarly) return aEarly - bEarly;
            return a.avgEase - b.avgEase;
        });

        return {
            totalTracked: totalTracked,
            masteredCount: masteredCount,
            weakCount: weakCount,
            modules: modules,
            concepts: concepts,
            weakest: weakest,
            ratings: { gotIt: gotIt, struggled: struggled, peeked: peeked }
        };
    }

    // ---------------------------------------------------------------------------
    // Rendering — Row 1: Health at a Glance
    // ---------------------------------------------------------------------------

    function renderSparkline(snapshots) {
        var dates = Object.keys(snapshots).sort();
        if (dates.length < 2) return '<span style="color: var(--text-secondary); font-size: 0.75rem;">Need 2+ days of data</span>';

        var W = 120, H = 40, PAD = 4;
        var values = [];
        for (var i = 0; i < dates.length; i++) {
            values.push(snapshots[dates[i]].mastered || 0);
        }

        var min = values[0], max = values[0];
        for (var v = 1; v < values.length; v++) {
            if (values[v] < min) min = values[v];
            if (values[v] > max) max = values[v];
        }
        var range = max - min || 1;

        var points = [];
        for (var p = 0; p < values.length; p++) {
            var x = PAD + (p / (values.length - 1)) * (W - 2 * PAD);
            var y = H - PAD - ((values[p] - min) / range) * (H - 2 * PAD);
            points.push(Math.round(x * 10) / 10 + ',' + (Math.round(y * 10) / 10));
        }

        var trending = values[values.length - 1] >= values[0];
        var color = trending ? 'var(--green-bright)' : 'var(--red)';

        return '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" style="display:block;">' +
            '<polyline points="' + points.join(' ') + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
            '</svg>';
    }

    function renderHealthRow(report) {
        var el = document.getElementById('health-row');

        // Overall mastery %
        var reviewed = 0;
        for (var i = 0; i < report.modules.length; i++) {
            reviewed += report.modules[i].count;
        }
        var masteryPct = reviewed > 0 ? Math.round((report.masteredCount / reviewed) * 100) : 0;
        var masteryColor = masteryPct >= 70 ? 'var(--green-bright)' : (masteryPct >= 40 ? 'var(--orange)' : 'var(--red)');

        // Due for review
        var dueCount = (window.SRS && typeof window.SRS.getDueCount === 'function') ? window.SRS.getDueCount() : 0;
        var dueColor = dueCount > 10 ? 'var(--red)' : (dueCount > 0 ? 'var(--orange)' : 'var(--green-bright)');

        // Streak
        var currentStreak = (window.Streaks && typeof window.Streaks.getCurrent === 'function') ? window.Streaks.getCurrent() : 0;
        var longestStreak = (window.Streaks && typeof window.Streaks.getLongest === 'function') ? window.Streaks.getLongest() : 0;

        // Sparkline
        var snapshots = loadSnapshots();
        var sparklineHTML = renderSparkline(snapshots);

        el.innerHTML =
            // Card 1: Overall Mastery
            '<div class="stat-card" title="Mastered items as % of all reviewed">' +
                '<div class="stat-value" style="--stat-color: ' + masteryColor + ';">' + masteryPct + '%</div>' +
                '<div class="stat-sub">' + report.masteredCount + '/' + reviewed + ' reviewed</div>' +
                '<div class="stat-label">Overall Mastery</div>' +
            '</div>' +
            // Card 2: Due for Review
            '<div class="stat-card">' +
                '<a href="daily-practice.html?mode=review&autostart" style="text-decoration: none; color: inherit;">' +
                    '<div class="stat-value" style="--stat-color: ' + dueColor + ';">' + dueCount + '</div>' +
                    '<div class="stat-label">Due for Review</div>' +
                '</a>' +
            '</div>' +
            // Card 3: Day Streak
            '<div class="stat-card">' +
                '<div class="stat-value" style="--stat-color: var(--orange);">' + currentStreak + '</div>' +
                '<div class="stat-sub">Longest: ' + longestStreak + '</div>' +
                '<div class="stat-label">Day Streak</div>' +
            '</div>' +
            // Card 4: 30-Day Trend
            '<div class="stat-card">' +
                '<div class="sparkline-wrap">' + sparklineHTML + '</div>' +
                '<div class="stat-label">30-Day Mastery Trend</div>' +
            '</div>';
    }

    // ---------------------------------------------------------------------------
    // Rendering — Row 2: Module Health Grid
    // ---------------------------------------------------------------------------

    function renderModuleHealthGrid(report) {
        var el = document.getElementById('module-grid');

        // Build lookup from report modules
        var modLookup = {};
        for (var i = 0; i < report.modules.length; i++) {
            modLookup[report.modules[i].num] = report.modules[i];
        }

        // Get full module list from config
        var allModules = (window.CourseConfigHelper && window.CourseConfigHelper.modulesWithExercises) || [];
        // If no config, fall back to report modules only
        if (allModules.length === 0) {
            for (var j = 0; j < report.modules.length; j++) {
                allModules.push(report.modules[j].num);
            }
        }

        var gridHTML = '';
        for (var m = 0; m < allModules.length; m++) {
            var modId = allModules[m];
            var mod = modLookup[modId];
            var link = modulePageUrl(modId);
            var cellLabel = modId === 'algo' ? 'AL' : 'M' + modId;

            if (mod) {
                var bgColor = mod.color;
                var tooltipText = mod.name + ' \u2014 ' + mod.label +
                    '<br>Ease: ' + mod.avgEase + ' \u00B7 ' + mod.mastered + '/' + mod.count + ' mastered';
                gridHTML +=
                    '<a href="' + link + '" class="mgrid-cell" style="--cell-bg: ' + bgColor + ';">' +
                        '<span class="mgrid-label">' + cellLabel + '</span>' +
                        '<span class="mgrid-tooltip">' + tooltipText + '</span>' +
                    '</a>';
            } else {
                // Not started
                var modName = (window.CourseConfigHelper && window.CourseConfigHelper.moduleNames && window.CourseConfigHelper.moduleNames[modId]) || ('Module ' + modId);
                gridHTML +=
                    '<a href="' + link + '" class="mgrid-cell" style="--cell-bg: var(--bg-muted); --cell-color: var(--text-secondary);">' +
                        '<span class="mgrid-label" style="background: none; color: inherit;">' + cellLabel + '</span>' +
                        '<span class="mgrid-tooltip">' + modName + ' \u2014 Not started</span>' +
                    '</a>';
            }
        }

        el.innerHTML = gridHTML;
    }

    // ---------------------------------------------------------------------------
    // Rendering — Row 3: Action Items
    // ---------------------------------------------------------------------------

    function renderActionItems(report) {
        var el = document.getElementById('action-row');
        var items = [];

        // Action 1: Due exercises
        var dueCount = (window.SRS && typeof window.SRS.getDueCount === 'function') ? window.SRS.getDueCount() : 0;
        if (dueCount > 0) {
            // Find oldest due date
            var dueExercises = (window.SRS && typeof window.SRS.getDueExercises === 'function') ? window.SRS.getDueExercises() : [];
            var oldestDays = 0;
            if (dueExercises.length > 0) {
                var now = new Date();
                now.setHours(0, 0, 0, 0);
                var oldest = new Date(dueExercises[0].nextReview);
                oldest.setHours(0, 0, 0, 0);
                oldestDays = Math.round((now - oldest) / (1000 * 60 * 60 * 24));
            }
            var ageText = oldestDays > 0 ? ' \u2014 oldest from ' + oldestDays + ' day' + (oldestDays === 1 ? '' : 's') + ' ago' : '';
            items.push({
                icon: '\u23F0',
                text: dueCount + ' exercise' + (dueCount === 1 ? '' : 's') + ' due for review' + ageText,
                link: 'daily-practice.html?mode=review&autostart',
                linkText: 'Practice now'
            });
        }

        // Action 2: Weakest concept
        var ratedConcepts = [];
        for (var c = 0; c < report.concepts.length; c++) {
            if (report.concepts[c].label !== 'Too early') ratedConcepts.push(report.concepts[c]);
        }
        if (ratedConcepts.length > 0 && (ratedConcepts[0].label === 'Weak' || ratedConcepts[0].label === 'Moderate')) {
            var wc = ratedConcepts[0];
            var conceptLinksMap = window.ConceptLinks || {};
            var modLinks = conceptLinksMap[wc.moduleNum] || {};
            var conceptRef = modLinks[wc.concept] || '';
            var wcLink = conceptRef && conceptRef.charAt(0) !== '#' ? conceptRef : modulePageUrl(wc.moduleNum) + conceptRef;
            var wcModName = wc.moduleNum === 'algo' ? 'Algorithms' : 'Module ' + wc.moduleNum;
            items.push({
                icon: '\u26A0',
                text: 'Weakest concept: ' + wc.concept + ' in ' + wcModName,
                link: wcLink,
                linkText: 'Review'
            });
        }

        // Action 3: Decaying module (last practiced a long time ago)
        if (window.SRS && typeof window.SRS.getAll === 'function') {
            var srsData = window.SRS.getAll();
            var now2 = new Date();
            var worstDecay = null;
            var worstDays = 0;

            for (var m = 0; m < report.modules.length; m++) {
                var mod = report.modules[m];
                if (mod.label === 'Too early') continue;
                // Find most recent review in this module
                var srsKeys = Object.keys(srsData);
                var newestReview = null;
                for (var s = 0; s < srsKeys.length; s++) {
                    var entry = srsData[srsKeys[s]];
                    var modNum = extractModuleNum(srsKeys[s]);
                    if (modNum !== mod.num) continue;
                    if (entry.nextReview && entry.interval) {
                        var lastReview = new Date(entry.nextReview);
                        lastReview.setDate(lastReview.getDate() - entry.interval);
                        if (!newestReview || lastReview > newestReview) newestReview = lastReview;
                    }
                }
                if (newestReview) {
                    var daysSince = Math.round((now2 - newestReview) / (1000 * 60 * 60 * 24));
                    if (daysSince >= 14 && daysSince > worstDays) {
                        worstDays = daysSince;
                        worstDecay = mod;
                    }
                }
            }

            if (worstDecay && items.length < 3) {
                var decayLink = modulePageUrl(worstDecay.num);
                items.push({
                    icon: (window.Icons && window.Icons.chartDown) || '\u2193',
                    text: worstDecay.name + ' is decaying \u2014 last practiced ' + worstDays + ' days ago',
                    link: decayLink,
                    linkText: 'Review module'
                });
            }
        }

        // Cap at 3
        items = items.slice(0, 3);

        if (items.length === 0) {
            el.innerHTML = '';
            return;
        }

        var html = '<div class="section-heading">Action Items</div>';
        for (var a = 0; a < items.length; a++) {
            html +=
                '<div class="action-item">' +
                    '<span class="action-icon">' + items[a].icon + '</span>' +
                    '<span class="action-text">' + items[a].text + '</span>' +
                    '<a href="' + items[a].link + '" class="action-link">' + items[a].linkText + ' \u2192</a>' +
                '</div>';
        }
        el.innerHTML = html;
    }

    // ---------------------------------------------------------------------------
    // Rendering — Row 4: Detail Panels
    // ---------------------------------------------------------------------------

    function exercisePracticeLink(key) {
        var modNum = extractModuleNum(key);
        if (modNum === null) return '';
        var page = modulePageUrl(modNum);
        return '<a href="' + page + '" class="practice-link">Practice \u2192</a>';
    }

    function renderDetailPanels(report) {
        var el = document.getElementById('detail-panels');
        var html = '';

        // --- Module Detail ---
        html += '<details class="detail-panel">' +
            '<summary>Module Detail</summary>' +
            '<div class="detail-body">' +
            '<p class="detail-desc">Needs 5+ reviews per module to rate strength. Weakest first.</p>';

        var hasTooEarlyModules = false;
        for (var im = 0; im < report.modules.length; im++) {
            if (report.modules[im].label === 'Too early') { hasTooEarlyModules = true; break; }
        }
        if (hasTooEarlyModules) {
            html += '<label class="too-early-toggle" id="mod-too-early-toggle">' +
                '<input type="checkbox"> Show "Too early" modules' +
                '</label>';
        }

        html += '<div id="module-detail-list">';
        for (var i = 0; i < report.modules.length; i++) {
            var mod = report.modules[i];
            var isTooEarly = mod.label === 'Too early';
            var rowClass = isTooEarly ? 'too-early-item' : '';
            var pct = isTooEarly ? 0 : Math.min(100, Math.round((mod.avgEase / 3.0) * 100));
            var easeDisplay = isTooEarly ? '' : '<span class="an-module-ease">' + mod.avgEase + '</span>';
            var modLabel = mod.num === 'algo' ? 'AL' : 'M' + mod.num;
            var moduleLink = modulePageUrl(mod.num);
            html +=
                '<div class="an-module-row ' + rowClass + '" style="--row-color: ' + mod.color + ';">' +
                    '<a href="' + moduleLink + '">' + modLabel + '</a>' +
                    '<span class="an-module-name">' + mod.name + '</span>' +
                    '<span class="an-module-count">' + mod.count + ' reviewed</span>' +
                    '<div class="an-progress-track"><div class="an-progress-fill" style="width: ' + pct + '%; --fill-color: ' + mod.color + ';"></div></div>' +
                    easeDisplay +
                    '<span class="strength-badge" style="background: ' + mod.color + '; color: ' + badgeTextColor(mod.label) + ';">' + mod.label + '</span>' +
                '</div>';
        }
        html += '</div></div></details>';

        // --- Concept Detail ---
        html += '<details class="detail-panel">' +
            '<summary>Concept Detail</summary>' +
            '<div class="detail-body">' +
            '<p class="detail-desc">Per-concept breakdown. Needs 3+ review sessions to rate. Weakest first.</p>';

        if (report.concepts.length === 0) {
            html += '<div class="empty-panel-msg">No concept data yet.</div>';
        } else {
            var hasTooEarlyConcepts = false;
            for (var ic = 0; ic < report.concepts.length; ic++) {
                if (report.concepts[ic].label === 'Too early') { hasTooEarlyConcepts = true; break; }
            }
            if (hasTooEarlyConcepts) {
                html += '<label class="too-early-toggle" id="concept-too-early-toggle">' +
                    '<input type="checkbox"> Show "Too early" concepts' +
                    '</label>';
            }

            var conceptLinksMap = window.ConceptLinks || {};
            html += '<div id="concept-detail-list">';
            for (var c = 0; c < report.concepts.length; c++) {
                var con = report.concepts[c];
                var cIsTooEarly = con.label === 'Too early';
                var cRowClass = cIsTooEarly ? 'too-early-item' : '';
                var cPct = Math.min(100, Math.round((con.avgEase / 3.0) * 100));
                var cBarColor = cIsTooEarly ? 'var(--text-secondary)' : con.color;
                var cBarOpacity = cIsTooEarly ? 'opacity: 0.35;' : '';
                var cEaseDisplay = '<span class="an-concept-ease"' + (cIsTooEarly ? ' style="opacity: 0.5;"' : '') + '>' + con.avgEase + '</span>';
                var cModLinks = conceptLinksMap[con.moduleNum] || {};
                var cRef = cModLinks[con.concept] || '';
                var conLink = cRef && cRef.charAt(0) !== '#' ? cRef : modulePageUrl(con.moduleNum) + cRef;
                var conLabel = con.moduleNum === 'algo' ? 'AL' : 'M' + con.moduleNum;
                var reviewWord = con.count === 1 ? ' review' : ' reviews';
                html +=
                    '<div class="an-concept-row ' + cRowClass + '" style="--row-color: ' + con.color + ';">' +
                        '<a href="' + conLink + '" class="an-concept-link">' + conLabel + '</a>' +
                        '<a href="' + conLink + '" class="an-concept-name">' + con.concept + '</a>' +
                        '<span class="an-concept-count">' + con.count + reviewWord + '</span>' +
                        '<div class="an-progress-track an-progress-track--sm"><div class="an-progress-fill" style="width: ' + cPct + '%; --fill-color: ' + cBarColor + ';' + cBarOpacity + '"></div></div>' +
                        cEaseDisplay +
                        '<span class="strength-badge" style="background: ' + con.color + '; color: ' + badgeTextColor(con.label) + ';">' + con.label + '</span>' +
                    '</div>';
            }
            html += '</div>';
        }
        html += '</div></details>';

        // --- Weakest Exercises ---
        html += '<details class="detail-panel">' +
            '<summary>Weakest Exercises</summary>' +
            '<div class="detail-body">' +
            '<p class="detail-desc">Top 10 exercises with the lowest ease factors.</p>';

        if (report.weakest.length === 0) {
            html += '<div class="empty-panel-msg">No weak exercises yet. Keep practising and struggling exercises will surface.</div>';
        } else {
            for (var w = 0; w < report.weakest.length; w++) {
                var ex = report.weakest[w];
                var rank = w + 1;
                var status = dueStatus(ex.nextReview);
                html +=
                    '<div class="an-weakest-row">' +
                        '<span class="an-rank">#' + rank + '</span>' +
                        '<span class="an-name">' + prettifyKey(ex.key, ex) + '</span>' +
                        '<span class="an-ease">Ease: ' + ex.easeFactor + '</span>' +
                        '<span class="an-status">' + status + '</span>' +
                        exercisePracticeLink(ex.key) +
                    '</div>';
            }
        }
        html += '</div></details>';

        // --- Rating Breakdown ---
        html += '<details class="detail-panel">' +
            '<summary>Rating Breakdown</summary>' +
            '<div class="detail-body">' +
            '<p class="detail-desc">How you\'ve rated yourself across all exercise attempts.</p>';

        var totalRatings = report.ratings.gotIt + report.ratings.struggled + report.ratings.peeked;
        var pctGot = totalRatings > 0 ? Math.round((report.ratings.gotIt / totalRatings) * 100) : 0;
        var pctStr = totalRatings > 0 ? Math.round((report.ratings.struggled / totalRatings) * 100) : 0;
        var pctPeek = totalRatings > 0 ? Math.round((report.ratings.peeked / totalRatings) * 100) : 0;

        html +=
            '<div class="an-rating-bar-row">' +
                '<span class="an-rating-bar-label rating-guide-got-it">Got it</span>' +
                '<div class="an-rating-bar-track">' +
                    '<div class="an-rating-bar-fill" style="width: ' + pctGot + '%; background: var(--green-bright);">' + report.ratings.gotIt + '</div>' +
                '</div>' +
            '</div>' +
            '<div class="an-rating-bar-row">' +
                '<span class="an-rating-bar-label rating-guide-struggled">Struggled</span>' +
                '<div class="an-rating-bar-track">' +
                    '<div class="an-rating-bar-fill" style="width: ' + pctStr + '%; background: var(--orange);">' + report.ratings.struggled + '</div>' +
                '</div>' +
            '</div>' +
            '<div class="an-rating-bar-row">' +
                '<span class="an-rating-bar-label" style="color: var(--red);">Needed solution</span>' +
                '<div class="an-rating-bar-track">' +
                    '<div class="an-rating-bar-fill" style="width: ' + pctPeek + '%; background: var(--red);">' + report.ratings.peeked + '</div>' +
                '</div>' +
            '</div>';

        html += '</div></details>';

        el.innerHTML = html;

        // Wire up "Too early" toggles
        var modToggle = document.getElementById('mod-too-early-toggle');
        if (modToggle) {
            modToggle.querySelector('input').addEventListener('change', function() {
                var list = document.getElementById('module-detail-list');
                if (this.checked) list.classList.add('show-too-early');
                else list.classList.remove('show-too-early');
            });
        }
        var conToggle = document.getElementById('concept-too-early-toggle');
        if (conToggle) {
            conToggle.querySelector('input').addEventListener('change', function() {
                var list = document.getElementById('concept-detail-list');
                if (this.checked) list.classList.add('show-too-early');
                else list.classList.remove('show-too-early');
            });
        }
    }

    // ---------------------------------------------------------------------------
    // Rendering — Main Dispatcher
    // ---------------------------------------------------------------------------

    function renderReport() {
        var report = buildReport();

        var emptyEl = document.getElementById('analytics-empty');
        var reportEl = document.getElementById('analytics-report');

        if (!report) {
            emptyEl.style.display = '';
            reportEl.style.display = 'none';
            return;
        }

        emptyEl.style.display = 'none';
        reportEl.style.display = '';

        // Save today's snapshot for trend tracking
        saveSnapshot(report);

        // Render all 4 rows
        renderHealthRow(report);
        renderModuleHealthGrid(report);
        renderActionItems(report);
        renderDetailPanels(report);
    }

    // ---------------------------------------------------------------------------
    // Init
    // ---------------------------------------------------------------------------

    document.addEventListener('DOMContentLoaded', function() {
        // Fix empty-state start link for split modules
        var startLink = document.getElementById('analytics-start-link');
        if (startLink) {
            var modules = (window.CourseConfigHelper && window.CourseConfigHelper.modules) || [];
            var first = null;
            for (var i = 0; i < modules.length; i++) {
                if (modules[i].hasExercises) { first = modules[i]; break; }
            }
            if (first) {
                startLink.href = first.isSplit ? first.file + '-1.html' : first.file + '.html';
            }
        }
        renderReport();
    });
})();
