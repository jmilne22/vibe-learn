/**
 * Daily Practice Page Logic
 *
 * Builds exercise queues from SRS data and renders exercises
 * from across multiple modules for focused review sessions.
 */
(function() {
    'use strict';

    // Module names for display
    var MODULE_NAMES = (window.CourseConfigHelper && window.CourseConfigHelper.moduleNames) || {};

    // Modules that have no variant data files — exercises from these can never render
    var MODULES_WITHOUT_VARIANTS = new Set((window.CourseConfigHelper && window.CourseConfigHelper.modulesWithoutExercises) || [7, 8, 11, 13]);

    // Modules that DO have variant data — used by Discover mode
    var MODULES_WITH_VARIANTS = (window.CourseConfigHelper && window.CourseConfigHelper.modulesWithExercises) || [1, 2, 3, 4, 5, 6, 9, 10, 12, 14, 15, 16, 17];

    let sessionConfig = { count: 10, mode: 'review', type: 'all', modules: 'all' };
    let sessionQueue = [];
    let sessionIndex = 0;
    let sessionResults = { completed: 0, skipped: 0, ratings: { 1: 0, 2: 0, 3: 0 } };

    // --- Initialization ---

    function init() {
        updateStats();
        setupConfigButtons();
        preselectBestMode();

        // URL param autostart (#1)
        var urlConfig = parseUrlConfig();
        if (urlConfig) {
            if (urlConfig.mode) sessionConfig.mode = urlConfig.mode;
            if (urlConfig.count) sessionConfig.count = urlConfig.count;
            if (urlConfig.modules) sessionConfig.modules = urlConfig.modules;
            if (urlConfig.type) sessionConfig.type = urlConfig.type;
            if (urlConfig.autostart) {
                history.replaceState(null, '', window.location.pathname);
                startSession();
            }
        }

    }

    function parseUrlConfig() {
        var params = new URLSearchParams(window.location.search);
        if (!params.has('mode') && !params.has('autostart')) return null;

        var cfg = {};
        if (params.get('mode')) cfg.mode = params.get('mode');
        if (params.get('count')) cfg.count = parseInt(params.get('count'), 10);
        if (params.get('modules')) {
            var mods = params.get('modules').split(',').map(function(s) { return parseInt(s.trim(), 10); });
            cfg.modules = mods;
        }
        if (params.get('type')) cfg.type = params.get('type');
        if (params.has('autostart')) cfg.autostart = true;
        return cfg;
    }

    function updateStats() {
        if (!window.SRS) return;

        const due = window.SRS.getDueExercises().filter(e => isRenderableExercise(e.key));
        const weak = window.SRS.getWeakestExercises(10).filter(e => e.easeFactor < 2.0 && isRenderableExercise(e.key));
        const all = window.SRS.getAll();
        const total = Object.keys(all).filter(isRenderableExercise).length;

        setText('dp-due', due.length);
        setText('dp-weak', weak.length);
        setText('dp-total', total);
    }

    /** Check whether a key can actually render as an exercise (not a flashcard, not a variant-less module) */
    function isRenderableExercise(key) {
        if (key.startsWith('fc_')) return false;
        const match = key.match(/^m(\d+)_/);
        if (!match) return false;
        return !MODULES_WITHOUT_VARIANTS.has(parseInt(match[1]));
    }

    /** Pre-select the best mode based on current SRS state */
    function preselectBestMode() {
        if (!window.SRS) return;

        var due = window.SRS.getDueExercises().filter(function(e) { return isRenderableExercise(e.key); });
        var weak = window.SRS.getWeakestExercises(10).filter(function(e) { return e.easeFactor < 2.0 && isRenderableExercise(e.key); });

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

        sessionConfig.mode = bestMode;
        var btn = document.querySelector('#dp-mode-options .dp-option[data-mode="' + bestMode + '"]');
        if (btn) {
            setActiveOption('dp-mode-options', btn);
        }
        updateModuleButtonStates();
    }

    function setupConfigButtons() {
        document.querySelectorAll('#dp-count-options .dp-option').forEach(btn => {
            btn.addEventListener('click', () => {
                setActiveOption('dp-count-options', btn);
                sessionConfig.count = parseInt(btn.dataset.count);
            });
        });

        document.querySelectorAll('#dp-mode-options .dp-option').forEach(btn => {
            btn.addEventListener('click', () => {
                setActiveOption('dp-mode-options', btn);
                sessionConfig.mode = btn.dataset.mode;
                updateModuleButtonStates();
            });
        });

        document.querySelectorAll('#dp-type-options .dp-option').forEach(btn => {
            btn.addEventListener('click', () => {
                setActiveOption('dp-type-options', btn);
                sessionConfig.type = btn.dataset.type;
            });
        });

        document.querySelectorAll('#dp-module-options .dp-option').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.disabled) return;

                // Module filter supports multi-select: clicking "All" resets, clicking a module toggles it
                if (btn.dataset.module === 'all') {
                    // Reset to all
                    document.querySelectorAll('#dp-module-options .dp-option').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    sessionConfig.modules = 'all';
                } else {
                    // Remove "All" active state
                    const allBtn = document.querySelector('#dp-module-options .dp-option[data-module="all"]');
                    if (allBtn) allBtn.classList.remove('active');

                    // Toggle this module
                    btn.classList.toggle('active');

                    // Collect active modules
                    const activeModules = [];
                    document.querySelectorAll('#dp-module-options .dp-option.active').forEach(b => {
                        if (b.dataset.module !== 'all') activeModules.push(parseInt(b.dataset.module));
                    });

                    if (activeModules.length === 0) {
                        // Nothing selected — revert to all
                        if (allBtn) allBtn.classList.add('active');
                        sessionConfig.modules = 'all';
                    } else {
                        sessionConfig.modules = activeModules;
                    }
                }
            });
        });
    }

    /** Disable module buttons that have no variant data when Discover mode is selected */
    function updateModuleButtonStates() {
        var isDiscover = sessionConfig.mode === 'discover';
        document.querySelectorAll('#dp-module-options .dp-option').forEach(function(btn) {
            var mod = btn.dataset.module;
            if (mod === 'all') return;
            var modNum = parseInt(mod);
            if (MODULES_WITHOUT_VARIANTS.has(modNum)) {
                btn.disabled = isDiscover;
                btn.title = isDiscover ? 'No exercises available for this module' : '';
                if (isDiscover && btn.classList.contains('active')) {
                    btn.classList.remove('active');
                }
            } else {
                btn.disabled = false;
                btn.title = '';
            }
        });
        // If discover deselected some modules, check if we need to reset to All
        if (isDiscover) {
            var activeModules = [];
            document.querySelectorAll('#dp-module-options .dp-option.active').forEach(function(b) {
                if (b.dataset.module !== 'all') activeModules.push(parseInt(b.dataset.module));
            });
            var allBtn = document.querySelector('#dp-module-options .dp-option[data-module="all"]');
            if (activeModules.length === 0 && allBtn && !allBtn.classList.contains('active')) {
                allBtn.classList.add('active');
                sessionConfig.modules = 'all';
            }
        }
    }

    // --- Session Management ---

    window.startSession = function() {
        if (sessionConfig.mode === 'discover') {
            startDiscoverSession();
            return;
        }

        sessionQueue = buildQueue(sessionConfig.mode, sessionConfig.count);

        if (sessionQueue.length === 0) {
            var hintEl = document.getElementById('dp-start-hint');
            if (hintEl) {
                var modeLabel = sessionConfig.mode === 'review' ? 'due for review'
                    : sessionConfig.mode === 'weakest' ? 'weak enough'
                    : 'matching';
                hintEl.textContent = 'Not enough exercises ' + modeLabel + ' yet — try Discover mode, or complete and rate exercises in the course modules.';
                hintEl.style.display = '';
            }
            return;
        }

        // Clear any previous hint
        var hintEl = document.getElementById('dp-start-hint');
        if (hintEl) hintEl.style.display = 'none';

        sessionIndex = 0;
        sessionResults = { completed: 0, skipped: 0, ratings: { 1: 0, 2: 0, 3: 0 } };

        hide('dp-config');
        hide('dp-stats');
        show('dp-session');
        show('dp-nav-standard');


        // Show loading state while variant data loads
        const container = document.getElementById('dp-exercise-container');
        if (container) {
            container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-dim);">Loading...</div>';
        }

        // Collect unique module numbers that need variant data
        const modulesToLoad = new Set();
        sessionQueue.forEach(item => {
            if (item.moduleNum !== null && !MODULES_WITHOUT_VARIANTS.has(item.moduleNum)) {
                modulesToLoad.add(item.moduleNum);
            }
        });

        // Preload all variant scripts in parallel
        const loadPromises = [];
        modulesToLoad.forEach(moduleNum => {
            if (!loadedModules.has(moduleNum)) {
                loadPromises.push(preloadModuleData(moduleNum));
            }
        });

        Promise.all(loadPromises).then(function() {
            renderCurrentExercise();
        });
    };

    function startDiscoverSession() {
        sessionIndex = 0;
        sessionResults = { completed: 0, skipped: 0, ratings: { 1: 0, 2: 0, 3: 0 } };

        hide('dp-config');
        hide('dp-stats');
        show('dp-session');
        show('dp-nav-standard');


        var container = document.getElementById('dp-exercise-container');
        if (container) {
            container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-dim);">Loading exercise data...</div>';
        }

        // Determine which modules to load
        var targetModules = sessionConfig.modules === 'all'
            ? MODULES_WITH_VARIANTS
            : MODULES_WITH_VARIANTS.filter(function(m) {
                return sessionConfig.modules.includes(m);
            });

        // Preload ALL target module data
        var loadPromises = targetModules.map(function(moduleNum) {
            return preloadModuleData(moduleNum);
        });

        Promise.all(loadPromises).then(function() {
            sessionQueue = buildDiscoverQueue(sessionConfig.count);
            if (sessionQueue.length === 0) {
                hide('dp-session');
                show('dp-empty');
                return;
            }
            renderCurrentExercise();
        });
    }

    window.nextExercise = function() {
        sessionResults.completed++;
        advance();
    };

    window.skipExercise = function() {
        sessionResults.skipped++;
        advance();
    };


    function advance() {
        sessionIndex++;
        if (sessionIndex >= sessionQueue.length) {
            finishSession();
        } else {
            renderCurrentExercise();
        }
    }

    function finishSession() {
        hide('dp-session');
        show('dp-complete');

        const resultsEl = document.getElementById('dp-results');
        if (!resultsEl) return;

        const progress = window.ExerciseProgress?.loadAll() || {};
        let gotIt = 0, struggled = 0, peeked = 0;
        sessionQueue.forEach(item => {
            const p = progress[item.key];
            if (p?.selfRating === 1) gotIt++;
            else if (p?.selfRating === 2) struggled++;
            else if (p?.selfRating === 3) peeked++;
        });

        resultsEl.innerHTML = `
            <div class="dp-stat">
                <div class="dp-stat-value" style="color: var(--green-bright);">${sessionResults.completed}</div>
                <div class="dp-stat-label">Completed</div>
            </div>
            <div class="dp-stat">
                <div class="dp-stat-value" style="color: var(--text-dim);">${sessionResults.skipped}</div>
                <div class="dp-stat-label">Skipped</div>
            </div>
            <div class="dp-stat">
                <div class="dp-stat-value" style="color: var(--green-bright);">${gotIt}</div>
                <div class="dp-stat-label">Got It</div>
            </div>
            <div class="dp-stat">
                <div class="dp-stat-value" style="color: var(--orange);">${struggled}</div>
                <div class="dp-stat-label">Struggled</div>
            </div>
            <div class="dp-stat">
                <div class="dp-stat-value" style="color: var(--purple);">${peeked}</div>
                <div class="dp-stat-label">Had to Peek</div>
            </div>`;
    }

    // --- Queue Building ---

    function shuffle(arr) {
        for (var i = arr.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = arr[i];
            arr[i] = arr[j];
            arr[j] = tmp;
        }
        return arr;
    }

    function buildDiscoverQueue(count) {
        var registry = window.moduleDataRegistry;
        if (!registry) return [];

        var targetModules = sessionConfig.modules === 'all'
            ? MODULES_WITH_VARIANTS
            : MODULES_WITH_VARIANTS.filter(function(m) {
                return sessionConfig.modules.includes(m);
            });

        var srsData = window.SRS ? window.SRS.getAll() : {};
        var allItems = [];

        targetModules.forEach(function(moduleNum) {
            var moduleData = registry[moduleNum];
            if (!moduleData || !moduleData.variants) return;

            var variants = moduleData.variants;
            var moduleName = MODULE_NAMES[moduleNum] || ('Module ' + moduleNum);

            // Collect warmups
            if (variants.warmups && (sessionConfig.type === 'all' || sessionConfig.type === 'warmup')) {
                variants.warmups.forEach(function(warmup) {
                    if (!warmup.variants) return;
                    warmup.variants.forEach(function(variant) {
                        var key = 'm' + moduleNum + '_' + warmup.id + '_' + variant.id;
                        allItems.push({
                            key: key,
                            moduleNum: moduleNum,
                            moduleName: moduleName,
                            type: 'warmup',
                            challenge: null,
                            variant: variant,
                            inSRS: !!srsData[key]
                        });
                    });
                });
            }

            // Collect challenges
            if (variants.challenges && (sessionConfig.type === 'all' || sessionConfig.type === 'challenge')) {
                variants.challenges.forEach(function(challenge) {
                    if (!challenge.variants) return;
                    challenge.variants.forEach(function(variant) {
                        var key = 'm' + moduleNum + '_' + challenge.id + '_' + variant.id;
                        allItems.push({
                            key: key,
                            moduleNum: moduleNum,
                            moduleName: moduleName,
                            type: 'challenge',
                            challenge: challenge,
                            variant: variant,
                            inSRS: !!srsData[key]
                        });
                    });
                });
            }
        });

        // Split into unseen and seen
        var unseen = allItems.filter(function(item) { return !item.inSRS; });
        var seen = allItems.filter(function(item) { return item.inSRS; });

        // Shuffle both pools, prioritize unseen
        shuffle(unseen);
        shuffle(seen);

        var queue = unseen.concat(seen).slice(0, count);
        return queue;
    }

    function matchesFilters(key) {
        const cfg = sessionConfig;

        // Flashcard keys (fc_m1_0 etc.) aren't exercises — never include them
        if (key.startsWith('fc_')) return false;

        // Extract module number
        const modMatch = key.match(/^m(\d+)_/);
        const moduleNum = modMatch ? parseInt(modMatch[1]) : null;

        // Skip modules that have no variant data files
        if (moduleNum !== null && MODULES_WITHOUT_VARIANTS.has(moduleNum)) return false;

        // Type filter
        if (cfg.type !== 'all') {
            const isWarmup = key.includes('warmup');
            const isChallenge = key.includes('challenge');
            if (cfg.type === 'warmup' && !isWarmup) return false;
            if (cfg.type === 'challenge' && !isChallenge) return false;
        }

        // Module filter
        if (cfg.modules !== 'all') {
            if (moduleNum === null || !cfg.modules.includes(moduleNum)) return false;
        }

        return true;
    }

    function buildQueue(mode, count) {
        if (!window.SRS) return [];

        let candidates = [];

        if (mode === 'review') {
            candidates = window.SRS.getDueExercises();
        } else if (mode === 'weakest') {
            candidates = window.SRS.getWeakestExercises(count * 2);
        } else if (mode === 'mixed') {
            const due = window.SRS.getDueExercises();
            const weak = window.SRS.getWeakestExercises(count);
            // Interleave: due first, then weak, deduplicated
            const seen = new Set();
            candidates = [];
            [...due, ...weak].forEach(item => {
                if (!seen.has(item.key)) {
                    seen.add(item.key);
                    candidates.push(item);
                }
            });
        }

        // Apply type and module filters
        candidates = candidates.filter(item => matchesFilters(item.key));

        // Review and weakest need a minimum pool to be meaningful —
        // below 5 exercises the mode doesn't have enough signal
        if ((mode === 'review' || mode === 'weakest') && candidates.length < 5) {
            return [];
        }

        // Pad with random tracked exercises to fill the requested count
        if (candidates.length < count) {
            const all = window.SRS.getAll();
            const existing = new Set(candidates.map(c => c.key));
            const extras = Object.entries(all)
                .filter(([key]) => !existing.has(key) && matchesFilters(key))
                .map(([key, item]) => ({ key, ...item }))
                .sort(() => Math.random() - 0.5);
            candidates.push(...extras);
        }

        // Limit to requested count and resolve to renderable items
        return candidates.slice(0, count).map(item => {
            const match = item.key.match(/^(?:fc_)?m(\d+)_/);
            const moduleNum = match ? parseInt(match[1]) : null;
            return {
                key: item.key,
                moduleNum,
                moduleName: MODULE_NAMES[moduleNum] || `Module ${moduleNum}`,
                srsData: item
            };
        });
    }

    // --- Exercise Rendering ---

    function renderCurrentExercise() {
        const item = sessionQueue[sessionIndex];
        if (!item) return;

        // Update header
        const labelEl = document.getElementById('dp-session-label');
        if (labelEl) {
            labelEl.innerHTML = `Exercise <strong>${sessionIndex + 1}</strong> of <strong>${sessionQueue.length}</strong>`;
        }

        const moduleEl = document.getElementById('dp-session-module');
        if (moduleEl) {
            moduleEl.textContent = `Module ${item.moduleNum}: ${item.moduleName}`;
        }

        // Update progress bar
        const barEl = document.getElementById('dp-session-bar');
        if (barEl) {
            barEl.style.width = `${(sessionIndex / sessionQueue.length) * 100}%`;
        }

        const container = document.getElementById('dp-exercise-container');
        if (!container) return;

        // Discover items carry their variant data directly
        if (item.variant) {
            const html = window.ExerciseRenderer?.renderExerciseCard({
                num: 1,
                variant: item.variant,
                challenge: item.challenge,
                type: item.type,
                exerciseKey: item.key,
                moduleLabel: `M${item.moduleNum}`
            });
            if (html) {
                container.innerHTML = html;
                if (window.initExerciseProgress) window.initExerciseProgress();
                container.querySelectorAll('.exercise').forEach(ex => {
                    if (window.ExerciseRenderer) {
                        window.ExerciseRenderer.initPersonalNotes(ex);
                    }
                });
                return;
            }
        }

        // Standard path: render from key lookup
        const exerciseHtml = renderFromKey(item);
        if (exerciseHtml) {
            container.innerHTML = exerciseHtml;
            // Initialize progress tracking and notes
            if (window.initExerciseProgress) window.initExerciseProgress();
            container.querySelectorAll('.exercise').forEach(ex => {
                if (window.ExerciseRenderer) {
                    window.ExerciseRenderer.initPersonalNotes(ex);
                }
            });
        } else {
            // Fallback: exercise lives in the module page
            container.innerHTML = `
                <div class="exercise" style="text-align: center; padding: 2rem;">
                    <h4 style="margin-bottom: 0.5rem;">Module ${item.moduleNum}: ${item.moduleName}</h4>
                    <p style="color: var(--text-dim); margin-bottom: 1.25rem;">This exercise is available in the module page.</p>
                    <a href="module${item.moduleNum}.html" class="dp-next-btn" style="text-decoration: none; display: inline-block;">
                        Open Module ${item.moduleNum} &rarr;
                    </a>
                </div>`;
        }
    }

    function renderFromKey(item) {
        const key = item.key;
        // Parse the key to find the exercise
        // Format: m{moduleNum}_{exerciseId}_{variantId}  (variant system)
        //    or:  m{moduleNum}_{type}_{num}               (static exercises)

        // Check if we have variant data loaded in the registry
        const registry = window.moduleDataRegistry;
        if (!registry || !registry[item.moduleNum]) {
            // Try to load dynamically
            loadModuleData(item.moduleNum);
            return null; // Will render fallback
        }

        const moduleData = registry[item.moduleNum];
        const variants = moduleData.variants;
        if (!variants) return null;

        // Try to find the exercise in warmups or challenges
        const keyParts = key.replace(`m${item.moduleNum}_`, '');

        // Search warmups
        if (variants.warmups) {
            for (const warmup of variants.warmups) {
                for (const variant of warmup.variants) {
                    const testKey = `${warmup.id}_${variant.id}`;
                    if (keyParts === testKey) {
                        return window.ExerciseRenderer?.renderExerciseCard({
                            num: 1,
                            variant,
                            challenge: null,
                            type: 'warmup',
                            exerciseKey: key,
                            moduleLabel: `M${item.moduleNum}`
                        }) || null;
                    }
                }
            }
        }

        // Search challenges
        if (variants.challenges) {
            for (const challenge of variants.challenges) {
                for (const variant of challenge.variants) {
                    const testKey = `${challenge.id}_${variant.id}`;
                    if (keyParts === testKey) {
                        return window.ExerciseRenderer?.renderExerciseCard({
                            num: 1,
                            variant,
                            challenge,
                            type: 'challenge',
                            exerciseKey: key,
                            moduleLabel: `M${item.moduleNum}`
                        }) || null;
                    }
                }
            }
        }

        return null;
    }

    // Dynamically load a module's variant data
    const loadedModules = new Set();

    /** Preload a module's variant data, returning a Promise that resolves when done */
    function preloadModuleData(moduleNum) {
        if (loadedModules.has(moduleNum)) return Promise.resolve();
        loadedModules.add(moduleNum);

        return new Promise(function(resolve) {
            const script = document.createElement('script');
            script.src = `data/module${moduleNum}-variants.js`;
            script.onload = resolve;
            script.onerror = resolve; // resolve anyway — fallback will show for this module
            document.head.appendChild(script);
        });
    }

    /** Legacy sync loader — used by renderFromKey as a last resort */
    function loadModuleData(moduleNum) {
        if (loadedModules.has(moduleNum)) return;
        preloadModuleData(moduleNum);
    }

    // --- Helpers ---

    function setText(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    function show(id) {
        const el = document.getElementById(id);
        if (el) el.hidden = false;
    }

    function hide(id) {
        const el = document.getElementById(id);
        if (el) el.hidden = true;
    }

    function setActiveOption(containerId, activeBtn) {
        document.querySelectorAll(`#${containerId} .dp-option`).forEach(b => b.classList.remove('active'));
        activeBtn.classList.add('active');
    }

    // Init on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
