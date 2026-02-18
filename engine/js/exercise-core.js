/**
 * Exercise Core - Shared Exercise Systems
 *
 * Provides reusable exercise UI components and pure utility functions
 * used by course.js (module pages), algorithms.js (algorithm practice),
 * and daily-practice.js (cross-module review).
 *
 * Exposed as window.ExerciseCore
 *
 * @typedef {Object} ExerciseGroup
 * @property {string} id - Unique exercise identifier (e.g. "warmup_1")
 * @property {string} [concept] - Concept tag for filtering (e.g. "pointers")
 * @property {number} [difficulty] - Base difficulty (1-5)
 * @property {Variant[]} variants - Available variant versions of this exercise
 *
 * @typedef {Object} Variant
 * @property {string} id - Variant identifier (e.g. "v1", "v2")
 * @property {string} title - Display title
 * @property {string} description - Exercise description (markdown)
 * @property {string} solution - Solution code or explanation (markdown)
 * @property {string[]} [hints] - Progressive hint texts
 * @property {number} [difficulty] - Variant-specific difficulty override (1-5)
 * @property {Object} [annotations] - Annotation metadata keyed by annotation type
 */
(function() {
    'use strict';

    // -----------------------------------------------------------------------
    // Constants
    // -----------------------------------------------------------------------
    var DIFFICULTY_TARGETS = {
        1: 0.35,  // 35% easy
        2: 0.40,  // 40% medium
        3: 0.25   // 25% hard
    };

    var MODES = ['easy', 'mixed', 'balanced', 'progressive', 'hard'];

    // -----------------------------------------------------------------------
    // Pure Utility Functions
    // -----------------------------------------------------------------------
    function escapeHtml(text) {
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function getDifficultyStars(difficulty) {
        return Icons.stars(difficulty);
    }

    function getVariantDifficulty(variant, challenge) {
        if (variant && variant.difficulty) return variant.difficulty;
        return challenge ? (challenge.difficulty || challenge.block || 2) : 2;
    }

    function getExerciseDifficulty(exercise) {
        return exercise.difficulty || exercise.block || 1;
    }

    // -----------------------------------------------------------------------
    // Thinking Timer
    // -----------------------------------------------------------------------
    function initThinkingTimer(container, opts) {
        var seconds = (opts && opts.seconds != null) ? opts.seconds :
                      (window.THINKING_TIME_SECONDS != null ? window.THINKING_TIME_SECONDS : 45);
        if (seconds <= 0) return;

        var allDetails = container.querySelectorAll('details');
        var details = Array.from(allDetails).filter(function(d) {
            var summary = d.querySelector('summary');
            return summary && !summary.textContent.includes('Documentation');
        });
        if (details.length === 0) return;

        var btn = document.createElement('button');
        btn.className = 'thinking-timer-btn';
        btn.innerHTML = Icons.brain + ' Start ' + seconds + 's thinking timer';
        container.insertBefore(btn, allDetails[0]);

        btn.addEventListener('click', function() {
            details.forEach(function(d) {
                d.classList.add('thinking-locked');
                var summary = d.querySelector('summary');
                if (summary && !summary.querySelector('.lock-icon')) {
                    var span = document.createElement('span');
                    span.className = 'lock-icon';
                    span.innerHTML = ' ' + Icons.lock;
                    summary.appendChild(span);
                }
            });

            var timerDiv = document.createElement('div');
            timerDiv.className = 'thinking-timer';
            timerDiv.innerHTML = '<span class="timer-icon">' + Icons.brain + '</span> Think first: <span class="timer-countdown">' + seconds + '</span>s';
            btn.replaceWith(timerDiv);

            var remaining = seconds;
            var countdownSpan = timerDiv.querySelector('.timer-countdown');

            var interval = setInterval(function() {
                remaining--;
                countdownSpan.textContent = remaining;
                if (remaining <= 0) {
                    clearInterval(interval);
                    details.forEach(function(d) {
                        d.classList.remove('thinking-locked');
                        var lockIcon = d.querySelector('.lock-icon');
                        if (lockIcon) lockIcon.remove();
                    });
                    timerDiv.innerHTML = Icons.checkCircle + ' Hints unlocked!';
                    timerDiv.classList.add('timer-done');
                    setTimeout(function() { timerDiv.remove(); }, 2000);
                }
            }, 1000);
        });
    }

    // -----------------------------------------------------------------------
    // Difficulty Mode Selector
    // -----------------------------------------------------------------------
    function createDifficultySelector(opts) {
        var currentMode = (opts && opts.currentMode) || 'balanced';
        var onChange = opts && opts.onChange;

        var selectorDiv = document.createElement('div');
        selectorDiv.className = 'difficulty-mode-selector';
        selectorDiv.innerHTML =
            '<span class="difficulty-mode-label">' + Icons.sliders + ' Difficulty Mode:</span>' +
            '<div class="difficulty-mode-buttons">' +
                '<button class="difficulty-mode-btn easy' + (currentMode === 'easy' ? ' active' : '') + '" data-mode="easy">' +
                    '<div>' + Icons.star + ' Easy</div><span class="mode-desc">Only easy variants</span></button>' +
                '<button class="difficulty-mode-btn' + (currentMode === 'mixed' ? ' active' : '') + '" data-mode="mixed">' +
                    '<div>' + Icons.dice + ' Mixed</div><span class="mode-desc">Random mix</span></button>' +
                '<button class="difficulty-mode-btn' + (currentMode === 'balanced' ? ' active' : '') + '" data-mode="balanced">' +
                    '<div>' + Icons.scales + ' Balanced</div><span class="mode-desc">35% easy, 40% med, 25% hard</span></button>' +
                '<button class="difficulty-mode-btn' + (currentMode === 'progressive' ? ' active' : '') + '" data-mode="progressive">' +
                    '<div>' + Icons.chartUp + ' Progressive</div><span class="mode-desc">Easy \u2192 Medium \u2192 Hard</span></button>' +
                '<button class="difficulty-mode-btn hard' + (currentMode === 'hard' ? ' active' : '') + '" data-mode="hard">' +
                    '<div>' + Icons.stars(3) + ' Hard</div><span class="mode-desc">Only hard variants</span></button>' +
            '</div>';

        selectorDiv.querySelectorAll('.difficulty-mode-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                selectorDiv.querySelectorAll('.difficulty-mode-btn').forEach(function(b) { b.classList.remove('active'); });
                btn.classList.add('active');
                if (onChange) onChange(btn.dataset.mode);
            });
        });

        return selectorDiv;
    }

    // -----------------------------------------------------------------------
    // Shuffle Button
    // -----------------------------------------------------------------------
    function createShuffleBtn(opts) {
        var id = opts && opts.id;
        var color = (opts && opts.color) || 'orange';
        var onClick = opts && opts.onClick;

        // Map legacy color names to CSS class variants
        var colorMap = { 'orange': 'amber', 'green-bright': 'amethyst' };
        var mappedColor = colorMap[color] || color;

        var btn = document.createElement('button');
        if (id) btn.id = id;
        btn.innerHTML = Icons.dice + ' Shuffle';
        btn.className = 'shuffle-btn shuffle-btn--' + mappedColor;
        if (onClick) btn.addEventListener('click', onClick);
        return btn;
    }

    // -----------------------------------------------------------------------
    // Concept Extraction & Filter
    // -----------------------------------------------------------------------
    function getUniqueConcepts(exercises) {
        if (!exercises || !Array.isArray(exercises)) return [];
        var concepts = new Set();
        exercises.forEach(function(ex) {
            if (ex.concept) concepts.add(ex.concept);
        });
        return Array.from(concepts).sort();
    }

    function createConceptFilter(opts) {
        var concepts = opts.concepts || [];
        var label = opts.label || (Icons.target + ' Focus on a specific pattern:');
        var allLabel = opts.allLabel || 'All Patterns';
        var onChange = opts.onChange;

        if (concepts.length === 0) return null;

        var filterDiv = document.createElement('div');
        filterDiv.className = 'concept-filter';
        filterDiv.innerHTML =
            '<span class="concept-filter-label">' + label + '</span>' +
            '<div class="concept-filter-buttons">' +
                '<button class="concept-btn active" data-concept="">' + allLabel + '</button>' +
                concepts.map(function(c) { return '<button class="concept-btn" data-concept="' + c + '">' + c + '</button>'; }).join('') +
            '</div>';

        filterDiv.querySelectorAll('.concept-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                filterDiv.querySelectorAll('.concept-btn').forEach(function(b) { b.classList.remove('active'); });
                btn.classList.add('active');
                if (onChange) onChange(btn.dataset.concept || null);
            });
        });

        return filterDiv;
    }

    // -----------------------------------------------------------------------
    // Shuffle: Warmups (pure data operation + returns result)
    // -----------------------------------------------------------------------
    function shuffleWarmups(warmups, currentVariants, opts) {
        var conceptFilter = (opts && opts.conceptFilter) || null;

        var filtered = conceptFilter
            ? warmups.filter(function(w) { return w.concept === conceptFilter; })
            : warmups;

        var result = {};
        filtered.forEach(function(warmup) {
            var current = currentVariants[warmup.id];
            var available = warmup.variants.filter(function(v) { return !current || v.id !== current.id; });
            var pool = available.length > 0 ? available : warmup.variants;
            result[warmup.id] = pool[Math.floor(Math.random() * pool.length)];
        });

        return result;
    }

    // -----------------------------------------------------------------------
    // Pick Variant From Pool
    // -----------------------------------------------------------------------
    function pickVariantFromPool(pool, currentVariant) {
        if (!pool || pool.length === 0) return null;
        if (pool.length === 1) return pool[0];
        var available = pool.filter(function(v) { return !currentVariant || v.id !== currentVariant.id; });
        var finalPool = available.length > 0 ? available : pool;
        return finalPool[Math.floor(Math.random() * finalPool.length)];
    }

    // -----------------------------------------------------------------------
    // Shuffle: Challenges (all 5 modes, pure data)
    // -----------------------------------------------------------------------
    function shuffleChallenges(challenges, currentVariants, opts) {
        var mode = (opts && opts.mode) || 'balanced';
        var conceptFilter = (opts && opts.conceptFilter) || null;

        var filtered = conceptFilter
            ? challenges.filter(function(c) { return c.concept === conceptFilter; })
            : challenges;

        var result = {};

        if (mode === 'easy') {
            filtered.forEach(function(challenge) {
                var easyVariants = challenge.variants.filter(function(v) { return getVariantDifficulty(v, challenge) === 1; });
                if (easyVariants.length === 0) {
                    var mediumVariants = challenge.variants.filter(function(v) { return getVariantDifficulty(v, challenge) === 2; });
                    if (mediumVariants.length === 0) return;
                    var picked = pickVariantFromPool(mediumVariants, currentVariants[challenge.id]);
                    if (picked) result[challenge.id] = picked;
                    return;
                }
                var picked = pickVariantFromPool(easyVariants, currentVariants[challenge.id]);
                if (picked) result[challenge.id] = picked;
            });
        } else if (mode === 'hard') {
            filtered.forEach(function(challenge) {
                var hardVariants = challenge.variants.filter(function(v) {
                    var diff = getVariantDifficulty(v, challenge);
                    return diff === 3 || diff === 4;
                });
                if (hardVariants.length === 0) {
                    var mediumVariants = challenge.variants.filter(function(v) { return getVariantDifficulty(v, challenge) === 2; });
                    if (mediumVariants.length === 0) return;
                    var picked = pickVariantFromPool(mediumVariants, currentVariants[challenge.id]);
                    if (picked) result[challenge.id] = picked;
                    return;
                }
                var picked = pickVariantFromPool(hardVariants, currentVariants[challenge.id]);
                if (picked) result[challenge.id] = picked;
            });
        } else if (mode === 'mixed') {
            filtered.forEach(function(challenge) {
                var picked = pickVariantFromPool(challenge.variants, currentVariants[challenge.id]);
                if (picked) result[challenge.id] = picked;
            });
        } else if (mode === 'balanced') {
            var targetCount = filtered.length;
            var targetEasy = Math.round(targetCount * DIFFICULTY_TARGETS[1]);
            var targetMedium = Math.round(targetCount * DIFFICULTY_TARGETS[2]);
            var targetHard = targetCount - targetEasy - targetMedium;

            var easyCount = 0, mediumCount = 0, hardCount = 0;

            filtered.forEach(function(challenge) {
                var variantsByDifficulty = {
                    1: challenge.variants.filter(function(v) { return getVariantDifficulty(v, challenge) === 1; }),
                    2: challenge.variants.filter(function(v) { return getVariantDifficulty(v, challenge) === 2; }),
                    3: challenge.variants.filter(function(v) {
                        var diff = getVariantDifficulty(v, challenge);
                        return diff === 3 || diff === 4;
                    })
                };

                var targetDifficulty = 2;

                if (easyCount < targetEasy && variantsByDifficulty[1].length > 0) {
                    targetDifficulty = 1;
                    easyCount++;
                } else if (mediumCount < targetMedium && variantsByDifficulty[2].length > 0) {
                    targetDifficulty = 2;
                    mediumCount++;
                } else if (hardCount < targetHard && variantsByDifficulty[3].length > 0) {
                    targetDifficulty = 3;
                    hardCount++;
                } else {
                    var availableDifficulties = Object.keys(variantsByDifficulty)
                        .filter(function(d) { return variantsByDifficulty[d].length > 0; })
                        .map(Number);

                    if (availableDifficulties.length > 0) {
                        targetDifficulty = availableDifficulties[Math.floor(Math.random() * availableDifficulties.length)];
                        if (targetDifficulty === 1) easyCount++;
                        else if (targetDifficulty === 2) mediumCount++;
                        else hardCount++;
                    }
                }

                var pool = variantsByDifficulty[targetDifficulty];
                if (pool && pool.length > 0) {
                    var picked = pickVariantFromPool(pool, currentVariants[challenge.id]);
                    if (picked) result[challenge.id] = picked;
                } else {
                    var picked = pickVariantFromPool(challenge.variants, currentVariants[challenge.id]);
                    if (picked) result[challenge.id] = picked;
                }
            });
        } else if (mode === 'progressive') {
            filtered.forEach(function(challenge, idx) {
                var variantsByDifficulty = {
                    1: challenge.variants.filter(function(v) { return getVariantDifficulty(v, challenge) === 1; }),
                    2: challenge.variants.filter(function(v) { return getVariantDifficulty(v, challenge) === 2; }),
                    3: challenge.variants.filter(function(v) {
                        var diff = getVariantDifficulty(v, challenge);
                        return diff === 3 || diff === 4;
                    })
                };

                var progressPct = idx / filtered.length;
                var targetDifficulty;

                if (progressPct < 0.4) {
                    targetDifficulty = variantsByDifficulty[1].length > 0 ? 1 :
                                     variantsByDifficulty[2].length > 0 ? 2 : 3;
                } else if (progressPct < 0.7) {
                    targetDifficulty = variantsByDifficulty[2].length > 0 ? 2 :
                                     variantsByDifficulty[1].length > 0 ? 1 : 3;
                } else {
                    targetDifficulty = variantsByDifficulty[3].length > 0 ? 3 :
                                     variantsByDifficulty[2].length > 0 ? 2 : 1;
                }

                var pool = variantsByDifficulty[targetDifficulty];
                if (pool && pool.length > 0) {
                    var picked = pickVariantFromPool(pool, currentVariants[challenge.id]);
                    if (picked) result[challenge.id] = picked;
                } else {
                    var picked = pickVariantFromPool(challenge.variants, currentVariants[challenge.id]);
                    if (picked) result[challenge.id] = picked;
                }
            });
        }

        return result;
    }

    // -----------------------------------------------------------------------
    // Get Easier / Harder Variant (pure data)
    // -----------------------------------------------------------------------
    function getEasierVariant(challenge, currentVariant) {
        if (!challenge || !currentVariant) return null;

        var currentDiff = getVariantDifficulty(currentVariant, challenge);

        var targetDiff = currentDiff - 1;
        var easier = challenge.variants.filter(function(v) {
            return getVariantDifficulty(v, challenge) === targetDiff;
        });

        if (easier.length === 0 && targetDiff > 1) {
            targetDiff = currentDiff - 2;
            easier = challenge.variants.filter(function(v) {
                return getVariantDifficulty(v, challenge) === targetDiff;
            });
        }

        if (easier.length === 0) return null;
        return easier[Math.floor(Math.random() * easier.length)];
    }

    function getHarderVariant(challenge, currentVariant) {
        if (!challenge || !currentVariant) return null;

        var currentDiff = getVariantDifficulty(currentVariant, challenge);

        var targetDiff = currentDiff + 1;
        var harder = challenge.variants.filter(function(v) {
            return getVariantDifficulty(v, challenge) === targetDiff;
        });

        if (harder.length === 0 && targetDiff < 5) {
            targetDiff = currentDiff + 2;
            harder = challenge.variants.filter(function(v) {
                return getVariantDifficulty(v, challenge) === targetDiff;
            });
        }

        if (harder.length === 0) return null;
        return harder[Math.floor(Math.random() * harder.length)];
    }

    // -----------------------------------------------------------------------
    // Variant Difficulty Buttons (DOM init)
    // -----------------------------------------------------------------------
    function initVariantButtons(exerciseElement, opts) {
        var onEasier = opts && opts.onEasier;
        var onHarder = opts && opts.onHarder;

        var easierBtn = exerciseElement.querySelector('.easier-variant-btn:not([disabled])');
        if (easierBtn) {
            easierBtn.addEventListener('click', function() {
                var challengeId = this.getAttribute('data-challenge-id');
                if (onEasier) onEasier(challengeId);
            });
        }

        var harderBtn = exerciseElement.querySelector('.harder-variant-btn:not([disabled])');
        if (harderBtn) {
            harderBtn.addEventListener('click', function() {
                var challengeId = this.getAttribute('data-challenge-id');
                if (onHarder) onHarder(challengeId);
            });
        }
    }

    // -----------------------------------------------------------------------
    // Shuffle Button Visual Feedback
    // -----------------------------------------------------------------------
    function flashShuffleBtn(btnId) {
        var btn = document.getElementById(btnId);
        if (!btn) return;
        btn.innerHTML = Icons.check + ' Shuffled!';
        btn.classList.add('shuffle-btn--flash');
        setTimeout(function() {
            btn.innerHTML = Icons.dice + ' Shuffle';
            btn.classList.remove('shuffle-btn--flash');
        }, 800);
    }

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------
    window.ExerciseCore = {
        // Constants
        DIFFICULTY_TARGETS: DIFFICULTY_TARGETS,
        MODES: MODES,
        // Utilities
        escapeHtml: escapeHtml,
        getDifficultyStars: getDifficultyStars,
        getVariantDifficulty: getVariantDifficulty,
        getExerciseDifficulty: getExerciseDifficulty,
        // Timer
        initThinkingTimer: initThinkingTimer,
        // UI creators
        createDifficultySelector: createDifficultySelector,
        createShuffleBtn: createShuffleBtn,
        createConceptFilter: createConceptFilter,
        // Data extraction
        getUniqueConcepts: getUniqueConcepts,
        // Shuffle (pure)
        shuffleWarmups: shuffleWarmups,
        shuffleChallenges: shuffleChallenges,
        pickVariantFromPool: pickVariantFromPool,
        // Variant navigation (pure)
        getEasierVariant: getEasierVariant,
        getHarderVariant: getHarderVariant,
        // DOM init
        initVariantButtons: initVariantButtons,
        flashShuffleBtn: flashShuffleBtn
    };

})();
