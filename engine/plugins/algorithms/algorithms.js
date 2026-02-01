/**
 * Algorithm Practice Session Logic
 *
 * Session-based UI for practicing algorithm problems with spaced repetition.
 * Uses ExerciseCore for shared exercise systems, ExerciseRenderer for card
 * rendering, and SessionEngine for session lifecycle.
 *
 * SRS key format: algo_{categoryId}_{problemId}_{variantId}
 */
(function() {
    'use strict';

    var SE = window.SessionEngine;
    var EC = window.ExerciseCore;
    var data = window.AlgorithmData;

    var config = {
        category: 'all',
        count: 10,
        difficulty: 'balanced',
        mode: 'mixed'
    };

    var session = null;

    // --- SRS filter ---

    function algoFilter(key) {
        return key.startsWith('algo_');
    }

    function categoryFilter(key) {
        if (config.category === 'all') return algoFilter(key);
        return key.indexOf('algo_' + config.category + '_') === 0;
    }

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

        var bestMode = SE.preselectBestMode(algoFilter);
        config.mode = bestMode;
        var btn = document.querySelector('#algo-mode-options .session-option[data-mode="' + bestMode + '"]');
        if (btn) {
            SE.setActiveOption('algo-mode-options', 'session-option', btn);
        }
    }

    function populateCategoryButtons() {
        var container = document.getElementById('algo-category-options');
        if (!container || !data.categories) return;

        var html = '<button class="session-option active" data-category="all">All</button>';
        data.categories.forEach(function(cat) {
            html += '<button class="session-option" data-category="' + cat.id + '">' +
                (cat.icon ? cat.icon + ' ' : '') + cat.name + '</button>';
        });
        container.innerHTML = html;
    }

    function setupConfigButtons() {
        SE.setupOptionGroup('algo-category-options', 'session-option', config, 'category');
        SE.setupOptionGroup('algo-count-options', 'session-option', config, 'count', parseInt);
        SE.setupOptionGroup('algo-difficulty-options', 'session-option', config, 'difficulty');
        SE.setupOptionGroup('algo-mode-options', 'session-option', config, 'mode');
    }

    function updateStats() {
        if (!data || !data.categories) return;

        var totalVariants = 0;
        data.categories.forEach(function(cat) {
            if (cat.problems) {
                cat.problems.forEach(function(p) {
                    if (p.variants) totalVariants += p.variants.length;
                });
            }
        });

        var srsData = window.SRS ? window.SRS.getAll() : {};
        var practiced = 0;
        Object.keys(srsData).forEach(function(key) {
            if (key.startsWith('algo_')) practiced++;
        });

        var dueCount = 0;
        var weakCount = 0;
        if (window.SRS) {
            dueCount = window.SRS.getDueExercises().filter(function(e) { return e.key.startsWith('algo_'); }).length;
            weakCount = window.SRS.getWeakestExercises(50).filter(function(e) {
                return e.key.startsWith('algo_') && e.easeFactor < 2.0;
            }).length;
        }

        SE.setText('algo-total', totalVariants);
        SE.setText('algo-practiced', practiced);
        SE.setText('algo-due', dueCount);
        SE.setText('algo-weak', weakCount);
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

    function buildQueue() {
        var mode = config.mode;
        var count = config.count;

        if (mode === 'discover') {
            return buildDiscoverQueue(count, config.difficulty);
        }

        var candidates = SE.buildSRSQueue(mode, count, categoryFilter);

        if ((mode === 'review' || mode === 'weakest') && candidates.length < 5) {
            return [];
        }
        if (mode === 'mixed' && candidates.length === 0) {
            return [];
        }

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

        return SE.shuffle(resolved).slice(0, count);
    }

    function buildDiscoverQueue(count, difficulty) {
        var allProblems = getAllProblems();
        var srsData = window.SRS ? window.SRS.getAll() : {};

        if (difficulty && difficulty !== 'mixed') {
            allProblems = filterByDifficulty(allProblems, difficulty);
        }

        var unseen = allProblems.filter(function(p) { return !srsData[p.key]; });
        var seen = allProblems.filter(function(p) { return !!srsData[p.key]; });

        SE.shuffle(unseen);
        SE.shuffle(seen);

        return unseen.concat(seen).slice(0, count).map(function(p) {
            return { key: p.key, category: p.category, problem: p.problem, variant: p.variant };
        });
    }

    function filterByDifficulty(problems, difficulty) {
        if (difficulty === 'easy') {
            return problems.filter(function(p) { return (p.variant.difficulty || 2) <= 1; });
        } else if (difficulty === 'hard') {
            return problems.filter(function(p) { return (p.variant.difficulty || 2) >= 3; });
        } else if (difficulty === 'progressive') {
            return problems.slice().sort(function(a, b) {
                return (a.variant.difficulty || 2) - (b.variant.difficulty || 2);
            });
        }
        return problems;
    }

    // --- Session Management ---

    function startSession() {
        var queue = buildQueue();

        session = SE.createSession({
            ids: {
                config: 'algo-config',
                stats: 'algo-stats',
                session: 'algo-session',
                label: 'algo-session-label',
                bar: 'algo-session-bar',
                container: 'algo-exercise-container',
                complete: 'algo-complete',
                results: 'algo-results',
                hint: 'algo-start-hint'
            },
            itemLabel: 'Problem',
            accentColor: 'purple',
            onRender: renderCurrentExercise,
            extraHideOnStart: ['algo-help']
        });
        session.queue = queue;

        if (!SE.startSession(session)) {
            var hintEl = document.getElementById('algo-start-hint');
            if (hintEl) {
                var modeLabel = config.mode === 'review' ? 'due for review'
                    : config.mode === 'weakest' ? 'weak enough'
                    : config.mode === 'mixed' ? 'due or weak'
                    : 'matching';
                hintEl.textContent = 'Not enough exercises ' + modeLabel + ' yet \u2014 try Discover mode, or practice and rate some problems first.';
                hintEl.style.display = '';
            }
        }
    }

    // --- Rendering ---

    function renderCurrentExercise(sess) {
        var item = sess.queue[sess.index];
        if (!item) return;

        var catEl = document.getElementById('algo-session-category');
        if (catEl) catEl.textContent = item.category.name;

        var container = document.getElementById('algo-exercise-container');
        if (!container) return;

        var challengeObj = {
            id: item.problem.id,
            concept: item.problem.concept,
            difficulty: item.problem.difficulty,
            docLinks: item.problem.docLinks,
            variants: item.problem.variants
        };

        var html = '';

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

        if (window.ExerciseRenderer) {
            html += window.ExerciseRenderer.renderExerciseCard({
                num: sess.index + 1,
                variant: item.variant,
                challenge: challengeObj,
                type: 'challenge',
                exerciseKey: item.key,
                moduleLabel: item.category.name
            });
        }

        container.innerHTML = html;

        container.querySelectorAll('.exercise').forEach(function(ex) {
            EC.initThinkingTimer(ex);
            if (window.ExerciseRenderer) {
                window.ExerciseRenderer.initPersonalNotes(ex);
            }
        });

        if (window.initExerciseProgress) window.initExerciseProgress();
    }

    // --- Public API ---

    window.AlgorithmPractice = {
        startSession: startSession,
        nextExercise: function() { if (session) SE.nextExercise(session); },
        skipExercise: function() { if (session) SE.skipExercise(session); }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
