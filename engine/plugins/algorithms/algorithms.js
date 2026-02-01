/**
 * Algorithm Practice Session Logic
 *
 * Session-based UI for practicing algorithm problems with spaced repetition.
 * Uses ExerciseCore for shared exercise systems, ExerciseRenderer for card
 * rendering, and SessionEngine for session lifecycle.
 *
 * Features:
 *   - Structured Progression: mastery bars per category, difficulty gating
 *   - Blind Assessment Mode: hide hints/solutions, self-grade, then reveal
 *   - Pattern Recognition Drills: multiple-choice "which pattern?" questions
 *
 * SRS key format: algo_{categoryId}_{problemId}_{variantId}
 */
(function() {
    'use strict';

    var SE = window.SessionEngine;
    var EC = window.ExerciseCore;
    var data = window.AlgorithmData;

    var config = {
        type: 'practice',
        category: 'all',
        count: 10,
        difficulty: 'balanced',
        mode: 'mixed',
        blind: 'off'
    };

    var session = null;
    var masteryData = null;
    var patternDrillStats = null;

    // --- SRS filter ---

    function algoFilter(key) {
        return key.startsWith('algo_');
    }

    function categoryFilter(key) {
        if (config.category === 'all') return algoFilter(key);
        return key.indexOf('algo_' + config.category + '_') === 0;
    }

    // --- Mastery Computation (Feature 1) ---

    function computeMastery() {
        if (!data || !data.categories) return {};

        var progressData = window.ExerciseProgress ? window.ExerciseProgress.loadAll() : {};
        var result = {};

        data.categories.forEach(function(cat) {
            var tiers = { 1: { total: 0, mastered: 0 }, 2: { total: 0, mastered: 0 }, 3: { total: 0, mastered: 0 } };
            var totalVariants = 0;
            var totalMastered = 0;

            if (cat.problems) {
                cat.problems.forEach(function(problem) {
                    if (!problem.variants) return;
                    problem.variants.forEach(function(variant) {
                        var diff = variant.difficulty || 2;
                        var tier = diff <= 1 ? 1 : diff >= 3 ? 3 : 2;
                        tiers[tier].total++;
                        totalVariants++;

                        var key = 'algo_' + cat.id + '_' + problem.id + '_' + variant.id;
                        var prog = progressData[key];
                        if (prog && prog.selfRating === 1) {
                            tiers[tier].mastered++;
                            totalMastered++;
                        }
                    });
                });
            }

            var easyPct = tiers[1].total > 0 ? tiers[1].mastered / tiers[1].total : 0;
            var medPct = tiers[2].total > 0 ? tiers[2].mastered / tiers[2].total : 0;

            result[cat.id] = {
                tiers: tiers,
                easyPct: easyPct,
                medPct: medPct,
                mediumUnlocked: easyPct >= 0.7,
                hardUnlocked: medPct >= 0.7,
                overallMastery: totalVariants > 0 ? totalMastered / totalVariants : 0,
                totalVariants: totalVariants,
                totalMastered: totalMastered
            };
        });

        return result;
    }

    // --- Category Grid Rendering (Feature 1) ---

    function renderCategoryGrid() {
        var container = document.getElementById('algo-category-grid');
        if (!container || !data.categories) return;

        masteryData = computeMastery();

        // "All" card
        var totalVariants = 0;
        var totalMastered = 0;
        data.categories.forEach(function(cat) {
            var m = masteryData[cat.id];
            if (m) {
                totalVariants += m.totalVariants;
                totalMastered += m.totalMastered;
            }
        });
        var allPct = totalVariants > 0 ? Math.round((totalMastered / totalVariants) * 100) : 0;

        var html = '<div class="algo-cat-card active" data-category="all">' +
            '<div class="algo-cat-icon">*</div>' +
            '<div class="algo-cat-name">All Categories</div>' +
            '<div class="algo-cat-mastery-bar"><div class="mastery-fill" style="width: ' + allPct + '%"></div></div>' +
            '<div class="algo-cat-tiers"><span class="tier">' + totalMastered + '/' + totalVariants + ' mastered</span></div>' +
            '</div>';

        data.categories.forEach(function(cat) {
            var m = masteryData[cat.id] || { tiers: { 1: { total: 0, mastered: 0 }, 2: { total: 0, mastered: 0 }, 3: { total: 0, mastered: 0 } }, mediumUnlocked: false, hardUnlocked: false, overallMastery: 0 };
            var pct = Math.round(m.overallMastery * 100);

            html += '<div class="algo-cat-card" data-category="' + cat.id + '">' +
                '<div class="algo-cat-icon">' + (cat.icon || '#') + '</div>' +
                '<div class="algo-cat-name">' + cat.name + '</div>' +
                '<div class="algo-cat-mastery-bar"><div class="mastery-fill" style="width: ' + pct + '%"></div></div>' +
                '<div class="algo-cat-tiers">' +
                    '<span class="tier unlocked">Easy ' + m.tiers[1].mastered + '/' + m.tiers[1].total + '</span>' +
                    '<span class="tier ' + (m.mediumUnlocked ? 'unlocked' : 'locked') + '">Med ' + m.tiers[2].mastered + '/' + m.tiers[2].total + (m.mediumUnlocked ? '' : ' &#x1f512;') + '</span>' +
                    '<span class="tier ' + (m.hardUnlocked ? 'unlocked' : 'locked') + '">Hard ' + m.tiers[3].mastered + '/' + m.tiers[3].total + (m.hardUnlocked ? '' : ' &#x1f512;') + '</span>' +
                '</div>' +
                '</div>';
        });

        container.innerHTML = html;

        // Wire up click handlers for category selection
        container.querySelectorAll('.algo-cat-card').forEach(function(card) {
            card.addEventListener('click', function() {
                container.querySelectorAll('.algo-cat-card').forEach(function(c) {
                    c.classList.remove('active');
                });
                card.classList.add('active');
                config.category = card.getAttribute('data-category');
            });
        });
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

        renderCategoryGrid();
        setupTypeToggle();
        setupConfigButtons();
        updateStats();

        var bestMode = SE.preselectBestMode(algoFilter);
        config.mode = bestMode;
        var btn = document.querySelector('#algo-mode-options .session-option[data-mode="' + bestMode + '"]');
        if (btn) {
            SE.setActiveOption('algo-mode-options', 'session-option', btn);
        }

        loadPatternDrillStats();
    }

    function setupTypeToggle() {
        var typeContainer = document.getElementById('algo-type-options');
        if (!typeContainer) return;

        typeContainer.querySelectorAll('.session-option').forEach(function(btn) {
            btn.addEventListener('click', function() {
                typeContainer.querySelectorAll('.session-option').forEach(function(b) {
                    b.classList.remove('active');
                });
                btn.classList.add('active');
                config.type = btn.getAttribute('data-type');
                toggleConfigRows();
            });
        });
    }

    function toggleConfigRows() {
        var practiceRows = document.querySelectorAll('.practice-config-row');
        var drillInfo = document.getElementById('algo-drill-info');

        if (config.type === 'pattern-drill') {
            practiceRows.forEach(function(row) { row.style.display = 'none'; });
            if (drillInfo) drillInfo.style.display = '';
        } else {
            practiceRows.forEach(function(row) { row.style.display = ''; });
            if (drillInfo) drillInfo.style.display = 'none';
        }
    }

    function setupConfigButtons() {
        SE.setupOptionGroup('algo-count-options', 'session-option', config, 'count', parseInt);
        SE.setupOptionGroup('algo-difficulty-options', 'session-option', config, 'difficulty');
        SE.setupOptionGroup('algo-mode-options', 'session-option', config, 'mode');
        SE.setupOptionGroup('algo-blind-options', 'session-option', config, 'blind');
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

        var stats = SE.updateStats({ due: 'algo-due', weak: 'algo-weak' }, algoFilter);
        SE.setText('algo-total', totalVariants);
        SE.setText('algo-practiced', stats.total);
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

        var candidates = SE.buildPaddedSRSQueue(mode, count, categoryFilter, { pad: false });
        if (candidates.length === 0) return [];

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

        if (difficulty && difficulty !== 'mixed') {
            allProblems = filterByDifficulty(allProblems, difficulty);
        }

        return SE.buildDiscoverQueue(allProblems, count);
    }

    function filterByDifficulty(problems, difficulty) {
        if (difficulty === 'easy') {
            return problems.filter(function(p) { return (p.variant.difficulty || 2) <= 1; });
        } else if (difficulty === 'hard') {
            return problems.filter(function(p) { return (p.variant.difficulty || 2) >= 3; });
        } else if (difficulty === 'progressive') {
            // Gate by unlock status — only include unlocked tiers per category
            if (masteryData) {
                problems = problems.filter(function(p) {
                    var m = masteryData[p.category.id];
                    if (!m) return true;
                    var diff = p.variant.difficulty || 2;
                    var tier = diff <= 1 ? 1 : diff >= 3 ? 3 : 2;
                    if (tier === 1) return true;
                    if (tier === 2) return m.mediumUnlocked;
                    if (tier === 3) return m.hardUnlocked;
                    return true;
                });
            }
            return problems.slice().sort(function(a, b) {
                return (a.variant.difficulty || 2) - (b.variant.difficulty || 2);
            });
        }
        return problems;
    }

    // --- Session Management ---

    function startSession() {
        if (config.type === 'pattern-drill') {
            startPatternDrillSession();
            return;
        }

        var queue = buildQueue();
        var renderFn = config.blind === 'on' ? renderAssessmentExercise : renderCurrentExercise;

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
            onRender: renderFn,
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

    // --- Standard Rendering ---

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

    // --- Blind Assessment Mode (Feature 2) ---

    function renderAssessmentExercise(sess) {
        var item = sess.queue[sess.index];
        if (!item) return;

        var catEl = document.getElementById('algo-session-category');
        if (catEl) catEl.textContent = item.category.name + ' (Assessment)';

        var container = document.getElementById('algo-exercise-container');
        if (!container) return;

        var ER = window.ExerciseRenderer;
        var stars = ER ? ER.getDifficultyStars(item.variant.difficulty || item.problem.difficulty || 2) : '';

        var html = '<div class="exercise assessment-exercise" data-exercise-key="' + item.key + '">' +
            '<h4>' + (item.variant.title || item.problem.name) + ' ' + stars + '</h4>' +
            '<div class="exercise-desc">' + (item.variant.description || '') + '</div>';

        // Test cases / expected output (visible in assessment)
        if (ER) {
            var expected = ER.renderExpected(item.variant);
            if (expected) html += expected;
        }

        html += '<div class="assessment-actions">' +
            '<button class="assessment-grade-btn" onclick="AlgorithmPractice.gradeAssessment()">Ready to Grade</button>' +
            '</div>' +
            '<div class="assessment-reveal" id="assessment-reveal" hidden></div>' +
            '</div>';

        container.innerHTML = html;
    }

    function gradeAssessment() {
        if (!session) return;
        var item = session.queue[session.index];
        if (!item) return;

        var revealEl = document.getElementById('assessment-reveal');
        if (!revealEl) return;

        // Hide the grade button
        var actionsEl = revealEl.parentElement.querySelector('.assessment-actions');
        if (actionsEl) actionsEl.style.display = 'none';

        // Show self-rating UI
        var html = '<div class="self-rating" data-exercise-key="' + item.key + '">' +
            '<span class="self-rating-label">How did you do?</span>' +
            '<div class="self-rating-buttons">' +
                '<button class="rating-btn" data-rating="1" onclick="AlgorithmPractice.rateAssessment(1)">Got it</button>' +
                '<button class="rating-btn" data-rating="2" onclick="AlgorithmPractice.rateAssessment(2)">Struggled</button>' +
                '<button class="rating-btn" data-rating="3" onclick="AlgorithmPractice.rateAssessment(3)">Needed solution</button>' +
            '</div></div>';

        revealEl.innerHTML = html;
        revealEl.hidden = false;
    }

    function rateAssessment(rating) {
        if (!session) return;
        var item = session.queue[session.index];
        if (!item) return;

        // Record progress and SRS review
        if (window.ExerciseProgress) {
            window.ExerciseProgress.update(item.key, {
                status: 'completed',
                selfRating: rating,
                lastAttempted: new Date().toISOString()
            });
        }
        if (window.SRS) {
            // SRS quality: 1=got it -> 5, 2=struggled -> 3, 3=needed solution -> 1
            var quality = rating === 1 ? 5 : rating === 2 ? 3 : 1;
            window.SRS.recordReview(item.key, quality, (item.variant.title || item.problem.name));
        }

        // Disable rating buttons
        var revealEl = document.getElementById('assessment-reveal');
        if (!revealEl) return;
        revealEl.querySelectorAll('.rating-btn').forEach(function(btn) {
            btn.disabled = true;
            if (parseInt(btn.getAttribute('data-rating')) === rating) {
                btn.classList.add('selected');
            }
        });

        // Now reveal the solution + pattern primer
        var solutionHtml = '<div class="assessment-solution-reveal">';

        if (item.problem.patternPrimer) {
            var pp = item.problem.patternPrimer;
            solutionHtml += '<div class="algo-pattern-primer" style="margin-top: 1rem;">' +
                '<div style="color: var(--purple); font-weight: 600; margin-bottom: 0.5rem;">Pattern Primer: ' + item.problem.concept + '</div>' +
                '<div class="hint-content">' +
                    '<div style="margin-bottom: 0.5rem;"><strong>Brute force:</strong> ' + pp.bruteForce + '</div>' +
                    '<div style="margin-bottom: 0.5rem;"><strong>Best approach:</strong> ' + pp.bestApproach + '</div>' +
                    '<div><strong>Typical:</strong> ' + pp.typical + '</div>' +
                '</div></div>';
        }

        if (item.variant.solution) {
            var ER = window.ExerciseRenderer;
            if (ER) {
                solutionHtml += '<div style="margin-top: 1rem;">' + ER.renderSolution(item.variant.solution, item.variant.annotations) + '</div>';
            }
        }

        if (item.variant.hints && item.variant.hints.length > 0) {
            var ER2 = window.ExerciseRenderer;
            if (ER2) {
                solutionHtml += '<div style="margin-top: 1rem;">' + ER2.renderHints(item.variant.hints) + '</div>';
            }
        }

        if (item.problem.docLinks && item.problem.docLinks.length > 0) {
            var ER3 = window.ExerciseRenderer;
            if (ER3) {
                solutionHtml += '<div style="margin-top: 1rem;">' + ER3.renderDocLinks(item.problem.docLinks) + '</div>';
            }
        }

        solutionHtml += '</div>';
        revealEl.innerHTML += solutionHtml;
    }

    // --- Pattern Recognition Drills (Feature 3) ---

    function loadPatternDrillStats() {
        try {
            var storageKey = window.CourseConfigHelper ? window.CourseConfigHelper.storageKey('algo-pattern-stats') : 'algo-pattern-stats';
            patternDrillStats = JSON.parse(localStorage.getItem(storageKey) || '{}');
        } catch (e) {
            patternDrillStats = {};
        }
        if (!patternDrillStats.total) {
            patternDrillStats = { total: 0, correct: 0, byCategory: {} };
        }
    }

    function savePatternDrillStats() {
        try {
            var storageKey = window.CourseConfigHelper ? window.CourseConfigHelper.storageKey('algo-pattern-stats') : 'algo-pattern-stats';
            localStorage.setItem(storageKey, JSON.stringify(patternDrillStats));
        } catch (e) { /* ignore */ }
    }

    function getAllConcepts() {
        if (!data || !data.categories) return [];
        var concepts = [];
        var seen = {};
        data.categories.forEach(function(cat) {
            if (!cat.problems) return;
            cat.problems.forEach(function(p) {
                if (p.concept && !seen[p.concept]) {
                    seen[p.concept] = true;
                    concepts.push({ concept: p.concept, categoryId: cat.id });
                }
            });
        });
        return concepts;
    }

    function buildPatternDrillQueue(count) {
        // Pick random problems from selected category (or all)
        var allProblems = [];
        data.categories.forEach(function(cat) {
            if (config.category !== 'all' && cat.id !== config.category) return;
            if (!cat.problems) return;
            cat.problems.forEach(function(problem) {
                if (!problem.variants || problem.variants.length === 0) return;
                allProblems.push({
                    category: cat,
                    problem: problem,
                    variant: problem.variants[0] // Use first variant for description
                });
            });
        });

        SE.shuffle(allProblems);
        var selected = allProblems.slice(0, count);

        var allConcepts = getAllConcepts();

        return selected.map(function(item) {
            // Build distractors: 3 random concepts from OTHER categories
            var correctConcept = item.problem.concept;
            var otherConcepts = allConcepts.filter(function(c) {
                return c.concept !== correctConcept && c.categoryId !== item.category.id;
            });

            // If not enough from other categories, allow same category but different concept
            if (otherConcepts.length < 3) {
                otherConcepts = allConcepts.filter(function(c) {
                    return c.concept !== correctConcept;
                });
            }

            SE.shuffle(otherConcepts);
            var distractors = otherConcepts.slice(0, 3).map(function(c) { return c.concept; });

            // Combine correct + distractors and shuffle
            var choices = [correctConcept].concat(distractors);
            SE.shuffle(choices);

            return {
                category: item.category,
                problem: item.problem,
                variant: item.variant,
                correctConcept: correctConcept,
                choices: choices
            };
        });
    }

    function startPatternDrillSession() {
        var count = config.count;
        var queue = buildPatternDrillQueue(count);

        if (queue.length === 0) {
            var hintEl = document.getElementById('algo-start-hint');
            if (hintEl) {
                hintEl.textContent = 'No problems available for pattern drill with current category selection.';
                hintEl.style.display = '';
            }
            return;
        }

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
            onRender: renderPatternDrill,
            extraHideOnStart: ['algo-help']
        });
        session.queue = queue;
        session.patternDrill = true;
        session.drillCorrect = 0;
        session.drillTotal = 0;

        SE.startSession(session);
    }

    function renderPatternDrill(sess) {
        var item = sess.queue[sess.index];
        if (!item) return;

        var catEl = document.getElementById('algo-session-category');
        if (catEl) catEl.textContent = 'Pattern Drill';

        var container = document.getElementById('algo-exercise-container');
        if (!container) return;

        var html = '<div class="pattern-drill-card">' +
            '<div class="pattern-drill-problem">' +
                '<h4>What pattern solves this?</h4>' +
                '<p class="pattern-drill-desc">' + (item.variant.description || item.problem.name) + '</p>';

        // Show test cases if available
        var ER = window.ExerciseRenderer;
        if (ER) {
            var expected = ER.renderExpected(item.variant);
            if (expected) html += expected;
        }

        html += '</div><div class="pattern-drill-choices">';

        item.choices.forEach(function(choice) {
            html += '<button class="pattern-choice" data-concept="' + choice.replace(/"/g, '&quot;') + '" onclick="AlgorithmPractice.selectPatternChoice(this)">' + choice + '</button>';
        });

        html += '</div>' +
            '<div class="pattern-drill-result" id="pattern-drill-result" hidden></div>' +
            '</div>';

        container.innerHTML = html;
    }

    function selectPatternChoice(btn) {
        if (!session || !session.patternDrill) return;
        var item = session.queue[session.index];
        if (!item) return;

        var selectedConcept = btn.getAttribute('data-concept');
        var isCorrect = selectedConcept === item.correctConcept;

        session.drillTotal++;
        if (isCorrect) session.drillCorrect++;

        // Update pattern drill stats
        patternDrillStats.total++;
        if (isCorrect) patternDrillStats.correct++;
        if (!patternDrillStats.byCategory[item.category.id]) {
            patternDrillStats.byCategory[item.category.id] = { total: 0, correct: 0, name: item.category.name };
        }
        patternDrillStats.byCategory[item.category.id].total++;
        if (isCorrect) patternDrillStats.byCategory[item.category.id].correct++;
        savePatternDrillStats();

        // Disable all choice buttons and highlight correct/incorrect
        var container = btn.parentElement;
        container.querySelectorAll('.pattern-choice').forEach(function(choiceBtn) {
            choiceBtn.disabled = true;
            var concept = choiceBtn.getAttribute('data-concept');
            if (concept === item.correctConcept) {
                choiceBtn.classList.add('correct');
            } else if (choiceBtn === btn && !isCorrect) {
                choiceBtn.classList.add('incorrect');
            }
        });

        // Show result with pattern primer
        var resultEl = document.getElementById('pattern-drill-result');
        if (resultEl) {
            var resultHtml = '<div class="pattern-result-icon">' + (isCorrect ? 'Correct!' : 'Incorrect') + '</div>';

            if (item.problem.patternPrimer) {
                var pp = item.problem.patternPrimer;
                resultHtml += '<div class="pattern-primer">' +
                    '<strong>Pattern: ' + item.correctConcept + '</strong>' +
                    '<p><strong>Brute force:</strong> ' + pp.bruteForce + '</p>' +
                    '<p><strong>Best approach:</strong> ' + pp.bestApproach + '</p>' +
                    '<p><strong>Typical:</strong> ' + pp.typical + '</p>' +
                    '</div>';
            } else {
                resultHtml += '<div class="pattern-primer"><strong>Pattern: ' + item.correctConcept + '</strong></div>';
            }

            resultEl.innerHTML = resultHtml;
            resultEl.hidden = false;
        }
    }

    function finishPatternDrillSession() {
        if (!session || !session.patternDrill) return;

        var resultsEl = document.getElementById('algo-results');
        if (!resultsEl) return;

        var pct = session.drillTotal > 0 ? Math.round((session.drillCorrect / session.drillTotal) * 100) : 0;

        var html = '<div class="pattern-drill-results">' +
            '<h3>Pattern Recognition Results</h3>' +
            '<div class="session-complete-grid">' +
                '<div class="session-complete-stat">' +
                    '<div class="session-complete-stat-value">' + session.drillCorrect + '/' + session.drillTotal + '</div>' +
                    '<div class="session-complete-stat-label">Correct</div>' +
                '</div>' +
                '<div class="session-complete-stat">' +
                    '<div class="session-complete-stat-value">' + pct + '%</div>' +
                    '<div class="session-complete-stat-label">Accuracy</div>' +
                '</div>' +
            '</div>';

        // Overall lifetime stats
        if (patternDrillStats && patternDrillStats.total > 0) {
            var lifetimePct = Math.round((patternDrillStats.correct / patternDrillStats.total) * 100);
            html += '<div style="margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid var(--bg-lighter);">' +
                '<div style="color: var(--text-dim); font-size: 0.85rem; margin-bottom: 0.5rem;">Lifetime: ' +
                patternDrillStats.correct + '/' + patternDrillStats.total + ' (' + lifetimePct + '%)</div>';

            var catIds = Object.keys(patternDrillStats.byCategory);
            if (catIds.length > 0) {
                html += '<div style="font-size: 0.8rem; color: var(--text-dim);">';
                catIds.forEach(function(catId) {
                    var cs = patternDrillStats.byCategory[catId];
                    var cPct = cs.total > 0 ? Math.round((cs.correct / cs.total) * 100) : 0;
                    html += '<div>' + (cs.name || catId) + ': ' + cs.correct + '/' + cs.total + ' (' + cPct + '%)</div>';
                });
                html += '</div>';
            }
            html += '</div>';
        }

        html += '</div>';
        resultsEl.innerHTML = html;
    }

    // --- Public API ---

    window.AlgorithmPractice = {
        startSession: startSession,
        nextExercise: function() {
            if (session && session.patternDrill) {
                session.results.completed++;
                if (session.index + 1 >= session.queue.length) {
                    // Pattern drill session complete — show custom results
                    SE.hide(session.ids.session);
                    SE.show(session.ids.complete);
                    finishPatternDrillSession();
                } else {
                    session.index++;
                    SE.renderSessionHeader(session);
                    session.onRender(session);
                }
                return;
            }
            if (session) SE.nextExercise(session);
        },
        skipExercise: function() {
            if (session && session.patternDrill) {
                session.results.skipped++;
                if (session.index + 1 >= session.queue.length) {
                    SE.hide(session.ids.session);
                    SE.show(session.ids.complete);
                    finishPatternDrillSession();
                } else {
                    session.index++;
                    SE.renderSessionHeader(session);
                    session.onRender(session);
                }
                return;
            }
            if (session) SE.skipExercise(session);
        },
        gradeAssessment: gradeAssessment,
        rateAssessment: rateAssessment,
        selectPatternChoice: selectPatternChoice
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
