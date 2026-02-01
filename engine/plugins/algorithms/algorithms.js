/**
 * Algorithm Practice Session Logic
 *
 * Session-based UI for practicing algorithm problems with spaced repetition.
 * Uses ExerciseCore for shared exercise systems and ExerciseRenderer for card rendering.
 *
 * SRS key format: algo_{categoryId}_{problemId}_{variantId}
 */
(function() {
    'use strict';

    var EC = window.ExerciseCore;
    var data = window.AlgorithmData;

    var config = {
        category: 'all',
        count: 10,
        difficulty: 'balanced',
        mode: 'mixed'
    };

    var sessionQueue = [];
    var sessionIndex = 0;
    var sessionResults = { completed: 0, skipped: 0 };

    // --- Initialization ---

    function init() {
        if (!data || !data.categories) {
            var container = document.getElementById('algo-config');
            if (container) {
                container.innerHTML = '<p style="color: var(--text-dim); text-align: center; padding: 2rem;">No algorithm data available for this course.</p>';
            }
            return;
        }

        populateCategoryButtons();
        setupConfigButtons();
        updateStats();
        preselectBestMode();
    }

    function populateCategoryButtons() {
        var container = document.getElementById('algo-category-options');
        if (!container || !data.categories) return;

        var html = '<button class="algo-option active" data-category="all">All</button>';
        data.categories.forEach(function(cat) {
            html += '<button class="algo-option" data-category="' + cat.id + '">' +
                (cat.icon ? cat.icon + ' ' : '') + cat.name + '</button>';
        });
        container.innerHTML = html;
    }

    function setupConfigButtons() {
        setupOptionGroup('algo-category-options', 'category');
        setupOptionGroup('algo-count-options', 'count', parseInt);
        setupOptionGroup('algo-difficulty-options', 'difficulty');
        setupOptionGroup('algo-mode-options', 'mode');
    }

    function setupOptionGroup(containerId, configKey, transform) {
        document.querySelectorAll('#' + containerId + ' .algo-option').forEach(function(btn) {
            btn.addEventListener('click', function() {
                document.querySelectorAll('#' + containerId + ' .algo-option').forEach(function(b) {
                    b.classList.remove('active');
                });
                btn.classList.add('active');
                var val = btn.dataset[configKey];
                config[configKey] = transform ? transform(val) : val;
            });
        });
    }

    function updateStats() {
        if (!data || !data.categories) return;

        var totalProblems = 0;
        var totalVariants = 0;

        data.categories.forEach(function(cat) {
            if (cat.problems) {
                totalProblems += cat.problems.length;
                cat.problems.forEach(function(p) {
                    if (p.variants) totalVariants += p.variants.length;
                });
            }
        });

        var srsData = window.SRS ? window.SRS.getAll() : {};
        var practiced = 0;
        var dueCount = 0;
        var weakCount = 0;

        Object.keys(srsData).forEach(function(key) {
            if (key.startsWith('algo_')) {
                practiced++;
            }
        });

        if (window.SRS) {
            var due = window.SRS.getDueExercises().filter(function(e) { return e.key.startsWith('algo_'); });
            dueCount = due.length;
            var weak = window.SRS.getWeakestExercises(50).filter(function(e) {
                return e.key.startsWith('algo_') && e.easeFactor < 2.0;
            });
            weakCount = weak.length;
        }

        setText('algo-total', totalVariants);
        setText('algo-practiced', practiced);
        setText('algo-due', dueCount);
        setText('algo-weak', weakCount);
    }

    function preselectBestMode() {
        if (!window.SRS) return;

        var due = window.SRS.getDueExercises().filter(function(e) { return e.key.startsWith('algo_'); });
        var weak = window.SRS.getWeakestExercises(10).filter(function(e) {
            return e.key.startsWith('algo_') && e.easeFactor < 2.0;
        });

        var bestMode;
        if (due.length >= 5) {
            bestMode = 'review';
        } else if (weak.length >= 3) {
            bestMode = 'weakest';
        } else if (due.length > 0 || weak.length > 0) {
            bestMode = 'mixed';
        } else {
            bestMode = 'discover';
        }

        config.mode = bestMode;
        var btn = document.querySelector('#algo-mode-options .algo-option[data-mode="' + bestMode + '"]');
        if (btn) {
            document.querySelectorAll('#algo-mode-options .algo-option').forEach(function(b) { b.classList.remove('active'); });
            btn.classList.add('active');
        }
    }

    // --- Queue Building ---

    function getAllProblems() {
        if (!data || !data.categories) return [];

        var items = [];
        data.categories.forEach(function(cat) {
            if (config.category !== 'all' && cat.id !== config.category) return;
            if (!cat.problems) return;

            cat.problems.forEach(function(problem) {
                if (!problem.variants) return;
                problem.variants.forEach(function(variant) {
                    items.push({
                        category: cat,
                        problem: problem,
                        variant: variant,
                        key: 'algo_' + cat.id + '_' + problem.id + '_' + variant.id
                    });
                });
            });
        });
        return items;
    }

    function shuffle(arr) {
        for (var i = arr.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = arr[i];
            arr[i] = arr[j];
            arr[j] = tmp;
        }
        return arr;
    }

    function buildQueue() {
        var mode = config.mode;
        var count = config.count;
        var difficulty = config.difficulty;

        if (mode === 'discover') {
            return buildDiscoverQueue(count, difficulty);
        }

        if (!window.SRS) return [];

        var candidates = [];

        if (mode === 'review') {
            candidates = window.SRS.getDueExercises().filter(function(e) { return e.key.startsWith('algo_'); });
        } else if (mode === 'weakest') {
            candidates = window.SRS.getWeakestExercises(count * 2).filter(function(e) { return e.key.startsWith('algo_'); });
        } else if (mode === 'mixed') {
            var due = window.SRS.getDueExercises().filter(function(e) { return e.key.startsWith('algo_'); });
            var weak = window.SRS.getWeakestExercises(count).filter(function(e) { return e.key.startsWith('algo_'); });
            var seen = {};
            candidates = [];
            due.concat(weak).forEach(function(item) {
                if (!seen[item.key]) {
                    seen[item.key] = true;
                    candidates.push(item);
                }
            });
        }

        // Apply category filter
        if (config.category !== 'all') {
            candidates = candidates.filter(function(item) {
                return item.key.indexOf('algo_' + config.category + '_') === 0;
            });
        }

        // Review and weakest need a minimum pool to be meaningful —
        // below 5 exercises the mode doesn't have enough signal
        if ((mode === 'review' || mode === 'weakest') && candidates.length < 5) {
            return [];
        }

        // Mixed with nothing due or weak — return empty so user gets feedback
        if (mode === 'mixed' && candidates.length === 0) {
            return [];
        }

        // Resolve candidates to full problem data
        var allProblems = getAllProblems();
        var problemMap = {};
        allProblems.forEach(function(p) { problemMap[p.key] = p; });

        var resolved = [];
        candidates.forEach(function(item) {
            var p = problemMap[item.key];
            if (p) {
                resolved.push({
                    key: p.key,
                    category: p.category,
                    problem: p.problem,
                    variant: p.variant
                });
            }
        });

        return shuffle(resolved).slice(0, count);
    }

    function buildDiscoverQueue(count, difficulty) {
        var allProblems = getAllProblems();
        var srsData = window.SRS ? window.SRS.getAll() : {};

        // Apply difficulty filter
        if (difficulty && difficulty !== 'mixed') {
            allProblems = filterByDifficulty(allProblems, difficulty);
        }

        var unseen = allProblems.filter(function(p) { return !srsData[p.key]; });
        var seen = allProblems.filter(function(p) { return !!srsData[p.key]; });

        shuffle(unseen);
        shuffle(seen);

        var queue = unseen.concat(seen).slice(0, count);
        return queue.map(function(p) {
            return {
                key: p.key,
                category: p.category,
                problem: p.problem,
                variant: p.variant
            };
        });
    }

    function filterByDifficulty(problems, difficulty) {
        if (difficulty === 'easy') {
            return problems.filter(function(p) { return (p.variant.difficulty || 2) <= 1; });
        } else if (difficulty === 'hard') {
            return problems.filter(function(p) { return (p.variant.difficulty || 2) >= 3; });
        } else if (difficulty === 'progressive') {
            // Sort by difficulty, take a progressive mix
            return problems.slice().sort(function(a, b) {
                return (a.variant.difficulty || 2) - (b.variant.difficulty || 2);
            });
        }
        // balanced - return all, the shuffle handles distribution
        return problems;
    }

    // --- Session Management ---

    function startSession() {
        sessionQueue = buildQueue();

        if (sessionQueue.length === 0) {
            var hintEl = document.getElementById('algo-start-hint');
            if (hintEl) {
                var modeLabel = config.mode === 'review' ? 'due for review'
                    : config.mode === 'weakest' ? 'weak enough'
                    : config.mode === 'mixed' ? 'due or weak'
                    : 'matching';
                hintEl.textContent = 'Not enough exercises ' + modeLabel + ' yet \u2014 try Discover mode, or practice and rate some problems first.';
                hintEl.style.display = '';
            }
            return;
        }

        var hintEl = document.getElementById('algo-start-hint');
        if (hintEl) hintEl.style.display = 'none';

        sessionIndex = 0;
        sessionResults = { completed: 0, skipped: 0 };

        hide('algo-config');
        hide('algo-stats');
        hide('algo-help');
        show('algo-session');

        renderCurrentExercise();
    }

    function nextExercise() {
        sessionResults.completed++;
        if (window.Streaks) window.Streaks.recordActivity();
        advance();
    }

    function skipExercise() {
        sessionResults.skipped++;
        advance();
    }

    function advance() {
        sessionIndex++;
        if (sessionIndex >= sessionQueue.length) {
            finishSession();
        } else {
            renderCurrentExercise();
        }
    }

    function finishSession() {
        hide('algo-session');
        show('algo-complete');

        var resultsEl = document.getElementById('algo-results');
        if (!resultsEl) return;

        var progress = window.ExerciseProgress?.loadAll() || {};
        var gotIt = 0, struggled = 0, peeked = 0;
        sessionQueue.forEach(function(item) {
            var p = progress[item.key];
            if (p && p.selfRating === 1) gotIt++;
            else if (p && p.selfRating === 2) struggled++;
            else if (p && p.selfRating === 3) peeked++;
        });

        resultsEl.innerHTML =
            '<div class="algo-stat">' +
                '<div class="algo-stat-value" style="color: var(--green-bright);">' + sessionResults.completed + '</div>' +
                '<div class="algo-stat-label">Completed</div>' +
            '</div>' +
            '<div class="algo-stat">' +
                '<div class="algo-stat-value" style="color: var(--text-dim);">' + sessionResults.skipped + '</div>' +
                '<div class="algo-stat-label">Skipped</div>' +
            '</div>' +
            '<div class="algo-stat">' +
                '<div class="algo-stat-value" style="color: var(--green-bright);">' + gotIt + '</div>' +
                '<div class="algo-stat-label">Got It</div>' +
            '</div>' +
            '<div class="algo-stat">' +
                '<div class="algo-stat-value" style="color: var(--orange);">' + struggled + '</div>' +
                '<div class="algo-stat-label">Struggled</div>' +
            '</div>' +
            '<div class="algo-stat">' +
                '<div class="algo-stat-value" style="color: var(--purple);">' + peeked + '</div>' +
                '<div class="algo-stat-label">Needed Solution</div>' +
            '</div>';
    }

    // --- Rendering ---

    function renderCurrentExercise() {
        var item = sessionQueue[sessionIndex];
        if (!item) return;

        // Update header
        var labelEl = document.getElementById('algo-session-label');
        if (labelEl) {
            labelEl.innerHTML = 'Problem <strong>' + (sessionIndex + 1) + '</strong> of <strong>' + sessionQueue.length + '</strong>';
        }

        var catEl = document.getElementById('algo-session-category');
        if (catEl) {
            catEl.textContent = item.category.name;
        }

        // Update progress bar
        var barEl = document.getElementById('algo-session-bar');
        if (barEl) {
            barEl.style.width = (sessionIndex / sessionQueue.length * 100) + '%';
        }

        var container = document.getElementById('algo-exercise-container');
        if (!container) return;

        // Build challenge-like object for ExerciseRenderer
        var challengeObj = {
            id: item.problem.id,
            concept: item.problem.concept,
            difficulty: item.problem.difficulty,
            docLinks: item.problem.docLinks,
            variants: item.problem.variants
        };

        var html = '';

        // Show pattern primer if available
        if (item.problem.patternPrimer) {
            var pp = item.problem.patternPrimer;
            html += '<details class="algo-pattern-primer">' +
                '<summary>Pattern Primer: ' + item.problem.concept + '</summary>' +
                '<div class="hint-content" style="margin-top: 0.75rem;">' +
                    '<div style="margin-bottom: 0.5rem;"><strong>Brute force:</strong> ' + pp.bruteForce + '</div>' +
                    '<div style="margin-bottom: 0.5rem;"><strong>Best approach:</strong> ' + pp.bestApproach + '</div>' +
                    '<div><strong>Typical:</strong> ' + pp.typical + '</div>' +
                '</div></details>';
        }

        // Render the exercise card
        if (window.ExerciseRenderer) {
            html += window.ExerciseRenderer.renderExerciseCard({
                num: sessionIndex + 1,
                variant: item.variant,
                challenge: challengeObj,
                type: 'challenge',
                exerciseKey: item.key,
                moduleLabel: item.category.name
            });
        }

        container.innerHTML = html;

        // Initialize thinking timer and other interactive elements
        container.querySelectorAll('.exercise').forEach(function(ex) {
            EC.initThinkingTimer(ex);
            if (window.ExerciseRenderer) {
                window.ExerciseRenderer.initPersonalNotes(ex);
            }
        });

        if (window.initExerciseProgress) window.initExerciseProgress();
    }

    // --- Helpers ---

    function setText(id, text) {
        var el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    function show(id) {
        var el = document.getElementById(id);
        if (el) { el.hidden = false; el.style.display = ''; }
    }

    function hide(id) {
        var el = document.getElementById(id);
        if (el) { el.hidden = true; el.style.display = 'none'; }
    }

    // --- Public API ---

    window.AlgorithmPractice = {
        startSession: startSession,
        nextExercise: nextExercise,
        skipExercise: skipExercise
    };

    // Init on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
