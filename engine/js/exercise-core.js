/**
 * Exercise Core - Shared Exercise Systems
 *
 * Provides reusable exercise UI components and pure utility functions
 * used by course.js (module pages), algorithms.js (algorithm practice),
 * and daily-practice.js (cross-module review).
 *
 * Exposed as window.ExerciseCore
 */
(function() {
    'use strict';

    // -----------------------------------------------------------------------
    // CSS Injection (one-time via sentinel)
    // -----------------------------------------------------------------------
    function injectStyles() {
        if (document.getElementById('exercise-core-styles')) return;

        const style = document.createElement('style');
        style.id = 'exercise-core-styles';
        style.textContent = `
            .thinking-timer-btn {
                background: transparent;
                border: 2px solid #8b5cf6;
                color: #8b5cf6;
                padding: 0.5rem 1rem;
                border-radius: 8px;
                font-weight: 600;
                cursor: pointer;
                margin-bottom: 1rem;
                transition: all 0.2s;
            }
            .thinking-timer-btn:hover {
                background: #8b5cf6;
                color: white;
            }
            .thinking-timer {
                background: linear-gradient(135deg, #8b5cf6, #3b82f6);
                color: white;
                padding: 0.75rem 1rem;
                border-radius: 8px;
                margin-bottom: 1rem;
                font-weight: 600;
                display: flex;
                align-items: center;
                gap: 0.5rem;
                animation: pulse 2s ease-in-out infinite;
            }
            .thinking-timer .timer-icon {
                font-size: 1.2em;
            }
            .thinking-timer .timer-countdown {
                font-family: monospace;
                font-size: 1.1em;
                background: rgba(255,255,255,0.2);
                padding: 0.1rem 0.4rem;
                border-radius: 4px;
            }
            .thinking-timer.timer-done {
                background: #22c55e;
                animation: none;
            }
            @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.85; }
            }
            details.thinking-locked {
                opacity: 0.5;
                pointer-events: none;
            }
            details.thinking-locked summary {
                cursor: not-allowed;
            }
            details.thinking-locked summary::after {
                content: ' \uD83D\uDD12';
            }
            .concept-filter {
                margin-bottom: 1rem;
                padding: 1rem;
                background: var(--bg-card);
                border-radius: 8px;
                border: 1px solid var(--bg-lighter);
            }
            .concept-filter-label {
                font-size: 0.85rem;
                color: var(--text-dim);
                margin-bottom: 0.5rem;
                display: block;
            }
            .concept-filter-buttons {
                display: flex;
                flex-wrap: wrap;
                gap: 0.5rem;
            }
            .concept-btn {
                background: transparent;
                border: 1px solid var(--bg-lighter);
                color: var(--text);
                padding: 0.35rem 0.75rem;
                border-radius: 20px;
                font-size: 0.85rem;
                cursor: pointer;
                transition: all 0.2s;
            }
            .concept-btn:hover {
                border-color: var(--orange);
                color: var(--orange);
            }
            .concept-btn.active {
                background: var(--orange);
                border-color: var(--orange);
                color: white;
            }
            .difficulty-mode-selector {
                margin-bottom: 1rem;
                padding: 1rem;
                background: var(--bg-card);
                border-radius: 8px;
                border: 1px solid var(--bg-lighter);
            }
            .difficulty-mode-label {
                font-size: 0.85rem;
                color: var(--text-dim);
                margin-bottom: 0.5rem;
                display: block;
            }
            .difficulty-mode-buttons {
                display: flex;
                gap: 0.5rem;
                flex-wrap: wrap;
            }
            .difficulty-mode-btn {
                background: transparent;
                border: 2px solid var(--bg-lighter);
                color: var(--text);
                padding: 0.5rem 1rem;
                border-radius: 8px;
                font-size: 0.85rem;
                cursor: pointer;
                transition: all 0.2s;
                flex: 1;
                min-width: 120px;
            }
            .difficulty-mode-btn:hover {
                border-color: var(--orange);
                transform: translateY(-2px);
            }
            .difficulty-mode-btn.active {
                background: var(--orange);
                border-color: var(--orange);
                color: white;
                font-weight: 600;
            }
            .difficulty-mode-btn.easy.active {
                background: var(--green-bright);
                border-color: var(--green-bright);
                color: var(--bg-dark);
            }
            .difficulty-mode-btn.hard.active {
                background: var(--purple);
                border-color: var(--purple);
                color: white;
            }
            .difficulty-mode-btn .mode-desc {
                display: block;
                font-size: 0.7rem;
                opacity: 0.8;
                margin-top: 0.2rem;
            }
            .variant-difficulty {
                display: inline-block;
                font-size: 0.9rem;
                opacity: 0.8;
                margin-left: 0.5rem;
            }
            .variant-btn-container {
                display: flex;
                gap: 0.5rem;
                margin-bottom: 0.75rem;
                flex-wrap: wrap;
            }
            .easier-variant-btn, .harder-variant-btn {
                background: var(--bg-card);
                border: 2px solid var(--green-bright);
                color: var(--green-bright);
                padding: 0.4rem 0.8rem;
                border-radius: 6px;
                font-size: 0.8rem;
                cursor: pointer;
                transition: all 0.2s;
                font-weight: 500;
                display: inline-block;
            }
            .harder-variant-btn {
                border-color: var(--purple);
                color: var(--purple);
            }
            .easier-variant-btn:hover {
                background: var(--green-bright);
                color: var(--bg-dark);
                transform: translateY(-1px);
            }
            .harder-variant-btn:hover {
                background: var(--purple);
                color: white;
                transform: translateY(-1px);
            }
            .easier-variant-btn:disabled, .harder-variant-btn:disabled {
                opacity: 0.4;
                cursor: not-allowed;
                border-color: var(--text-dim);
                color: var(--text-dim);
            }
            .easier-variant-btn:disabled:hover, .harder-variant-btn:disabled:hover {
                background: var(--bg-card);
                color: var(--text-dim);
                transform: none;
            }
            .shuffle-info {
                background: var(--bg-lighter);
                padding: 0.5rem 0.75rem;
                border-radius: 6px;
                font-size: 0.8rem;
                color: var(--text-dim);
                margin-top: 0.5rem;
            }
            .personal-notes {
                margin-top: 0.5rem;
            }
            .personal-notes summary {
                cursor: pointer;
                color: var(--purple);
                font-weight: 600;
                padding: 0.5rem 0;
            }
            .personal-notes-textarea {
                width: 100%;
                min-height: 100px;
                margin-top: 0.5rem;
                padding: 0.75rem;
                background: var(--bg-lighter);
                border: 1px solid var(--bg-lighter);
                border-radius: 4px;
                color: var(--text);
                font-family: 'JetBrains Mono', monospace;
                font-size: 0.85rem;
                resize: vertical;
            }
            .personal-notes-textarea:focus {
                outline: none;
                border-color: var(--purple);
                background: var(--bg-card);
            }
            .personal-notes-hint {
                font-size: 0.75rem;
                color: var(--text-dim);
                margin-top: 0.25rem;
            }
        `;
        document.head.appendChild(style);
    }

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
        var stars = Math.min(Math.max(difficulty || 1, 1), 5);
        return '\u2B50'.repeat(stars);
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
        btn.innerHTML = '\uD83E\uDDE0 Start ' + seconds + 's thinking timer';
        container.insertBefore(btn, allDetails[0]);

        btn.addEventListener('click', function() {
            details.forEach(function(d) { d.classList.add('thinking-locked'); });

            var timerDiv = document.createElement('div');
            timerDiv.className = 'thinking-timer';
            timerDiv.innerHTML = '<span class="timer-icon">\uD83E\uDDE0</span> Think first: <span class="timer-countdown">' + seconds + '</span>s';
            btn.replaceWith(timerDiv);

            var remaining = seconds;
            var countdownSpan = timerDiv.querySelector('.timer-countdown');

            var interval = setInterval(function() {
                remaining--;
                countdownSpan.textContent = remaining;
                if (remaining <= 0) {
                    clearInterval(interval);
                    details.forEach(function(d) { d.classList.remove('thinking-locked'); });
                    timerDiv.innerHTML = '\u2705 Hints unlocked!';
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
            '<span class="difficulty-mode-label">\uD83C\uDF9A\uFE0F Difficulty Mode:</span>' +
            '<div class="difficulty-mode-buttons">' +
                '<button class="difficulty-mode-btn easy' + (currentMode === 'easy' ? ' active' : '') + '" data-mode="easy">' +
                    '<div>\u2B50 Easy</div><span class="mode-desc">Only easy variants</span></button>' +
                '<button class="difficulty-mode-btn' + (currentMode === 'mixed' ? ' active' : '') + '" data-mode="mixed">' +
                    '<div>\uD83C\uDFB2 Mixed</div><span class="mode-desc">Random mix</span></button>' +
                '<button class="difficulty-mode-btn' + (currentMode === 'balanced' ? ' active' : '') + '" data-mode="balanced">' +
                    '<div>\u2696\uFE0F Balanced</div><span class="mode-desc">35% easy, 40% med, 25% hard</span></button>' +
                '<button class="difficulty-mode-btn' + (currentMode === 'progressive' ? ' active' : '') + '" data-mode="progressive">' +
                    '<div>\uD83D\uDCC8 Progressive</div><span class="mode-desc">Easy \u2192 Medium \u2192 Hard</span></button>' +
                '<button class="difficulty-mode-btn hard' + (currentMode === 'hard' ? ' active' : '') + '" data-mode="hard">' +
                    '<div>\u2B50\u2B50\u2B50 Hard</div><span class="mode-desc">Only hard variants</span></button>' +
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

        var btn = document.createElement('button');
        if (id) btn.id = id;
        btn.textContent = '\uD83C\uDFB2 Shuffle';
        btn.style.cssText = 'background:var(--bg-card);color:var(--' + color + ');border:1px solid var(--' + color + ');padding:0.2rem 0.7rem;border-radius:4px;font-size:0.75rem;font-family:"JetBrains Mono",monospace;cursor:pointer;transition:all 0.2s;font-weight:400;';
        btn.addEventListener('mouseenter', function() {
            btn.style.background = 'var(--' + color + ')';
            btn.style.color = color === 'green-bright' ? 'var(--bg-dark)' : 'white';
        });
        btn.addEventListener('mouseleave', function() {
            btn.style.background = 'var(--bg-card)';
            btn.style.color = 'var(--' + color + ')';
        });
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
        var label = opts.label || '\uD83C\uDFAF Focus on a specific pattern:';
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
    function flashShuffleBtn(btnId, color) {
        var btn = document.getElementById(btnId);
        if (!btn) return;
        btn.textContent = '\u2713 Shuffled!';
        btn.style.background = 'var(--green-bright)';
        btn.style.color = 'var(--bg-dark)';
        if (color !== 'green-bright') btn.style.borderColor = 'var(--green-bright)';
        setTimeout(function() {
            btn.textContent = '\uD83C\uDFB2 Shuffle';
            btn.style.background = 'var(--bg-card)';
            btn.style.color = 'var(--' + color + ')';
            btn.style.borderColor = 'var(--' + color + ')';
        }, 800);
    }

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------
    window.ExerciseCore = {
        // CSS
        injectStyles: injectStyles,
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

    // Inject styles on load
    injectStyles();
})();
