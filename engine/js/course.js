/**
 * Shared Exercise Rendering System for Go Course
 * 
 * Expects these globals to be defined by module-specific data files:
 * - window.conceptLinks - object mapping concept names to lesson section IDs
 * - window.sharedContent - object with advanced exercise hints/pre-reading
 * - window.variantsDataEmbedded - object with all exercise variants
 */
(function() {
    'use strict';

    // Thinking timer configuration (seconds) - set to 0 to disable
    // Can be overridden per-page with: window.THINKING_TIME_SECONDS = 30;
    const THINKING_TIME_SECONDS = window.THINKING_TIME_SECONDS ?? 45;

    // Inject thinking timer CSS
    const timerStyles = document.createElement('style');
    timerStyles.textContent = `
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
            content: ' 🔒';
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
    document.head.appendChild(timerStyles);

    // State for tracking current variants
    let variantsData = null;
    const currentWarmupVariants = {};
    const currentChallengeVariants = {};
    let currentConceptFilter = null; // null = show all (for challenges)
    let currentWarmupConceptFilter = null; // null = show all (for warmups)
    let conceptFilterSelection = []; // Tracks which challenges are shown when concept filter is active

    // Personal notes storage
    const NOTES_STORAGE_KEY = window.CourseConfigHelper ? window.CourseConfigHelper.storageKey('personal-notes') : 'go-course-personal-notes';
    let saveNotesTimer = null;

    function getNotesKey(exerciseId, variantId) {
        return `${exerciseId}_${variantId}`;
    }

    function loadNote(exerciseId, variantId) {
        const allNotes = JSON.parse(localStorage.getItem(NOTES_STORAGE_KEY) || '{}');
        return allNotes[getNotesKey(exerciseId, variantId)] || '';
    }

    function saveNote(exerciseId, variantId, text) {
        const allNotes = JSON.parse(localStorage.getItem(NOTES_STORAGE_KEY) || '{}');
        const key = getNotesKey(exerciseId, variantId);

        if (text.trim() === '') {
            delete allNotes[key];
        } else {
            allNotes[key] = text;
        }

        localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(allNotes));
    }

    function renderPersonalNotes(exerciseId, variantId) {
        const savedNote = loadNote(exerciseId, variantId);
        const textareaId = `notes-${exerciseId}-${variantId}`;

        return `<details class="personal-notes">
            <summary>📝 Personal Notes</summary>
            <div class="hint-content">
                <textarea
                    class="personal-notes-textarea"
                    id="${textareaId}"
                    placeholder="Write your notes about this exercise...&#10;&#10;• What did you learn?&#10;• Edge cases to remember&#10;• Patterns you discovered"
                >${escapeHtml(savedNote)}</textarea>
                <div class="personal-notes-hint">Auto-saves to browser storage</div>
            </div>
        </details>`;
    }

    function initPersonalNotes(container) {
        container.querySelectorAll('.personal-notes-textarea').forEach(textarea => {
            const id = textarea.id;
            const match = id.match(/notes-(.+?)_(.+)/);
            if (!match) return;

            const [, exerciseId, variantId] = match;

            textarea.addEventListener('input', () => {
                // Debounce saves
                clearTimeout(saveNotesTimer);
                saveNotesTimer = setTimeout(() => {
                    saveNote(exerciseId, variantId, textarea.value);
                }, 500);
            });
        });
    }

    // Unified difficulty mode: 'mixed', 'balanced', 'progressive', 'easy', 'hard'
    let difficultyMode = 'balanced';
    const DIFFICULTY_TARGETS = {
        1: 0.35,  // 35% easy
        2: 0.40,  // 40% medium
        3: 0.25   // 25% hard
    };

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Convert difficulty number (1-5) to star string
    function getDifficultyStars(difficulty) {
        const stars = Math.min(Math.max(difficulty || 1, 1), 5);
        return '⭐'.repeat(stars);
    }

    // Get difficulty from exercise, with fallback to block number
    function getExerciseDifficulty(exercise) {
        return exercise.difficulty || exercise.block || 1;
    }

    // Get variant-specific difficulty (supports both variant.difficulty and fallback)
    function getVariantDifficulty(variant, challenge) {
        // First check if variant has its own difficulty
        if (variant && variant.difficulty) {
            return variant.difficulty;
        }
        // Fallback to challenge difficulty or block
        return challenge ? (challenge.difficulty || challenge.block || 2) : 2;
    }

    // Thinking timer - adds a button to start timer that locks hints/solutions (not docs)
    function initThinkingTimer(container) {
        if (THINKING_TIME_SECONDS <= 0) return;

        const allDetails = container.querySelectorAll('details');
        // Only lock hints and solutions, not documentation
        const details = Array.from(allDetails).filter(d => {
            const summary = d.querySelector('summary');
            return summary && !summary.textContent.includes('Documentation');
        });
        if (details.length === 0) return;

        // Add "Start Timer" button
        const btn = document.createElement('button');
        btn.className = 'thinking-timer-btn';
        btn.innerHTML = `🧠 Start ${THINKING_TIME_SECONDS}s thinking timer`;
        container.insertBefore(btn, allDetails[0]);

        btn.addEventListener('click', function() {
            // Lock hints/solutions (not docs)
            details.forEach(d => {
                d.classList.add('thinking-locked');
            });

            // Replace button with timer display
            const timerDiv = document.createElement('div');
            timerDiv.className = 'thinking-timer';
            timerDiv.innerHTML = `<span class="timer-icon">🧠</span> Think first: <span class="timer-countdown">${THINKING_TIME_SECONDS}</span>s`;
            btn.replaceWith(timerDiv);

            // Countdown
            let remaining = THINKING_TIME_SECONDS;
            const countdownSpan = timerDiv.querySelector('.timer-countdown');

            const interval = setInterval(() => {
                remaining--;
                countdownSpan.textContent = remaining;

                if (remaining <= 0) {
                    clearInterval(interval);
                    // Unlock hints/solutions
                    details.forEach(d => {
                        d.classList.remove('thinking-locked');
                    });
                    timerDiv.innerHTML = '✅ Hints unlocked!';
                    timerDiv.classList.add('timer-done');
                    setTimeout(() => timerDiv.remove(), 2000);
                }
            }, 1000);
        });
    }

    function setupDifficultyModeSelector() {
        // Check if selector already exists
        if (document.getElementById('difficulty-mode-selector')) return;

        const container = document.getElementById('challenges-container');
        if (!container) return;

        const selectorDiv = document.createElement('div');
        selectorDiv.id = 'difficulty-mode-selector';
        selectorDiv.className = 'difficulty-mode-selector';
        selectorDiv.innerHTML = `
            <span class="difficulty-mode-label">🎚️ Difficulty Mode:</span>
            <div class="difficulty-mode-buttons">
                <button class="difficulty-mode-btn easy" data-mode="easy">
                    <div>⭐ Easy</div>
                    <span class="mode-desc">Only easy variants</span>
                </button>
                <button class="difficulty-mode-btn" data-mode="mixed">
                    <div>🎲 Mixed</div>
                    <span class="mode-desc">Random mix</span>
                </button>
                <button class="difficulty-mode-btn active" data-mode="balanced">
                    <div>⚖️ Balanced</div>
                    <span class="mode-desc">35% easy, 40% med, 25% hard</span>
                </button>
                <button class="difficulty-mode-btn" data-mode="progressive">
                    <div>📈 Progressive</div>
                    <span class="mode-desc">Easy → Medium → Hard</span>
                </button>
                <button class="difficulty-mode-btn hard" data-mode="hard">
                    <div>⭐⭐⭐ Hard</div>
                    <span class="mode-desc">Only hard variants</span>
                </button>
            </div>
        `;

        // Insert before challenges container
        if (container.parentNode) {
            container.parentNode.insertBefore(selectorDiv, container);
        }

        // Add click handlers
        selectorDiv.querySelectorAll('.difficulty-mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                selectorDiv.querySelectorAll('.difficulty-mode-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                difficultyMode = btn.dataset.mode;
                shuffleChallenges();
            });
        });
    }

    function loadVariants() {
        variantsData = window.variantsDataEmbedded;
        setupWarmupConceptFilter();  // Setup warmup filter
        shuffleWarmups();
        // Setup filters in reverse order (they insert before container, so last becomes first)
        setupConceptFilter();        // Will be 2nd (pattern filter)
        setupDifficultyModeSelector();  // Will be 1st (difficulty mode)
        shuffleChallenges();
    }

    function getUniqueWarmupConcepts() {
        if (!variantsData || !variantsData.warmups) return [];
        const concepts = new Set();
        variantsData.warmups.forEach(w => {
            if (w.concept) concepts.add(w.concept);
        });
        return Array.from(concepts).sort();
    }

    function setupWarmupConceptFilter() {
        const container = document.getElementById('warmups-container');
        if (!container) return;

        // Check if filter already exists
        if (document.getElementById('warmup-concept-filter')) return;

        const concepts = getUniqueWarmupConcepts();
        if (concepts.length === 0) return;

        const filterDiv = document.createElement('div');
        filterDiv.id = 'warmup-concept-filter';
        filterDiv.className = 'concept-filter';
        filterDiv.innerHTML = `
            <span class="concept-filter-label">🎯 Focus on a specific concept:</span>
            <div class="concept-filter-buttons">
                <button class="concept-btn active" data-concept="">All Concepts</button>
                ${concepts.map(c => `<button class="concept-btn" data-concept="${c}">${c}</button>`).join('')}
            </div>
        `;

        container.parentNode.insertBefore(filterDiv, container);

        // Add click handlers
        filterDiv.querySelectorAll('.concept-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                filterDiv.querySelectorAll('.concept-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentWarmupConceptFilter = btn.dataset.concept || null;
                shuffleWarmups();
            });
        });
    }

    function shuffleWarmups() {
        if (!variantsData || !variantsData.warmups) return;

        // Filter warmups by concept if active
        const warmups = currentWarmupConceptFilter
            ? variantsData.warmups.filter(w => w.concept === currentWarmupConceptFilter)
            : variantsData.warmups;

        // Pick a random variant for each warmup
        warmups.forEach(warmup => {
            const current = currentWarmupVariants[warmup.id];
            const available = warmup.variants.filter(v => !current || v.id !== current.id);
            const pool = available.length > 0 ? available : warmup.variants;
            currentWarmupVariants[warmup.id] = pool[Math.floor(Math.random() * pool.length)];
        });

        renderWarmups();

        // Visual feedback
        const btn = document.getElementById('shuffle-warmups-btn');
        if (btn) {
            btn.textContent = '✓ Shuffled!';
            btn.style.background = 'var(--green-bright)';
            btn.style.color = 'var(--bg-dark)';
            setTimeout(() => {
                btn.textContent = '🎲 Shuffle';
                btn.style.background = 'var(--bg-card)';
                btn.style.color = 'var(--green-bright)';
            }, 800);
        }
    }

    function renderWarmups() {
        const container = document.getElementById('warmups-container');
        if (!container || !variantsData || !variantsData.warmups) return;

        // Filter warmups by concept if active
        const warmups = currentWarmupConceptFilter
            ? variantsData.warmups.filter(w => w.concept === currentWarmupConceptFilter)
            : variantsData.warmups;

        let html = '';

        if (warmups.length === 0) {
            html = '<p style="color: var(--text-dim); text-align: center;">No warmups match this filter.</p>';
            container.innerHTML = html;
            return;
        }

        // When filtering by concept, show 5 random variants for practice
        if (currentWarmupConceptFilter) {
            // Collect all variants from the filtered warmup(s)
            const allVariants = [];
            warmups.forEach(warmup => {
                warmup.variants.forEach(variant => {
                    allVariants.push({ variant, warmup });
                });
            });

            // Shuffle and pick 5
            const shuffled = allVariants.sort(() => Math.random() - 0.5);
            const selected = shuffled.slice(0, 5);

            html += `<p style="color: var(--green-bright); font-size: 0.9rem; margin: 0 0 1rem; font-weight: 600;">Practicing: ${currentWarmupConceptFilter} (${selected.length} of ${allVariants.length} variants)</p>`;

            selected.forEach((item, idx) => {
                const conceptLink = window.conceptLinks[item.warmup.concept];
                const conceptHtml = conceptLink
                    ? `<a href="${conceptLink}" class="concept-link" style="color: var(--green-dim); opacity: 0.8;">(${item.warmup.concept} ↗)</a>`
                    : `<span style="font-size: 0.75rem; opacity: 0.6; color: var(--text-dim);">(${item.warmup.concept})</span>`;

                const wKey = `m${getModuleNum()}_${item.warmup.id}_${item.variant.id}`;
                const wProgress = window.ExerciseProgress?.get(wKey);
                const wCompleted = wProgress?.status === 'completed' ? ' exercise-completed' : '';

                html += `<div class="exercise${wCompleted}" data-exercise-key="${wKey}">
                    <h4>Warmup ${idx + 1}: ${item.variant.title} ${conceptHtml}</h4>
                    <p>${item.variant.description}</p>`;

                // Add hints
                if (item.variant.hints) {
                    item.variant.hints.forEach((hint) => {
                        const title = typeof hint === 'object' ? hint.title : '💡 Hint';
                        const content = typeof hint === 'object' ? hint.content : hint;
                        html += `<details>
                            <summary>${title}</summary>
                            <div class="hint-content">${content}</div>
                        </details>`;
                    });
                }

                // Add solution
                html += `<details>
                    <summary>✅ Solution</summary>
                    <div class="hint-content"><pre>${escapeHtml(item.variant.solution)}</pre></div>
                </details>`;

                // Add personal notes
                html += renderPersonalNotes(item.warmup.id, item.variant.id);

                // Add expected output if available
                if (item.variant.expected) {
                    html += `<div class="expected">
                        <div class="expected-title">Expected Output</div>
                        <pre>${escapeHtml(item.variant.expected)}</pre>
                    </div>`;
                }

                html += '</div>';
            });

            container.innerHTML = html;
            container.querySelectorAll('.exercise').forEach(ex => {
                initThinkingTimer(ex);
                initPersonalNotes(ex);
            });
            if (window.initExerciseProgress) window.initExerciseProgress();
            return;
        }

        // No filter active - show one variant per warmup
        warmups.forEach((warmup, idx) => {
            const variant = currentWarmupVariants[warmup.id];
            const num = idx + 1;

            const conceptLink = window.conceptLinks[warmup.concept];
            const conceptHtml = conceptLink
                ? `<a href="${conceptLink}" class="concept-link" style="color: var(--green-dim); opacity: 0.8;">(${warmup.concept} ↗)</a>`
                : `<span style="font-size: 0.75rem; opacity: 0.6; color: var(--text-dim);">(${warmup.concept})</span>`;

            const wuKey = `m${getModuleNum()}_${warmup.id}_${variant.id}`;
            const wuProgress = window.ExerciseProgress?.get(wuKey);
            const wuCompleted = wuProgress?.status === 'completed' ? ' exercise-completed' : '';

            html += `<div class="exercise${wuCompleted}" data-exercise-key="${wuKey}">
                <h4>Warmup ${num}: ${variant.title} ${conceptHtml}</h4>
                <p>${variant.description}</p>`;

            // Add hints
            if (variant.hints) {
                variant.hints.forEach((hint) => {
                    // Support both old string format and new object format
                    const title = typeof hint === 'object' ? hint.title : '💡 Hint';
                    const content = typeof hint === 'object' ? hint.content : hint;
                    html += `<details>
                        <summary>${title}</summary>
                        <div class="hint-content">${content}</div>
                    </details>`;
                });
            }

            // Add solution
            html += `<details>
                <summary>✅ Solution</summary>
                <div class="hint-content"><pre>${escapeHtml(variant.solution)}</pre></div>
            </details>`;

            // Add personal notes
            html += renderPersonalNotes(warmup.id, variant.id);

            // Add expected output if available
            if (variant.expected) {
                html += `<div class="expected">
                    <div class="expected-title">Expected Output</div>
                    <pre>${escapeHtml(variant.expected)}</pre>
                </div>`;
            }

            html += '</div>';
        });

        container.innerHTML = html;
        container.querySelectorAll('.exercise').forEach(ex => {
            initThinkingTimer(ex);
            initPersonalNotes(ex);
        });
        if (window.initExerciseProgress) window.initExerciseProgress();
    }

    // Helper function to pick a variant while avoiding the current one
    function pickVariantFromPool(pool, currentVariant) {
        if (!pool || pool.length === 0) return null;

        // If there's only 1 variant, we have no choice but to return it
        if (pool.length === 1) return pool[0];

        // Try to pick a different variant from the current one
        const available = pool.filter(v => !currentVariant || v.id !== currentVariant.id);
        const finalPool = available.length > 0 ? available : pool;

        return finalPool[Math.floor(Math.random() * finalPool.length)];
    }

    function shuffleChallenges() {
        if (!variantsData || !variantsData.challenges) return;

        // Reset concept filter selection when shuffling (will pick new random challenges in concept filter mode)
        if (currentConceptFilter) {
            conceptFilterSelection = [];
        }

        // Filter challenges by concept if active
        const challenges = currentConceptFilter
            ? variantsData.challenges.filter(c => c.concept === currentConceptFilter)
            : variantsData.challenges;

        if (difficultyMode === 'easy') {
            // Easy mode: Only show easy variants
            challenges.forEach(challenge => {
                const easyVariants = challenge.variants.filter(v => getVariantDifficulty(v, challenge) === 1);
                if (easyVariants.length === 0) {
                    // No easy variants, try medium as fallback
                    const mediumVariants = challenge.variants.filter(v => getVariantDifficulty(v, challenge) === 2);
                    if (mediumVariants.length === 0) return;

                    const picked = pickVariantFromPool(mediumVariants, currentChallengeVariants[challenge.id]);
                    if (picked) currentChallengeVariants[challenge.id] = picked;
                    return;
                }
                const picked = pickVariantFromPool(easyVariants, currentChallengeVariants[challenge.id]);
                if (picked) currentChallengeVariants[challenge.id] = picked;
            });
        } else if (difficultyMode === 'hard') {
            // Hard mode: Show hard (3) and very hard (4) variants
            challenges.forEach(challenge => {
                const hardVariants = challenge.variants.filter(v => {
                    const diff = getVariantDifficulty(v, challenge);
                    return diff === 3 || diff === 4;
                });
                if (hardVariants.length === 0) {
                    // No hard variants, try medium as fallback
                    const mediumVariants = challenge.variants.filter(v => getVariantDifficulty(v, challenge) === 2);
                    if (mediumVariants.length === 0) return;

                    const picked = pickVariantFromPool(mediumVariants, currentChallengeVariants[challenge.id]);
                    if (picked) currentChallengeVariants[challenge.id] = picked;
                    return;
                }
                const picked = pickVariantFromPool(hardVariants, currentChallengeVariants[challenge.id]);
                if (picked) currentChallengeVariants[challenge.id] = picked;
            });
        } else if (difficultyMode === 'mixed') {
            // Original random shuffle
            challenges.forEach(challenge => {
                const picked = pickVariantFromPool(challenge.variants, currentChallengeVariants[challenge.id]);
                if (picked) currentChallengeVariants[challenge.id] = picked;
            });
        } else if (difficultyMode === 'balanced') {
            // Balanced shuffle - ensure difficulty distribution
            const targetCount = challenges.length;
            const targetEasy = Math.round(targetCount * DIFFICULTY_TARGETS[1]);
            const targetMedium = Math.round(targetCount * DIFFICULTY_TARGETS[2]);
            const targetHard = targetCount - targetEasy - targetMedium;

            let easyCount = 0;
            let mediumCount = 0;
            let hardCount = 0;

            challenges.forEach(challenge => {
                // Group variants by difficulty (combining 3 and 4 as "hard")
                const variantsByDifficulty = {
                    1: challenge.variants.filter(v => getVariantDifficulty(v, challenge) === 1),
                    2: challenge.variants.filter(v => getVariantDifficulty(v, challenge) === 2),
                    3: challenge.variants.filter(v => {
                        const diff = getVariantDifficulty(v, challenge);
                        return diff === 3 || diff === 4;
                    })
                };

                // Determine which difficulty to pick from based on targets
                let targetDifficulty = 2; // default to medium

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
                    // Targets met or no variants at target difficulty, pick from available
                    const availableDifficulties = Object.keys(variantsByDifficulty)
                        .filter(d => variantsByDifficulty[d].length > 0)
                        .map(Number);

                    if (availableDifficulties.length > 0) {
                        targetDifficulty = availableDifficulties[Math.floor(Math.random() * availableDifficulties.length)];
                        if (targetDifficulty === 1) easyCount++;
                        else if (targetDifficulty === 2) mediumCount++;
                        else hardCount++;
                    }
                }

                // Pick random variant of target difficulty, avoiding current one
                const pool = variantsByDifficulty[targetDifficulty];
                if (pool && pool.length > 0) {
                    const picked = pickVariantFromPool(pool, currentChallengeVariants[challenge.id]);
                    if (picked) currentChallengeVariants[challenge.id] = picked;
                } else {
                    // Fallback to any variant if no variants at target difficulty
                    const picked = pickVariantFromPool(challenge.variants, currentChallengeVariants[challenge.id]);
                    if (picked) currentChallengeVariants[challenge.id] = picked;
                }
            });
        } else if (difficultyMode === 'progressive') {
            // Progressive mode - sort by challenge order, pick easier variants first
            challenges.forEach((challenge, idx) => {
                const variantsByDifficulty = {
                    1: challenge.variants.filter(v => getVariantDifficulty(v, challenge) === 1),
                    2: challenge.variants.filter(v => getVariantDifficulty(v, challenge) === 2),
                    3: challenge.variants.filter(v => {
                        const diff = getVariantDifficulty(v, challenge);
                        return diff === 3 || diff === 4;
                    })
                };

                // Early challenges get easier variants
                const progressPct = idx / challenges.length;
                let targetDifficulty;

                if (progressPct < 0.4) {
                    // First 40% of challenges: prefer easy
                    targetDifficulty = variantsByDifficulty[1].length > 0 ? 1 :
                                     variantsByDifficulty[2].length > 0 ? 2 : 3;
                } else if (progressPct < 0.7) {
                    // Middle 30%: prefer medium
                    targetDifficulty = variantsByDifficulty[2].length > 0 ? 2 :
                                     variantsByDifficulty[1].length > 0 ? 1 : 3;
                } else {
                    // Last 30%: prefer hard
                    targetDifficulty = variantsByDifficulty[3].length > 0 ? 3 :
                                     variantsByDifficulty[2].length > 0 ? 2 : 1;
                }

                const pool = variantsByDifficulty[targetDifficulty];
                if (pool && pool.length > 0) {
                    const picked = pickVariantFromPool(pool, currentChallengeVariants[challenge.id]);
                    if (picked) currentChallengeVariants[challenge.id] = picked;
                } else {
                    const picked = pickVariantFromPool(challenge.variants, currentChallengeVariants[challenge.id]);
                    if (picked) currentChallengeVariants[challenge.id] = picked;
                }
            });
        }

        renderChallenges();

        // Visual feedback
        const btn = document.getElementById('shuffle-challenges-btn');
        if (btn) {
            btn.textContent = '✓ Shuffled!';
            btn.style.background = 'var(--green-bright)';
            btn.style.color = 'var(--bg-dark)';
            btn.style.borderColor = 'var(--green-bright)';
            setTimeout(() => {
                btn.textContent = '🎲 Shuffle Challenges';
                btn.style.background = 'var(--bg-card)';
                btn.style.color = 'var(--orange)';
                btn.style.borderColor = 'var(--orange)';
            }, 800);
        }
    }

    function getUniqueConcepts() {
        if (!variantsData || !variantsData.challenges) return [];
        const concepts = new Set();
        variantsData.challenges.forEach(c => {
            if (c.concept) concepts.add(c.concept);
        });
        return Array.from(concepts).sort();
    }

    function setupConceptFilter() {
        const container = document.getElementById('challenges-container');
        if (!container) return;

        // Check if filter already exists
        if (document.getElementById('concept-filter')) return;

        const concepts = getUniqueConcepts();
        if (concepts.length === 0) return;

        const filterDiv = document.createElement('div');
        filterDiv.id = 'concept-filter';
        filterDiv.className = 'concept-filter';
        filterDiv.innerHTML = `
            <span class="concept-filter-label">🎯 Focus on a specific pattern:</span>
            <div class="concept-filter-buttons">
                <button class="concept-btn active" data-concept="">All Patterns</button>
                ${concepts.map(c => `<button class="concept-btn" data-concept="${c}">${c}</button>`).join('')}
            </div>
        `;

        container.parentNode.insertBefore(filterDiv, container);

        // Add click handlers
        filterDiv.querySelectorAll('.concept-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                filterDiv.querySelectorAll('.concept-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentConceptFilter = btn.dataset.concept || null;
                conceptFilterSelection = []; // Reset selection when filter changes
                shuffleChallenges();
            });
        });
    }

    function getModuleNum() {
        return document.body?.dataset?.module ||
               window.location.pathname.match(/module(\d+)/)?.[1] || '1';
    }

    function renderSingleChallenge(num, variant, challenge, difficulty) {
        // Get variant-specific difficulty if available
        const variantDiff = getVariantDifficulty(variant, challenge);
        const variantStars = getDifficultyStars(variantDiff);

        const exerciseKey = `m${getModuleNum()}_${challenge.id}_${variant.id}`;
        const progress = window.ExerciseProgress?.get(exerciseKey);
        const completedClass = progress?.status === 'completed' ? ' exercise-completed' : '';

        let html = `<div class="exercise${completedClass}" data-challenge-id="${challenge.id}" data-exercise-key="${exerciseKey}">
            <h4>Challenge ${num}: ${variant.title}
                <span class="variant-difficulty" title="Variant difficulty: ${variantDiff} stars">${variantStars}</span>
            </h4>`;

        // Add difficulty navigation buttons
        const hasEasierVariants = challenge.variants.some(v =>
            getVariantDifficulty(v, challenge) < variantDiff
        );
        const hasHarderVariants = challenge.variants.some(v =>
            getVariantDifficulty(v, challenge) > variantDiff
        );

        if (hasEasierVariants || hasHarderVariants) {
            html += `<div class="variant-btn-container">`;

            if (hasEasierVariants) {
                html += `<button class="easier-variant-btn" data-challenge-id="${challenge.id}">
                    📉 Get Easier Version
                </button>`;
            } else if (variantDiff === 1) {
                html += `<button class="easier-variant-btn" disabled title="This is already the easiest variant">
                    ✓ Already Easiest
                </button>`;
            }

            if (hasHarderVariants) {
                html += `<button class="harder-variant-btn" data-challenge-id="${challenge.id}">
                    📈 Get Harder Version
                </button>`;
            } else if (variantDiff === 3) {
                html += `<button class="harder-variant-btn" disabled title="This is already the hardest variant">
                    ✓ Already Hardest
                </button>`;
            }

            html += `</div>`;
        }

        html += `<p>${variant.description}</p>`;

        // Add hints
        if (variant.hints) {
            variant.hints.forEach((hint) => {
                const title = typeof hint === 'object' ? hint.title : '💡 Hint';
                const content = typeof hint === 'object' ? hint.content : hint;
                html += `<details>
                    <summary>${title}</summary>
                    <div class="hint-content">${content}</div>
                </details>`;
            });
        }

        // Add solution
        html += `<details>
            <summary>✅ Solution</summary>
            <div class="hint-content"><pre>${escapeHtml(variant.solution)}</pre></div>
        </details>`;

        // Add personal notes
        html += renderPersonalNotes(challenge.id, variant.id);

        // Add documentation links if available
        if (challenge.docLinks && challenge.docLinks.length > 0) {
            html += `<details>
                <summary>📚 Documentation</summary>
                <div class="hint-content">
                    <p style="margin-bottom: 0.5rem; color: var(--text-dim);">Relevant Go docs:</p>
                    <ul style="margin: 0; padding-left: 1.5rem;">
                        ${challenge.docLinks.map(link =>
                            `<li><a href="${link.url}" target="_blank" rel="noopener" style="color: var(--cyan);">${link.title}</a>${link.note ? ` <span style="color: var(--text-dim);">— ${link.note}</span>` : ''}</li>`
                        ).join('\n                        ')}
                    </ul>
                </div>
            </details>`;
        }

        // Add expected output
        html += `<div class="expected">
            <div class="expected-title">Expected Output</div>
            <pre>${variant.testCases.map(tc =>
                `${tc.input} → ${tc.output}`
            ).join('\n')}</pre>
        </div></div>`;

        return html;
    }

    function renderChallenges() {
        const container = document.getElementById('challenges-container');
        if (!container || !variantsData || !variantsData.challenges) return;

        // Filter challenges by concept if a filter is active
        const challenges = currentConceptFilter
            ? variantsData.challenges.filter(c => c.concept === currentConceptFilter)
            : variantsData.challenges;

        let html = '';
        let currentBlock = 0;
        const blockNames = { 1: 'Core Patterns', 2: 'Building & Filtering', 3: 'Two-Pointer Foundation', 4: 'Two-Pointer Application' };

        if (challenges.length === 0) {
            html = '<p style="color: var(--text-dim); text-align: center;">No challenges match this filter.</p>';
            container.innerHTML = html;
            return;
        }

        // When filtering by concept, show 6 challenges with their current variants
        if (currentConceptFilter) {
            // If conceptFilterSelection is empty or doesn't match current filter, initialize it
            if (conceptFilterSelection.length === 0 ||
                !conceptFilterSelection.every(id => {
                    const challenge = challenges.find(c => c.id === id);
                    return challenge && challenge.concept === currentConceptFilter;
                })) {
                // Pick 6 random challenges from this concept
                const shuffledChallenges = [...challenges].sort(() => Math.random() - 0.5);
                conceptFilterSelection = shuffledChallenges.slice(0, Math.min(6, challenges.length)).map(c => c.id);

                // Initialize variants for selected challenges if not already set
                conceptFilterSelection.forEach(challengeId => {
                    const challenge = challenges.find(c => c.id === challengeId);
                    if (challenge && !currentChallengeVariants[challengeId]) {
                        const randomVariant = challenge.variants[Math.floor(Math.random() * challenge.variants.length)];
                        currentChallengeVariants[challengeId] = randomVariant;
                    }
                });
            }

            // Count total variants for display
            const totalVariants = challenges.reduce((sum, c) => sum + c.variants.length, 0);

            html += `<p style="color: var(--orange); font-size: 0.9rem; margin: 0 0 1rem; font-weight: 600;">Practicing: ${currentConceptFilter} (${conceptFilterSelection.length} of ${totalVariants} variants)</p>`;

            // Add pattern primer if available for this concept
            const firstChallenge = challenges[0];
            if (firstChallenge && firstChallenge.patternPrimer) {
                const pp = firstChallenge.patternPrimer;
                html += `<details style="border: 2px solid var(--orange); border-radius: 6px; padding: 1rem; margin-bottom: 1.5rem;">
                    <summary style="color: var(--orange); font-weight: 600; cursor: pointer;">Pattern Primer: ${currentConceptFilter} (brute force + best approach)</summary>
                    <div class="hint-content" style="margin-top: 1rem;">
                        <div style="margin-bottom: 0.75rem;">
                            <strong>Brute force:</strong> ${pp.bruteForce}
                        </div>
                        <div style="margin-bottom: 0.75rem;">
                            <strong>Best approach:</strong> ${pp.bestApproach}
                        </div>
                        <div>
                            <strong>Typical:</strong> ${pp.typical}
                        </div>
                    </div>
                </details>`;
            }

            // Render selected challenges using their current variants
            conceptFilterSelection.forEach((challengeId, idx) => {
                const challenge = challenges.find(c => c.id === challengeId);
                if (challenge) {
                    const variant = currentChallengeVariants[challengeId];
                    if (variant) {
                        const difficultyNum = getExerciseDifficulty(challenge);
                        const difficultyStars = getDifficultyStars(difficultyNum);
                        html += renderSingleChallenge(idx + 1, variant, challenge, difficultyStars);
                    }
                }
            });

            container.innerHTML = html;
            container.querySelectorAll('.exercise').forEach(ex => {
                initThinkingTimer(ex);
                initVariantDifficultyButtons(ex);
            });
            if (window.initExerciseProgress) window.initExerciseProgress();
            return;
        }

        // Calculate distribution stats
        const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
        challenges.forEach(challenge => {
            const variant = currentChallengeVariants[challenge.id];
            if (variant) {
                const diff = getVariantDifficulty(variant, challenge);
                counts[diff] = (counts[diff] || 0) + 1;
            }
        });

        const total = Object.values(counts).reduce((a, b) => a + b, 0);
        if (total > 0) {
            let infoText = '';
            if (difficultyMode === 'easy') {
                infoText = `⭐ Easy mode: ${total} easy challenge${total !== 1 ? 's' : ''}`;
            } else if (difficultyMode === 'hard') {
                const hardCount = counts[3] + counts[4];
                infoText = `⭐⭐⭐ Hard mode: ${hardCount} hard challenge${hardCount !== 1 ? 's' : ''}`;
            } else if (difficultyMode === 'balanced') {
                const hardCount = counts[3] + counts[4];
                infoText = `⚖️ Distribution: ⭐ ${counts[1]} (${Math.round(counts[1]/total*100)}%) | ⭐⭐ ${counts[2]} (${Math.round(counts[2]/total*100)}%) | ⭐⭐⭐ ${hardCount} (${Math.round(hardCount/total*100)}%)`;
            } else if (difficultyMode === 'progressive') {
                infoText = `📈 Progressive: ${total} challenges with increasing difficulty`;
            } else {
                infoText = `🎲 Mixed: ${total} random challenges`;
            }

            if (infoText) {
                html += `<div class="shuffle-info">${infoText}</div>`;
            }
        }

        let displayNum = 1;
        challenges.forEach((challenge, idx) => {
            const variant = currentChallengeVariants[challenge.id];

            // Skip if no variant was selected (due to difficulty filter)
            if (!variant) return;

            const difficultyNum = getExerciseDifficulty(challenge);
            const difficultyStars = getDifficultyStars(difficultyNum);

            // Add block header if new block
            if (challenge.block !== currentBlock) {
                currentBlock = challenge.block;
                html += `<p style="color: var(--cyan); font-size: 0.85rem; margin: 1.5rem 0 0.5rem; font-weight: 600;">Block ${currentBlock}: ${blockNames[currentBlock] || ''} <span style="opacity: 0.7">${difficultyStars}</span></p>`;
            }

            html += renderSingleChallenge(displayNum, variant, challenge, difficultyStars);
            displayNum++;
        });

        container.innerHTML = html;
        container.querySelectorAll('.exercise').forEach(ex => {
            initThinkingTimer(ex);
            initPersonalNotes(ex);
            initVariantDifficultyButtons(ex);
        });
        if (window.initExerciseProgress) window.initExerciseProgress();
    }

    function getEasierVariant(challengeId) {
        if (!variantsData || !variantsData.challenges) return;

        // Find the challenge
        const challenge = variantsData.challenges.find(c => c.id === challengeId);
        if (!challenge) return;

        // Get current variant and its difficulty
        const currentVariant = currentChallengeVariants[challengeId];
        if (!currentVariant) return;

        const currentDiff = getVariantDifficulty(currentVariant, challenge);

        // Step down one difficulty level at a time
        // Try currentDiff - 1 first, then currentDiff - 2 if needed
        let targetDiff = currentDiff - 1;
        let easierVariants = challenge.variants.filter(v =>
            getVariantDifficulty(v, challenge) === targetDiff
        );

        // If no variants at target difficulty, try one more level down
        if (easierVariants.length === 0 && targetDiff > 1) {
            targetDiff = currentDiff - 2;
            easierVariants = challenge.variants.filter(v =>
                getVariantDifficulty(v, challenge) === targetDiff
            );
        }

        if (easierVariants.length === 0) return;

        // Pick a random variant at the target difficulty
        const randomIndex = Math.floor(Math.random() * easierVariants.length);
        const newVariant = easierVariants[randomIndex];

        // Update the current variant
        currentChallengeVariants[challengeId] = newVariant;

        // Re-render challenges
        renderChallenges();

        // Visual feedback - scroll to the challenge and flash it
        setTimeout(() => {
            const exerciseDiv = document.querySelector(`.exercise[data-challenge-id="${challengeId}"]`);
            if (exerciseDiv) {
                exerciseDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
                exerciseDiv.style.transition = 'background 0.5s';
                exerciseDiv.style.background = 'var(--green-bright-dim, rgba(34, 197, 94, 0.1))';
                setTimeout(() => {
                    exerciseDiv.style.background = '';
                }, 800);
            }
        }, 100);
    }

    function getHarderVariant(challengeId) {
        if (!variantsData || !variantsData.challenges) return;

        // Find the challenge
        const challenge = variantsData.challenges.find(c => c.id === challengeId);
        if (!challenge) return;

        // Get current variant and its difficulty
        const currentVariant = currentChallengeVariants[challengeId];
        if (!currentVariant) return;

        const currentDiff = getVariantDifficulty(currentVariant, challenge);

        // Step up one difficulty level at a time
        // Try currentDiff + 1 first, then currentDiff + 2 if needed
        let targetDiff = currentDiff + 1;
        let harderVariants = challenge.variants.filter(v =>
            getVariantDifficulty(v, challenge) === targetDiff
        );

        // If no variants at target difficulty, try one more level up
        if (harderVariants.length === 0 && targetDiff < 5) {
            targetDiff = currentDiff + 2;
            harderVariants = challenge.variants.filter(v =>
                getVariantDifficulty(v, challenge) === targetDiff
            );
        }

        if (harderVariants.length === 0) return;

        // Pick a random variant at the target difficulty
        const randomIndex = Math.floor(Math.random() * harderVariants.length);
        const newVariant = harderVariants[randomIndex];

        // Update the current variant
        currentChallengeVariants[challengeId] = newVariant;

        // Re-render challenges
        renderChallenges();

        // Visual feedback - scroll to the challenge and flash it
        setTimeout(() => {
            const exerciseDiv = document.querySelector(`.exercise[data-challenge-id="${challengeId}"]`);
            if (exerciseDiv) {
                exerciseDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
                exerciseDiv.style.transition = 'background 0.5s';
                exerciseDiv.style.background = 'var(--purple-dim, rgba(139, 92, 246, 0.15))';
                setTimeout(() => {
                    exerciseDiv.style.background = '';
                }, 800);
            }
        }, 100);
    }

    function initVariantDifficultyButtons(exerciseElement) {
        // Initialize easier button
        const easierBtn = exerciseElement.querySelector('.easier-variant-btn:not([disabled])');
        if (easierBtn) {
            easierBtn.addEventListener('click', function() {
                const challengeId = this.getAttribute('data-challenge-id');
                getEasierVariant(challengeId);
            });
        }

        // Initialize harder button
        const harderBtn = exerciseElement.querySelector('.harder-variant-btn:not([disabled])');
        if (harderBtn) {
            harderBtn.addEventListener('click', function() {
                const challengeId = this.getAttribute('data-challenge-id');
                getHarderVariant(challengeId);
            });
        }
    }

    // Load variants when module data is ready
    // If data is already loaded (sync script), load immediately
    // Otherwise wait for the moduleDataLoaded event (async loader)
    function initWhenReady() {
        if (window.variantsDataEmbedded) {
            loadVariants();
        } else {
            window.addEventListener('moduleDataLoaded', loadVariants, { once: true });
        }
    }

    document.addEventListener('DOMContentLoaded', initWhenReady);

    // Style the shuffle buttons hover
    document.addEventListener('DOMContentLoaded', () => {
        const chalBtn = document.getElementById('shuffle-challenges-btn');
        if (chalBtn) {
            chalBtn.addEventListener('mouseenter', () => {
                chalBtn.style.background = 'var(--orange)';
                chalBtn.style.color = 'white';
            });
            chalBtn.addEventListener('mouseleave', () => {
                chalBtn.style.background = 'var(--bg-card)';
                chalBtn.style.color = 'var(--orange)';
            });
        }
    });

    // Expose functions globally for onclick handlers
    window.shuffleWarmups = shuffleWarmups;
    window.shuffleChallenges = shuffleChallenges;
})();