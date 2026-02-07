/**
 * Weak Concept Report — Analytics for Go Course
 *
 * Reads SRS and exercise-progress data from localStorage,
 * groups by module, computes strength rankings, and renders
 * a visual report of the weakest concepts.
 */
(function() {
    'use strict';

    var MODULE_NAMES = (window.CourseConfigHelper && window.CourseConfigHelper.moduleNames) || {};

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
            case 'Too early': return 'var(--text-dim)';
            default:         return 'var(--text-dim)';
        }
    }

    /** Text color for strength badges: dark text on bright backgrounds, light on dim */
    function badgeTextColor(label) {
        return label === 'Too early' ? 'var(--text-main)' : '#111';
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
        if (diff === 0) return ' <span title="No change from last week" style="font-size: 0.7rem; color: var(--text-dim);">\u2192</span>';
        var good = higherIsBetter ? diff > 0 : diff < 0;
        var arrow = diff > 0 ? '\u2191' : '\u2193';
        var color = good ? 'var(--green-bright)' : 'var(--red)';
        var label = (diff > 0 ? '+' : '') + diff + ' from last week';
        return ' <span title="' + label + '" style="font-size: 0.7rem; color: ' + color + ';">' + arrow + '</span>';
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
    // Rendering
    // ---------------------------------------------------------------------------

    function renderReport() {
        var report = buildReport();

        var emptyEl = document.getElementById('analytics-empty');
        var reportEl = document.getElementById('analytics-report');

        if (!report) {
            // No data — show empty state
            emptyEl.style.display = '';
            reportEl.style.display = 'none';
            return;
        }

        // Data exists — swap visibility
        emptyEl.style.display = 'none';
        reportEl.style.display = '';

        // Save today's snapshot for trend tracking
        saveSnapshot(report);
        var prev = findComparisonSnapshot();

        // ------ Summary stats ------
        var statsEl = document.getElementById('analytics-stats');
        var modulesRated = 0;
        for (var s = 0; s < report.modules.length; s++) {
            if (report.modules[s].label !== 'Too early') modulesRated++;
        }

        statsEl.innerHTML =
            '<div class="stat-card" title="Unique exercises and flashcards tracked in SRS">' +
                '<div class="stat-value">' + report.totalTracked + trendArrow(report.totalTracked, prev && prev.totalTracked, true) + '</div>' +
                '<div class="stat-label">Items Tracked</div>' +
            '</div>' +
            '<div class="stat-card">' +
                '<div class="stat-value">' + modulesRated + ' / ' + report.modules.length + '</div>' +
                '<div class="stat-label">Modules Rated</div>' +
            '</div>' +
            '<div class="stat-card" title="Reviewed 2+ times with ease \u2265 2.5">' +
                '<div class="stat-value" style="color: var(--green-bright);">' + report.masteredCount + trendArrow(report.masteredCount, prev && prev.mastered, true) + '</div>' +
                '<div class="stat-label">Mastered</div>' +
            '</div>' +
            '<div class="stat-card" title="Reviewed 2+ times with ease < 1.8">' +
                '<div class="stat-value" style="color: var(--red);">' + report.weakCount + trendArrow(report.weakCount, prev && prev.weak, false) + '</div>' +
                '<div class="stat-label">Weak</div>' +
            '</div>';

        // ------ Module Rankings ------
        var rankingsEl = document.getElementById('module-rankings');
        var rankingsHTML = '';
        for (var i = 0; i < report.modules.length; i++) {
            var mod = report.modules[i];
            var isTooEarly = mod.label === 'Too early';
            var pct = isTooEarly ? 0 : Math.min(100, Math.round((mod.avgEase / 3.0) * 100));
            var easeDisplay = isTooEarly ? '' : '<span style="color: var(--text-dim); font-size: 0.85rem; min-width: 4rem;">' + mod.avgEase + '</span>';
            var modLabel = mod.num === 'algo' ? 'AL' : 'M' + mod.num;
            var moduleLink = mod.num === 'algo' ? 'algorithms.html' : 'module' + mod.num + '.html';
            rankingsHTML +=
                '<div style="display: flex; align-items: center; gap: 1rem; padding: 0.75rem; background: var(--bg-card); border-radius: 6px; margin-bottom: 0.5rem; border-left: 3px solid ' + mod.color + ';">' +
                    '<a href="' + moduleLink + '" style="color: var(--text-dim); min-width: 2rem; text-decoration: none;">' + modLabel + '</a>' +
                    '<span style="flex: 1;">' + mod.name + '</span>' +
                    '<span style="color: var(--text-dim); font-size: 0.8rem;">' + mod.count + ' reviewed</span>' +
                    '<div style="width: 120px; height: 8px; background: var(--bg-lighter); border-radius: 4px; overflow: hidden;">' +
                        '<div style="width: ' + pct + '%; height: 100%; background: ' + mod.color + '; border-radius: 4px;"></div>' +
                    '</div>' +
                    easeDisplay +
                    '<span class="strength-badge" style="background: ' + mod.color + '; color: ' + badgeTextColor(mod.label) + '; font-size: 0.75rem;">' + mod.label + '</span>' +
                '</div>';
        }
        rankingsEl.innerHTML = rankingsHTML;

        // ------ Concept Strength ------
        var conceptEl = document.getElementById('concept-strength');
        var conceptLinksMap = window.ConceptLinks || {};
        var conceptHTML = '';
        if (report.concepts.length === 0) {
            conceptHTML = '<div style="padding: 1.5rem; text-align: center; color: var(--text-dim);">No concept data available. Complete some exercises to see per-concept breakdown.</div>';
        } else {
            for (var c = 0; c < report.concepts.length; c++) {
                var con = report.concepts[c];
                var cIsTooEarly = con.label === 'Too early';
                var cPct = Math.min(100, Math.round((con.avgEase / 3.0) * 100));
                var cBarColor = cIsTooEarly ? 'var(--text-dim)' : con.color;
                var cBarOpacity = cIsTooEarly ? 'opacity: 0.35;' : '';
                var cEaseDisplay = '<span style="color: var(--text-dim); font-size: 0.8rem; min-width: 3.5rem;' + (cIsTooEarly ? ' opacity: 0.5;' : '') + '">' + con.avgEase + '</span>';
                var modLinks = conceptLinksMap[con.moduleNum] || {};
                var anchor = modLinks[con.concept] || '';
                var conLink = (con.moduleNum === 'algo' ? 'algorithms.html' : 'module' + con.moduleNum + '.html') + anchor;
                var conLabel = con.moduleNum === 'algo' ? 'AL' : 'M' + con.moduleNum;
                var reviewWord = con.count === 1 ? ' review' : ' reviews';
                conceptHTML +=
                    '<div style="display: flex; align-items: center; gap: 0.75rem; padding: 0.6rem 0.75rem; background: var(--bg-card); border-radius: 5px; margin-bottom: 0.4rem; border-left: 3px solid ' + con.color + '; font-size: 0.9rem;">' +
                        '<a href="' + conLink + '" style="color: var(--text-dim); min-width: 2rem; text-decoration: none;">' + conLabel + '</a>' +
                        '<a href="' + conLink + '" style="flex: 1; color: inherit; text-decoration: none;">' + con.concept + '</a>' +
                        '<span style="color: var(--text-dim); font-size: 0.75rem;">' + con.count + reviewWord + '</span>' +
                        '<div style="width: 100px; height: 6px; background: var(--bg-lighter); border-radius: 3px; overflow: hidden;">' +
                            '<div style="width: ' + cPct + '%; height: 100%; background: ' + cBarColor + '; border-radius: 3px;' + cBarOpacity + '"></div>' +
                        '</div>' +
                        cEaseDisplay +
                        '<span class="strength-badge" style="background: ' + con.color + '; color: ' + badgeTextColor(con.label) + '; font-size: 0.7rem;">' + con.label + '</span>' +
                    '</div>';
            }
        }
        conceptEl.innerHTML = conceptHTML;

        // ------ Weakest Exercises ------
        var weakestEl = document.getElementById('weakest-exercises');
        var weakestHTML = '';
        for (var w = 0; w < report.weakest.length; w++) {
            var ex = report.weakest[w];
            var rank = w + 1;
            var status = dueStatus(ex.nextReview);
            weakestHTML +=
                '<div style="display: flex; align-items: center; gap: 1rem; padding: 0.75rem; background: var(--bg-card); border-radius: 6px; margin-bottom: 0.5rem;">' +
                    '<span style="color: var(--red); font-weight: 700; min-width: 2rem;">#' + rank + '</span>' +
                    '<span style="flex: 1;">' + prettifyKey(ex.key, ex) + '</span>' +
                    '<span style="color: var(--text-dim);">Ease: ' + ex.easeFactor + '</span>' +
                    '<span style="color: var(--orange);">' + status + '</span>' +
                '</div>';
        }
        if (report.weakest.length === 0) {
            weakestHTML = '<div style="padding: 1.5rem; text-align: center; color: var(--text-dim);">No weak exercises yet. Exercises need 2+ reviews with an ease factor below 2.5 to appear here. Keep practising and struggling exercises will surface.</div>';
        }
        weakestEl.innerHTML = weakestHTML;

        // ------ Rating Breakdown ------
        var ratingEl = document.getElementById('rating-breakdown');
        var totalRatings = report.ratings.gotIt + report.ratings.struggled + report.ratings.peeked;
        var pctGot = totalRatings > 0 ? Math.round((report.ratings.gotIt / totalRatings) * 100) : 0;
        var pctStr = totalRatings > 0 ? Math.round((report.ratings.struggled / totalRatings) * 100) : 0;
        var pctPeek = totalRatings > 0 ? Math.round((report.ratings.peeked / totalRatings) * 100) : 0;

        ratingEl.innerHTML =
            // Got it
            '<div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 0.75rem;">' +
                '<span style="min-width: 6rem; color: var(--green-bright);">Got it</span>' +
                '<div style="flex: 1; height: 24px; background: var(--bg-lighter); border-radius: 4px; overflow: hidden;">' +
                    '<div style="width: ' + pctGot + '%; height: 100%; background: var(--green-bright); border-radius: 4px; display: flex; align-items: center; padding-left: 8px; color: var(--bg-dark); font-weight: 700; font-size: 0.8rem;">' + report.ratings.gotIt + '</div>' +
                '</div>' +
            '</div>' +
            // Struggled
            '<div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 0.75rem;">' +
                '<span style="min-width: 6rem; color: var(--orange);">Struggled</span>' +
                '<div style="flex: 1; height: 24px; background: var(--bg-lighter); border-radius: 4px; overflow: hidden;">' +
                    '<div style="width: ' + pctStr + '%; height: 100%; background: var(--orange); border-radius: 4px; display: flex; align-items: center; padding-left: 8px; color: var(--bg-dark); font-weight: 700; font-size: 0.8rem;">' + report.ratings.struggled + '</div>' +
                '</div>' +
            '</div>' +
            // Needed solution
            '<div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 0.75rem;">' +
                '<span style="min-width: 6rem; color: var(--red);">Needed solution</span>' +
                '<div style="flex: 1; height: 24px; background: var(--bg-lighter); border-radius: 4px; overflow: hidden;">' +
                    '<div style="width: ' + pctPeek + '%; height: 100%; background: var(--red); border-radius: 4px; display: flex; align-items: center; padding-left: 8px; color: var(--bg-dark); font-weight: 700; font-size: 0.8rem;">' + report.ratings.peeked + '</div>' +
                '</div>' +
            '</div>';
    }

    // ---------------------------------------------------------------------------
    // Init
    // ---------------------------------------------------------------------------

    document.addEventListener('DOMContentLoaded', function() {
        renderReport();
    });
})();
