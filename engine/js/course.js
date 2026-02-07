/**
 * Shared Exercise Rendering System for Go Course
 *
 * Expects these globals to be defined by module-specific data files:
 * - window.conceptLinks - object mapping concept names to lesson section IDs
 * - window.sharedContent - object with advanced exercise hints/pre-reading
 * - window.variantsDataEmbedded - object with all exercise variants
 *
 * Delegates shared logic to ExerciseCore (exercise-core.js).
 */
(function() {
    'use strict';

    var EC = window.ExerciseCore;
    function ER() { return window.ExerciseRenderer; }

    // Thinking timer configuration (seconds) - set to 0 to disable
    // Can be overridden per-page with: window.THINKING_TIME_SECONDS = 30;
    var THINKING_TIME_SECONDS = window.THINKING_TIME_SECONDS ?? 45;

    // State for tracking current variants
    var variantsData = null;
    var currentWarmupVariants = {};
    var currentChallengeVariants = {};
    var currentConceptFilter = null;
    var currentWarmupConceptFilter = null;
    var conceptFilterSelection = [];

    // Personal notes storage
    // Unified difficulty mode
    var difficultyMode = 'balanced';

    function getModuleNum() {
        return document.body?.dataset?.module ||
               window.location.pathname.match(/module(\d+)/)?.[1] || '1';
    }

    // --- Setup functions ---

    function setupDifficultyModeSelector() {
        if (document.getElementById('difficulty-mode-selector')) return;
        var container = document.getElementById('challenges-container');
        if (!container) return;

        var selectorDiv = EC.createDifficultySelector({
            currentMode: difficultyMode,
            onChange: function(mode) {
                difficultyMode = mode;
                shuffleChallenges();
            }
        });
        selectorDiv.id = 'difficulty-mode-selector';

        if (container.parentNode) {
            container.parentNode.insertBefore(selectorDiv, container);
        }
    }

    function setupShuffleWarmupsBtn() {
        if (document.getElementById('shuffle-warmups-btn')) return;
        var container = document.getElementById('warmups-container');
        if (!container || !variantsData || !variantsData.warmups || variantsData.warmups.length === 0) return;

        var header = document.createElement('h3');
        header.style.cssText = 'display:flex;align-items:center;gap:0.75rem;';
        header.textContent = '\uD83D\uDD25 Warmups';

        var btn = EC.createShuffleBtn({ id: 'shuffle-warmups-btn', color: 'green-bright', onClick: function() { shuffleWarmups(); } });
        header.appendChild(btn);
        container.parentNode.insertBefore(header, container);
    }

    function setupShuffleChallengesBtn() {
        if (document.getElementById('shuffle-challenges-btn')) return;
        var container = document.getElementById('challenges-container');
        if (!container || !variantsData || !variantsData.challenges || variantsData.challenges.length === 0) return;

        var btn = EC.createShuffleBtn({ id: 'shuffle-challenges-btn', color: 'orange', onClick: function() { shuffleChallenges(); } });

        var heading = document.getElementById('challenges');
        if (heading && heading.tagName === 'H3') {
            heading.style.display = 'flex';
            heading.style.alignItems = 'center';
            heading.style.gap = '0.75rem';
            heading.appendChild(btn);
        } else {
            container.parentNode.insertBefore(btn, container);
        }
    }

    function setupWarmupConceptFilter() {
        var container = document.getElementById('warmups-container');
        if (!container) return;
        if (document.getElementById('warmup-concept-filter')) return;

        var concepts = EC.getUniqueConcepts(variantsData.warmups);
        var filterDiv = EC.createConceptFilter({
            concepts: concepts,
            label: '\uD83C\uDFAF Focus on a specific concept:',
            allLabel: 'All Concepts',
            onChange: function(concept) {
                currentWarmupConceptFilter = concept;
                shuffleWarmups();
            }
        });
        if (!filterDiv) return;
        filterDiv.id = 'warmup-concept-filter';
        container.parentNode.insertBefore(filterDiv, container);
    }

    function setupConceptFilter() {
        var container = document.getElementById('challenges-container');
        if (!container) return;
        if (document.getElementById('concept-filter')) return;

        var concepts = EC.getUniqueConcepts(variantsData.challenges);
        var filterDiv = EC.createConceptFilter({
            concepts: concepts,
            label: '\uD83C\uDFAF Focus on a specific pattern:',
            allLabel: 'All Patterns',
            onChange: function(concept) {
                currentConceptFilter = concept;
                conceptFilterSelection = [];
                shuffleChallenges();
            }
        });
        if (!filterDiv) return;
        filterDiv.id = 'concept-filter';
        container.parentNode.insertBefore(filterDiv, container);
    }

    // --- Core shuffle operations ---

    function shuffleWarmups() {
        if (!variantsData || !variantsData.warmups) return;

        var result = EC.shuffleWarmups(variantsData.warmups, currentWarmupVariants, {
            conceptFilter: currentWarmupConceptFilter
        });
        Object.assign(currentWarmupVariants, result);
        renderWarmups();
        EC.flashShuffleBtn('shuffle-warmups-btn', 'green-bright');
    }

    function shuffleChallenges() {
        if (!variantsData || !variantsData.challenges) return;

        if (currentConceptFilter) {
            conceptFilterSelection = [];
        }

        var result = EC.shuffleChallenges(variantsData.challenges, currentChallengeVariants, {
            mode: difficultyMode,
            conceptFilter: currentConceptFilter
        });
        Object.assign(currentChallengeVariants, result);
        renderChallenges();
        EC.flashShuffleBtn('shuffle-challenges-btn', 'orange');
    }

    function handleEasierVariant(challengeId) {
        var challenge = variantsData.challenges.find(function(c) { return c.id === challengeId; });
        if (!challenge) return;
        var currentVariant = currentChallengeVariants[challengeId];
        if (!currentVariant) return;

        var easier = EC.getEasierVariant(challenge, currentVariant);
        if (!easier) return;

        currentChallengeVariants[challengeId] = easier;
        renderChallenges();

        setTimeout(function() {
            var exerciseDiv = document.querySelector('.exercise[data-challenge-id="' + challengeId + '"]');
            if (exerciseDiv) {
                exerciseDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
                exerciseDiv.style.transition = 'background 0.5s';
                exerciseDiv.style.background = 'var(--green-bright-dim, rgba(34, 197, 94, 0.1))';
                setTimeout(function() { exerciseDiv.style.background = ''; }, 800);
            }
        }, 100);
    }

    function handleHarderVariant(challengeId) {
        var challenge = variantsData.challenges.find(function(c) { return c.id === challengeId; });
        if (!challenge) return;
        var currentVariant = currentChallengeVariants[challengeId];
        if (!currentVariant) return;

        var harder = EC.getHarderVariant(challenge, currentVariant);
        if (!harder) return;

        currentChallengeVariants[challengeId] = harder;
        renderChallenges();

        setTimeout(function() {
            var exerciseDiv = document.querySelector('.exercise[data-challenge-id="' + challengeId + '"]');
            if (exerciseDiv) {
                exerciseDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
                exerciseDiv.style.transition = 'background 0.5s';
                exerciseDiv.style.background = 'var(--purple-dim, rgba(139, 92, 246, 0.15))';
                setTimeout(function() { exerciseDiv.style.background = ''; }, 800);
            }
        }, 100);
    }

    // --- Rendering ---

    function renderWarmups() {
        var container = document.getElementById('warmups-container');
        if (!container || !variantsData || !variantsData.warmups) return;

        var warmups = currentWarmupConceptFilter
            ? variantsData.warmups.filter(function(w) { return w.concept === currentWarmupConceptFilter; })
            : variantsData.warmups;

        var html = '';

        if (warmups.length === 0) {
            html = '<p style="color: var(--text-dim); text-align: center;">No warmups match this filter.</p>';
            container.innerHTML = html;
            return;
        }

        // When filtering by concept, show 5 random variants for practice
        if (currentWarmupConceptFilter) {
            var allVariants = [];
            warmups.forEach(function(warmup) {
                warmup.variants.forEach(function(variant) {
                    allVariants.push({ variant: variant, warmup: warmup });
                });
            });

            var shuffled = allVariants.sort(function() { return Math.random() - 0.5; });
            var selected = shuffled.slice(0, 5);

            html += '<p style="color: var(--green-bright); font-size: 0.9rem; margin: 0 0 1rem; font-weight: 600;">Practicing: ' + currentWarmupConceptFilter + ' (' + selected.length + ' of ' + allVariants.length + ' variants)</p>';

            selected.forEach(function(item, idx) {
                var conceptLink = window.conceptLinks[item.warmup.concept];
                var conceptHtml = conceptLink
                    ? '<a href="' + conceptLink + '" class="concept-link" style="color: var(--green-dim); opacity: 0.8;">(' + item.warmup.concept + ' \u2197)</a>'
                    : '<span style="font-size: 0.75rem; opacity: 0.6; color: var(--text-dim);">(' + item.warmup.concept + ')</span>';

                item.variant.warmupId = item.warmup.id;
                html += ER().renderExerciseCard({
                    num: idx + 1,
                    variant: item.variant,
                    challenge: null,
                    type: 'warmup',
                    exerciseKey: 'm' + getModuleNum() + '_' + item.warmup.id + '_' + item.variant.id,
                    conceptHtml: conceptHtml
                });
            });

            container.innerHTML = html;
            container.querySelectorAll('.exercise').forEach(function(ex) {
                EC.initThinkingTimer(ex, { seconds: THINKING_TIME_SECONDS });
                ER().initPersonalNotes(ex);
            });
            if (window.initExerciseProgress) window.initExerciseProgress();
            return;
        }

        // No filter active - show one variant per warmup
        warmups.forEach(function(warmup, idx) {
            var variant = currentWarmupVariants[warmup.id];

            var conceptLink = window.conceptLinks[warmup.concept];
            var conceptHtml = conceptLink
                ? '<a href="' + conceptLink + '" class="concept-link" style="color: var(--green-dim); opacity: 0.8;">(' + warmup.concept + ' \u2197)</a>'
                : '<span style="font-size: 0.75rem; opacity: 0.6; color: var(--text-dim);">(' + warmup.concept + ')</span>';

            variant.warmupId = warmup.id;
            html += ER().renderExerciseCard({
                num: idx + 1,
                variant: variant,
                challenge: null,
                type: 'warmup',
                exerciseKey: 'm' + getModuleNum() + '_' + warmup.id + '_' + variant.id,
                conceptHtml: conceptHtml
            });
        });

        container.innerHTML = html;
        container.querySelectorAll('.exercise').forEach(function(ex) {
            EC.initThinkingTimer(ex, { seconds: THINKING_TIME_SECONDS });
            ER().initPersonalNotes(ex);
        });
        if (window.initExerciseProgress) window.initExerciseProgress();
    }

    function renderSingleChallenge(num, variant, challenge, difficulty) {
        var variantDiff = EC.getVariantDifficulty(variant, challenge);

        // Build difficulty navigation buttons (module page only)
        var difficultyNav = '';
        var hasEasierVariants = challenge.variants.some(function(v) { return EC.getVariantDifficulty(v, challenge) < variantDiff; });
        var hasHarderVariants = challenge.variants.some(function(v) { return EC.getVariantDifficulty(v, challenge) > variantDiff; });

        if (hasEasierVariants || hasHarderVariants) {
            difficultyNav += '<div class="variant-btn-container">';

            if (hasEasierVariants) {
                difficultyNav += '<button class="easier-variant-btn" data-challenge-id="' + challenge.id + '">\uD83D\uDCC9 Get Easier Version</button>';
            } else if (variantDiff === 1) {
                difficultyNav += '<button class="easier-variant-btn" disabled title="This is already the easiest variant">\u2713 Already Easiest</button>';
            }

            if (hasHarderVariants) {
                difficultyNav += '<button class="harder-variant-btn" data-challenge-id="' + challenge.id + '">\uD83D\uDCC8 Get Harder Version</button>';
            } else if (variantDiff === 3) {
                difficultyNav += '<button class="harder-variant-btn" disabled title="This is already the hardest variant">\u2713 Already Hardest</button>';
            }

            difficultyNav += '</div>';
        }

        return ER().renderExerciseCard({
            num: num,
            variant: variant,
            challenge: challenge,
            type: 'challenge',
            exerciseKey: 'm' + getModuleNum() + '_' + challenge.id + '_' + variant.id,
            difficultyNav: difficultyNav
        });
    }

    function renderChallenges() {
        var container = document.getElementById('challenges-container');
        if (!container || !variantsData || !variantsData.challenges) return;

        var challenges = currentConceptFilter
            ? variantsData.challenges.filter(function(c) { return c.concept === currentConceptFilter; })
            : variantsData.challenges;

        var html = '';
        var currentBlock = 0;
        var blockNames = { 1: 'Core Patterns', 2: 'Building & Filtering', 3: 'Two-Pointer Foundation', 4: 'Two-Pointer Application' };

        if (challenges.length === 0) {
            html = '<p style="color: var(--text-dim); text-align: center;">No challenges match this filter.</p>';
            container.innerHTML = html;
            return;
        }

        // When filtering by concept, show 6 challenges with their current variants
        if (currentConceptFilter) {
            if (conceptFilterSelection.length === 0 ||
                !conceptFilterSelection.every(function(id) {
                    var challenge = challenges.find(function(c) { return c.id === id; });
                    return challenge && challenge.concept === currentConceptFilter;
                })) {
                var shuffledChallenges = challenges.slice().sort(function() { return Math.random() - 0.5; });
                conceptFilterSelection = shuffledChallenges.slice(0, Math.min(6, challenges.length)).map(function(c) { return c.id; });

                conceptFilterSelection.forEach(function(challengeId) {
                    var challenge = challenges.find(function(c) { return c.id === challengeId; });
                    if (challenge && !currentChallengeVariants[challengeId]) {
                        var randomVariant = challenge.variants[Math.floor(Math.random() * challenge.variants.length)];
                        currentChallengeVariants[challengeId] = randomVariant;
                    }
                });
            }

            var totalVariants = challenges.reduce(function(sum, c) { return sum + c.variants.length; }, 0);
            html += '<p style="color: var(--orange); font-size: 0.9rem; margin: 0 0 1rem; font-weight: 600;">Practicing: ' + currentConceptFilter + ' (' + conceptFilterSelection.length + ' of ' + totalVariants + ' variants)</p>';

            var firstChallenge = challenges[0];
            if (firstChallenge && firstChallenge.patternPrimer) {
                var pp = firstChallenge.patternPrimer;
                html += '<details style="border: 2px solid var(--orange); border-radius: 6px; padding: 1rem; margin-bottom: 1.5rem;">' +
                    '<summary style="color: var(--orange); font-weight: 600; cursor: pointer;">Pattern Primer: ' + currentConceptFilter + ' (brute force + best approach)</summary>' +
                    '<div class="hint-content" style="margin-top: 1rem;">' +
                        '<div style="margin-bottom: 0.75rem;"><strong>Brute force:</strong> ' + pp.bruteForce + '</div>' +
                        '<div style="margin-bottom: 0.75rem;"><strong>Best approach:</strong> ' + pp.bestApproach + '</div>' +
                        '<div><strong>Typical:</strong> ' + pp.typical + '</div>' +
                    '</div></details>';
            }

            conceptFilterSelection.forEach(function(challengeId, idx) {
                var challenge = challenges.find(function(c) { return c.id === challengeId; });
                if (challenge) {
                    var variant = currentChallengeVariants[challengeId];
                    if (variant) {
                        var difficultyNum = EC.getExerciseDifficulty(challenge);
                        var difficultyStars = EC.getDifficultyStars(difficultyNum);
                        html += renderSingleChallenge(idx + 1, variant, challenge, difficultyStars);
                    }
                }
            });

            container.innerHTML = html;
            container.querySelectorAll('.exercise').forEach(function(ex) {
                EC.initThinkingTimer(ex, { seconds: THINKING_TIME_SECONDS });
                EC.initVariantButtons(ex, { onEasier: handleEasierVariant, onHarder: handleHarderVariant });
            });
            if (window.initExerciseProgress) window.initExerciseProgress();
            return;
        }

        // Calculate distribution stats
        var counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
        challenges.forEach(function(challenge) {
            var variant = currentChallengeVariants[challenge.id];
            if (variant) {
                var diff = EC.getVariantDifficulty(variant, challenge);
                counts[diff] = (counts[diff] || 0) + 1;
            }
        });

        var total = Object.values(counts).reduce(function(a, b) { return a + b; }, 0);
        if (total > 0) {
            var infoText = '';
            if (difficultyMode === 'easy') {
                infoText = '\u2B50 Easy mode: ' + total + ' easy challenge' + (total !== 1 ? 's' : '');
            } else if (difficultyMode === 'hard') {
                var hardCount = counts[3] + counts[4];
                infoText = '\u2B50\u2B50\u2B50 Hard mode: ' + hardCount + ' hard challenge' + (hardCount !== 1 ? 's' : '');
            } else if (difficultyMode === 'balanced') {
                var hardCount = counts[3] + counts[4];
                infoText = '\u2696\uFE0F Distribution: \u2B50 ' + counts[1] + ' (' + Math.round(counts[1]/total*100) + '%) | \u2B50\u2B50 ' + counts[2] + ' (' + Math.round(counts[2]/total*100) + '%) | \u2B50\u2B50\u2B50 ' + hardCount + ' (' + Math.round(hardCount/total*100) + '%)';
            } else if (difficultyMode === 'progressive') {
                infoText = '\uD83D\uDCC8 Progressive: ' + total + ' challenges with increasing difficulty';
            } else {
                infoText = '\uD83C\uDFB2 Mixed: ' + total + ' random challenges';
            }

            if (infoText) {
                html += '<div class="shuffle-info">' + infoText + '</div>';
            }
        }

        var displayNum = 1;
        challenges.forEach(function(challenge) {
            var variant = currentChallengeVariants[challenge.id];
            if (!variant) return;

            var difficultyNum = EC.getExerciseDifficulty(challenge);
            var difficultyStars = EC.getDifficultyStars(difficultyNum);

            if (challenge.block !== currentBlock) {
                currentBlock = challenge.block;
                html += '<p style="color: var(--cyan); font-size: 0.85rem; margin: 1.5rem 0 0.5rem; font-weight: 600;">Block ' + currentBlock + ': ' + (blockNames[currentBlock] || '') + ' <span style="opacity: 0.7">' + difficultyStars + '</span></p>';
            }

            html += renderSingleChallenge(displayNum, variant, challenge, difficultyStars);
            displayNum++;
        });

        container.innerHTML = html;
        container.querySelectorAll('.exercise').forEach(function(ex) {
            EC.initThinkingTimer(ex, { seconds: THINKING_TIME_SECONDS });
            ER().initPersonalNotes(ex);
            EC.initVariantButtons(ex, { onEasier: handleEasierVariant, onHarder: handleHarderVariant });
        });
        if (window.initExerciseProgress) window.initExerciseProgress();
    }

    // --- Module data loading ---

    function loadVariants() {
        variantsData = window.variantsDataEmbedded;
        setupWarmupConceptFilter();
        setupShuffleWarmupsBtn();
        shuffleWarmups();
        setupConceptFilter();
        setupDifficultyModeSelector();
        setupShuffleChallengesBtn();
        shuffleChallenges();
    }

    function initWhenReady() {
        if (window.variantsDataEmbedded) {
            loadVariants();
        } else {
            window.addEventListener('moduleDataLoaded', loadVariants, { once: true });
        }
    }

    document.addEventListener('DOMContentLoaded', initWhenReady);

    // Style the shuffle buttons hover
    document.addEventListener('DOMContentLoaded', function() {
        var chalBtn = document.getElementById('shuffle-challenges-btn');
        if (chalBtn) {
            chalBtn.addEventListener('mouseenter', function() {
                chalBtn.style.background = 'var(--orange)';
                chalBtn.style.color = 'white';
            });
            chalBtn.addEventListener('mouseleave', function() {
                chalBtn.style.background = 'var(--bg-card)';
                chalBtn.style.color = 'var(--orange)';
            });
        }
    });

    // Expose functions globally for onclick handlers
    window.shuffleWarmups = shuffleWarmups;
    window.shuffleChallenges = shuffleChallenges;
})();
