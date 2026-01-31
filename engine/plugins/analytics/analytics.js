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
        var match = key.match(/^(?:fc_)?m(\d+)_/);
        return match ? parseInt(match[1], 10) : null;
    }

    /** Prettify an exercise/flashcard key for display */
    function prettifyKey(key, srsEntry) {
        // Use stored label if available
        if (srsEntry && srsEntry.label) return srsEntry.label;

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

    /** Minimum reviews per module before showing a strength label */
    var MIN_REVIEWS = 5;
    var MIN_CONCEPT_REVIEWS = 3;

    /** Determine strength label from average ease factor */
    function strengthLabel(avgEase, count, minReviews) {
        if (count < (minReviews || MIN_REVIEWS)) return 'Too early';
        if (avgEase >= 2.5) return 'Strong';
        if (avgEase >= 2.0) return 'Good';
        if (avgEase >= 1.7) return 'Moderate';
        return 'Weak';
    }

    /** Strip variant suffix from SRS key: m1_challenge_4_v9 -> m1_challenge_4 */
    function stripVariantSuffix(key) {
        return key.replace(/_v\d+$/, '');
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

        // 3. Group SRS entries by module
        var moduleMap = {}; // moduleNum -> { totalEase, count, mastered, entries[] }

        for (var i = 0; i < srsKeys.length; i++) {
            var key = srsKeys[i];
            var entry = srsData[key];
            var modNum = extractModuleNum(key);
            if (modNum === null) continue;

            if (!moduleMap[modNum]) {
                moduleMap[modNum] = { totalEase: 0, count: 0, mastered: 0, entries: [] };
            }
            moduleMap[modNum].totalEase += entry.easeFactor;
            moduleMap[modNum].count++;
            if (entry.easeFactor > 2.5) {
                moduleMap[modNum].mastered++;
            }
            moduleMap[modNum].entries.push({ key: key, easeFactor: entry.easeFactor, nextReview: entry.nextReview, label: entry.label });
        }

        // 4. Build module summaries
        var modules = [];
        var moduleNums = Object.keys(moduleMap);
        for (var j = 0; j < moduleNums.length; j++) {
            var num = parseInt(moduleNums[j], 10);
            var data = moduleMap[num];
            var avgEase = data.totalEase / data.count;
            var label = strengthLabel(avgEase, data.count);
            modules.push({
                num: num,
                name: MODULE_NAMES[num] || ('Module ' + num),
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
            if (srsEntry.repetitions >= 2 && srsEntry.easeFactor > 2.5) masteredCount++;
            if (srsEntry.repetitions >= 2 && srsEntry.easeFactor < 1.7) weakCount++;
        }

        // 8. Concept strength breakdown
        var conceptMap = {}; // "moduleNum|concept" -> { totalEase, count }
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

            var conceptGroupKey = cModNum + '|' + conceptName;
            if (!conceptMap[conceptGroupKey]) {
                conceptMap[conceptGroupKey] = { moduleNum: cModNum, concept: conceptName, totalEase: 0, count: 0 };
            }
            conceptMap[conceptGroupKey].totalEase += cEntry.easeFactor;
            conceptMap[conceptGroupKey].count++;
        }

        var concepts = [];
        var conceptGroupKeys = Object.keys(conceptMap);
        for (var cg = 0; cg < conceptGroupKeys.length; cg++) {
            var cData = conceptMap[conceptGroupKeys[cg]];
            var cAvgEase = cData.totalEase / cData.count;
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

        // ------ Summary stats ------
        var statsEl = document.getElementById('analytics-stats');
        var modulesRated = 0;
        for (var s = 0; s < report.modules.length; s++) {
            if (report.modules[s].label !== 'Too early') modulesRated++;
        }

        statsEl.innerHTML =
            '<div class="stat-card">' +
                '<div class="stat-value">' + report.totalTracked + '</div>' +
                '<div class="stat-label">Items Reviewed</div>' +
            '</div>' +
            '<div class="stat-card">' +
                '<div class="stat-value">' + modulesRated + ' / ' + report.modules.length + '</div>' +
                '<div class="stat-label">Modules Rated</div>' +
            '</div>' +
            '<div class="stat-card">' +
                '<div class="stat-value" style="color: var(--green-bright);">' + report.masteredCount + '</div>' +
                '<div class="stat-label">Mastered</div>' +
            '</div>' +
            '<div class="stat-card">' +
                '<div class="stat-value" style="color: var(--red);">' + report.weakCount + '</div>' +
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
            rankingsHTML +=
                '<div style="display: flex; align-items: center; gap: 1rem; padding: 0.75rem; background: var(--bg-card); border-radius: 6px; margin-bottom: 0.5rem; border-left: 3px solid ' + mod.color + ';">' +
                    '<span style="color: var(--text-dim); min-width: 2rem;">M' + mod.num + '</span>' +
                    '<span style="flex: 1;">' + mod.name + '</span>' +
                    '<span style="color: var(--text-dim); font-size: 0.8rem;">' + mod.count + ' reviewed</span>' +
                    '<div style="width: 120px; height: 8px; background: var(--bg-lighter); border-radius: 4px; overflow: hidden;">' +
                        '<div style="width: ' + pct + '%; height: 100%; background: ' + mod.color + '; border-radius: 4px;"></div>' +
                    '</div>' +
                    easeDisplay +
                    '<span class="module-tag" style="background: ' + mod.color + '; font-size: 0.75rem;">' + mod.label + '</span>' +
                '</div>';
        }
        rankingsEl.innerHTML = rankingsHTML;

        // ------ Concept Strength ------
        var conceptEl = document.getElementById('concept-strength');
        var conceptHTML = '';
        if (report.concepts.length === 0) {
            conceptHTML = '<div style="padding: 1.5rem; text-align: center; color: var(--text-dim);">No concept data available. Complete some exercises to see per-concept breakdown.</div>';
        } else {
            for (var c = 0; c < report.concepts.length; c++) {
                var con = report.concepts[c];
                var cIsTooEarly = con.label === 'Too early';
                var cPct = cIsTooEarly ? 0 : Math.min(100, Math.round((con.avgEase / 3.0) * 100));
                var cEaseDisplay = cIsTooEarly ? '' : '<span style="color: var(--text-dim); font-size: 0.8rem; min-width: 3.5rem;">' + con.avgEase + '</span>';
                conceptHTML +=
                    '<div style="display: flex; align-items: center; gap: 0.75rem; padding: 0.6rem 0.75rem; background: var(--bg-card); border-radius: 5px; margin-bottom: 0.4rem; border-left: 3px solid ' + con.color + '; font-size: 0.9rem;">' +
                        '<a href="module' + con.moduleNum + '.html" style="color: var(--text-dim); min-width: 2rem; text-decoration: none;">M' + con.moduleNum + '</a>' +
                        '<span style="flex: 1;">' + con.concept + '</span>' +
                        '<span style="color: var(--text-dim); font-size: 0.75rem;">' + con.count + ' reviews</span>' +
                        '<div style="width: 100px; height: 6px; background: var(--bg-lighter); border-radius: 3px; overflow: hidden;">' +
                            '<div style="width: ' + cPct + '%; height: 100%; background: ' + con.color + '; border-radius: 3px;"></div>' +
                        '</div>' +
                        cEaseDisplay +
                        '<span class="module-tag" style="background: ' + con.color + '; font-size: 0.7rem;">' + con.label + '</span>' +
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
            weakestHTML = '<div style="padding: 1.5rem; text-align: center; color: var(--text-dim);">No weak exercises yet. Keep reviewing and exercises you struggle with will appear here.</div>';
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
