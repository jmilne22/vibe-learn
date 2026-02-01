/**
 * Daily Practice Page Logic
 *
 * Builds exercise queues from SRS data and renders exercises
 * from across multiple modules for focused review sessions.
 * Uses SessionEngine for session lifecycle.
 */
(function() {
    'use strict';

    var SE = window.SessionEngine;

    var MODULE_NAMES = (window.CourseConfigHelper && window.CourseConfigHelper.moduleNames) || {};
    var MODULES_WITHOUT_VARIANTS = new Set((window.CourseConfigHelper && window.CourseConfigHelper.modulesWithoutExercises) || [7, 8, 11, 13]);
    var MODULES_WITH_VARIANTS = (window.CourseConfigHelper && window.CourseConfigHelper.modulesWithExercises) || [1, 2, 3, 4, 5, 6, 9, 10, 12, 14, 15, 16, 17];

    var sessionConfig = { count: 10, mode: 'review', type: 'all', modules: 'all' };
    var session = null;

    // --- Initialization ---

    function init() {
        updateStats();
        setupConfigButtons();

        var bestMode = SE.preselectBestMode(isRenderableExercise);
        sessionConfig.mode = bestMode;
        var btn = document.querySelector('#dp-mode-options .session-option[data-mode="' + bestMode + '"]');
        if (btn) {
            SE.setActiveOption('dp-mode-options', 'session-option', btn);
        }
        updateModuleButtonStates();

        var urlConfig = parseUrlConfig();
        if (urlConfig) {
            if (urlConfig.mode) sessionConfig.mode = urlConfig.mode;
            if (urlConfig.count) sessionConfig.count = urlConfig.count;
            if (urlConfig.modules) sessionConfig.modules = urlConfig.modules;
            if (urlConfig.type) sessionConfig.type = urlConfig.type;
            if (urlConfig.autostart) {
                history.replaceState(null, '', window.location.pathname);
                doStartSession();
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

        var due = window.SRS.getDueExercises().filter(function(e) { return isRenderableExercise(e.key); });
        var weak = window.SRS.getWeakestExercises(10).filter(function(e) { return e.easeFactor < 2.0 && isRenderableExercise(e.key); });
        var all = window.SRS.getAll();
        var total = Object.keys(all).filter(isRenderableExercise).length;

        SE.setText('dp-due', due.length);
        SE.setText('dp-weak', weak.length);
        SE.setText('dp-total', total);
    }

    function isRenderableExercise(key) {
        if (key.startsWith('fc_')) return false;
        if (key.startsWith('algo_')) return true;
        var match = key.match(/^m(\d+)_/);
        if (!match) return false;
        return !MODULES_WITHOUT_VARIANTS.has(parseInt(match[1]));
    }

    function setupConfigButtons() {
        SE.setupOptionGroup('dp-count-options', 'session-option', sessionConfig, 'count', parseInt);

        // Mode buttons need extra logic: update module button states
        document.querySelectorAll('#dp-mode-options .session-option').forEach(function(btn) {
            btn.addEventListener('click', function() {
                SE.setActiveOption('dp-mode-options', 'session-option', btn);
                sessionConfig.mode = btn.dataset.mode;
                updateModuleButtonStates();
            });
        });

        SE.setupOptionGroup('dp-type-options', 'session-option', sessionConfig, 'type');

        // Module buttons: multi-select behavior
        document.querySelectorAll('#dp-module-options .session-option').forEach(function(btn) {
            btn.addEventListener('click', function() {
                if (btn.disabled) return;

                if (btn.dataset.module === 'all') {
                    document.querySelectorAll('#dp-module-options .session-option').forEach(function(b) { b.classList.remove('active'); });
                    btn.classList.add('active');
                    sessionConfig.modules = 'all';
                } else {
                    var allBtn = document.querySelector('#dp-module-options .session-option[data-module="all"]');
                    if (allBtn) allBtn.classList.remove('active');

                    btn.classList.toggle('active');

                    var activeModules = [];
                    document.querySelectorAll('#dp-module-options .session-option.active').forEach(function(b) {
                        if (b.dataset.module !== 'all') activeModules.push(parseInt(b.dataset.module));
                    });

                    if (activeModules.length === 0) {
                        if (allBtn) allBtn.classList.add('active');
                        sessionConfig.modules = 'all';
                    } else {
                        sessionConfig.modules = activeModules;
                    }
                }
            });
        });
    }

    function updateModuleButtonStates() {
        var isDiscover = sessionConfig.mode === 'discover';
        document.querySelectorAll('#dp-module-options .session-option').forEach(function(btn) {
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
        if (isDiscover) {
            var activeModules = [];
            document.querySelectorAll('#dp-module-options .session-option.active').forEach(function(b) {
                if (b.dataset.module !== 'all') activeModules.push(parseInt(b.dataset.module));
            });
            var allBtn = document.querySelector('#dp-module-options .session-option[data-module="all"]');
            if (activeModules.length === 0 && allBtn && !allBtn.classList.contains('active')) {
                allBtn.classList.add('active');
                sessionConfig.modules = 'all';
            }
        }
    }

    // --- Session Management ---

    function doStartSession() {
        if (sessionConfig.mode === 'discover') {
            startDiscoverSession();
            return;
        }

        var queue = buildQueue(sessionConfig.mode, sessionConfig.count);

        session = SE.createSession({
            ids: {
                config: 'dp-config',
                stats: 'dp-stats',
                session: 'dp-session',
                label: 'dp-session-label',
                bar: 'dp-session-bar',
                container: 'dp-exercise-container',
                complete: 'dp-complete',
                results: 'dp-results',
                hint: 'dp-start-hint'
            },
            itemLabel: 'Exercise',
            accentColor: 'orange',
            onRender: renderCurrentExercise,
            extraShowOnStart: ['dp-nav-standard'],
            onSessionStart: function() {
                document.body.classList.add('dp-in-session');
            }
        });
        session.queue = queue;

        if (!SE.startSession(session)) {
            var hintEl = document.getElementById('dp-start-hint');
            if (hintEl) {
                var modeLabel = sessionConfig.mode === 'review' ? 'due for review'
                    : sessionConfig.mode === 'weakest' ? 'weak enough'
                    : 'matching';
                hintEl.textContent = 'Not enough exercises ' + modeLabel + ' yet \u2014 try Discover mode, or complete and rate exercises in the course modules.';
                hintEl.style.display = '';
            }
            return;
        }

        // Show loading state while variant data loads
        var container = document.getElementById('dp-exercise-container');
        if (container) {
            container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-dim);">Loading...</div>';
        }

        // Preload variant data for queued modules
        var modulesToLoad = new Set();
        session.queue.forEach(function(item) {
            if (item.moduleNum !== null && !MODULES_WITHOUT_VARIANTS.has(item.moduleNum)) {
                modulesToLoad.add(item.moduleNum);
            }
        });

        var loadPromises = [];
        modulesToLoad.forEach(function(moduleNum) {
            if (!loadedModules.has(moduleNum)) {
                loadPromises.push(preloadModuleData(moduleNum));
            }
        });

        Promise.all(loadPromises).then(function() {
            renderCurrentExercise(session);
        });
    }

    function startDiscoverSession() {
        session = SE.createSession({
            ids: {
                config: 'dp-config',
                stats: 'dp-stats',
                session: 'dp-session',
                label: 'dp-session-label',
                bar: 'dp-session-bar',
                container: 'dp-exercise-container',
                complete: 'dp-complete',
                results: 'dp-results',
                hint: 'dp-start-hint'
            },
            itemLabel: 'Exercise',
            accentColor: 'orange',
            onRender: renderCurrentExercise,
            extraShowOnStart: ['dp-nav-standard'],
            onSessionStart: function() {
                document.body.classList.add('dp-in-session');
            }
        });
        // Set a placeholder queue so startSession succeeds
        session.queue = [{ key: '_placeholder' }];

        SE.startSession(session);

        var container = document.getElementById('dp-exercise-container');
        if (container) {
            container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-dim);">Loading exercise data...</div>';
        }

        var targetModules = sessionConfig.modules === 'all'
            ? MODULES_WITH_VARIANTS
            : MODULES_WITH_VARIANTS.filter(function(m) {
                return sessionConfig.modules.includes(m);
            });

        var loadPromises = targetModules.map(function(moduleNum) {
            return preloadModuleData(moduleNum);
        });

        Promise.all(loadPromises).then(function() {
            session.queue = buildDiscoverQueue(sessionConfig.count);
            session.index = 0;
            if (session.queue.length === 0) {
                SE.hide('dp-session');
                SE.show('dp-empty');
                return;
            }
            SE.renderSessionHeader(session);
            renderCurrentExercise(session);
        });
    }

    // --- Queue Building ---

    function matchesFilters(key) {
        if (key.startsWith('fc_')) return false;

        if (key.startsWith('algo_')) {
            if (sessionConfig.type === 'warmup') return false;
            return true;
        }

        var modMatch = key.match(/^m(\d+)_/);
        var moduleNum = modMatch ? parseInt(modMatch[1]) : null;

        if (moduleNum !== null && MODULES_WITHOUT_VARIANTS.has(moduleNum)) return false;

        if (sessionConfig.type !== 'all') {
            var isWarmup = key.includes('warmup');
            var isChallenge = key.includes('challenge');
            if (sessionConfig.type === 'warmup' && !isWarmup) return false;
            if (sessionConfig.type === 'challenge' && !isChallenge) return false;
        }

        if (sessionConfig.modules !== 'all') {
            if (moduleNum === null || !sessionConfig.modules.includes(moduleNum)) return false;
        }

        return true;
    }

    function buildQueue(mode, count) {
        var candidates = SE.buildSRSQueue(mode, count, matchesFilters);

        if ((mode === 'review' || mode === 'weakest') && candidates.length < 5) {
            return [];
        }

        // Pad with random tracked exercises if needed
        if (candidates.length < count && window.SRS) {
            var all = window.SRS.getAll();
            var existing = {};
            candidates.forEach(function(c) { existing[c.key] = true; });
            var extras = Object.keys(all)
                .filter(function(key) { return !existing[key] && matchesFilters(key); })
                .map(function(key) { var item = all[key]; item.key = key; return item; })
                .sort(function() { return Math.random() - 0.5; });
            candidates = candidates.concat(extras);
        }

        return candidates.slice(0, count).map(function(item) {
            var match = item.key.match(/^(?:fc_)?m(\d+)_/);
            var moduleNum = match ? parseInt(match[1]) : null;
            return {
                key: item.key,
                moduleNum: moduleNum,
                moduleName: MODULE_NAMES[moduleNum] || ('Module ' + moduleNum),
                srsData: item
            };
        });
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

            if (variants.warmups && (sessionConfig.type === 'all' || sessionConfig.type === 'warmup')) {
                variants.warmups.forEach(function(warmup) {
                    if (!warmup.variants) return;
                    warmup.variants.forEach(function(variant) {
                        var key = 'm' + moduleNum + '_' + warmup.id + '_' + variant.id;
                        allItems.push({
                            key: key, moduleNum: moduleNum, moduleName: moduleName,
                            type: 'warmup', challenge: null, variant: variant,
                            inSRS: !!srsData[key]
                        });
                    });
                });
            }

            if (variants.challenges && (sessionConfig.type === 'all' || sessionConfig.type === 'challenge')) {
                variants.challenges.forEach(function(challenge) {
                    if (!challenge.variants) return;
                    challenge.variants.forEach(function(variant) {
                        var key = 'm' + moduleNum + '_' + challenge.id + '_' + variant.id;
                        allItems.push({
                            key: key, moduleNum: moduleNum, moduleName: moduleName,
                            type: 'challenge', challenge: challenge, variant: variant,
                            inSRS: !!srsData[key]
                        });
                    });
                });
            }
        });

        // Include algorithm exercises
        if (window.AlgorithmData && window.AlgorithmData.categories && (sessionConfig.type === 'all' || sessionConfig.type === 'challenge')) {
            window.AlgorithmData.categories.forEach(function(cat) {
                if (!cat.problems) return;
                cat.problems.forEach(function(problem) {
                    if (!problem.variants) return;
                    problem.variants.forEach(function(variant) {
                        var key = 'algo_' + cat.id + '_' + problem.id + '_' + variant.id;
                        allItems.push({
                            key: key, moduleNum: null, moduleName: cat.name,
                            type: 'challenge',
                            challenge: {
                                id: problem.id, concept: problem.concept,
                                difficulty: problem.difficulty, docLinks: problem.docLinks,
                                variants: problem.variants
                            },
                            variant: variant, inSRS: !!srsData[key]
                        });
                    });
                });
            });
        }

        var unseen = allItems.filter(function(item) { return !item.inSRS; });
        var seen = allItems.filter(function(item) { return item.inSRS; });

        SE.shuffle(unseen);
        SE.shuffle(seen);

        return unseen.concat(seen).slice(0, count);
    }

    // --- Exercise Rendering ---

    function renderCurrentExercise(sess) {
        var item = sess.queue[sess.index];
        if (!item) return;

        var moduleEl = document.getElementById('dp-session-module');
        if (moduleEl) {
            moduleEl.textContent = item.moduleNum ? 'Module ' + item.moduleNum + ': ' + item.moduleName : (item.moduleName || '');
        }

        var container = document.getElementById('dp-exercise-container');
        if (!container) return;

        // Discover items carry their variant data directly
        if (item.variant) {
            var html = window.ExerciseRenderer ? window.ExerciseRenderer.renderExerciseCard({
                num: 1,
                variant: item.variant,
                challenge: item.challenge,
                type: item.type,
                exerciseKey: item.key,
                moduleLabel: 'M' + item.moduleNum
            }) : null;
            if (html) {
                container.innerHTML = html;
                if (window.initExerciseProgress) window.initExerciseProgress();
                container.querySelectorAll('.exercise').forEach(function(ex) {
                    if (window.ExerciseRenderer) {
                        window.ExerciseRenderer.initPersonalNotes(ex);
                    }
                });
                return;
            }
        }

        // Standard path: render from key lookup
        var exerciseHtml = renderFromKey(item);
        if (exerciseHtml) {
            container.innerHTML = exerciseHtml;
            if (window.initExerciseProgress) window.initExerciseProgress();
            container.querySelectorAll('.exercise').forEach(function(ex) {
                if (window.ExerciseRenderer) {
                    window.ExerciseRenderer.initPersonalNotes(ex);
                }
            });
        } else {
            container.innerHTML =
                '<div class="exercise" style="text-align: center; padding: 2rem;">' +
                    '<h4 style="margin-bottom: 0.5rem;">Module ' + item.moduleNum + ': ' + item.moduleName + '</h4>' +
                    '<p style="color: var(--text-dim); margin-bottom: 1.25rem;">This exercise is available in the module page.</p>' +
                    '<a href="module' + item.moduleNum + '.html" class="session-next-btn" style="text-decoration: none; display: inline-block;">' +
                        'Open Module ' + item.moduleNum + ' &rarr;' +
                    '</a>' +
                '</div>';
        }
    }

    function renderFromKey(item) {
        var key = item.key;

        if (key.startsWith('algo_')) {
            return renderAlgoExercise(key, item);
        }

        var registry = window.moduleDataRegistry;
        if (!registry || !registry[item.moduleNum]) {
            loadModuleData(item.moduleNum);
            return null;
        }

        var moduleData = registry[item.moduleNum];
        var variants = moduleData.variants;
        if (!variants) return null;

        var keyParts = key.replace('m' + item.moduleNum + '_', '');

        if (variants.warmups) {
            for (var wi = 0; wi < variants.warmups.length; wi++) {
                var warmup = variants.warmups[wi];
                for (var wvi = 0; wvi < warmup.variants.length; wvi++) {
                    var wv = warmup.variants[wvi];
                    if (keyParts === warmup.id + '_' + wv.id) {
                        return window.ExerciseRenderer ? window.ExerciseRenderer.renderExerciseCard({
                            num: 1, variant: wv, challenge: null, type: 'warmup',
                            exerciseKey: key, moduleLabel: 'M' + item.moduleNum
                        }) : null;
                    }
                }
            }
        }

        if (variants.challenges) {
            for (var ci = 0; ci < variants.challenges.length; ci++) {
                var challenge = variants.challenges[ci];
                for (var cvi = 0; cvi < challenge.variants.length; cvi++) {
                    var cv = challenge.variants[cvi];
                    if (keyParts === challenge.id + '_' + cv.id) {
                        return window.ExerciseRenderer ? window.ExerciseRenderer.renderExerciseCard({
                            num: 1, variant: cv, challenge: challenge, type: 'challenge',
                            exerciseKey: key, moduleLabel: 'M' + item.moduleNum
                        }) : null;
                    }
                }
            }
        }

        return null;
    }

    function renderAlgoExercise(key, item) {
        var algoData = window.AlgorithmData;
        if (!algoData || !algoData.categories) return null;

        for (var ci = 0; ci < algoData.categories.length; ci++) {
            var cat = algoData.categories[ci];
            if (!key.startsWith('algo_' + cat.id + '_')) continue;
            if (!cat.problems) continue;

            var remainder = key.replace('algo_' + cat.id + '_', '');
            for (var pi = 0; pi < cat.problems.length; pi++) {
                var problem = cat.problems[pi];
                if (!remainder.startsWith(problem.id + '_')) continue;
                var vId = remainder.replace(problem.id + '_', '');
                if (!problem.variants) continue;

                for (var vi = 0; vi < problem.variants.length; vi++) {
                    var variant = problem.variants[vi];
                    if (variant.id === vId) {
                        return window.ExerciseRenderer ? window.ExerciseRenderer.renderExerciseCard({
                            num: 1, variant: variant,
                            challenge: {
                                id: problem.id, concept: problem.concept,
                                difficulty: problem.difficulty, docLinks: problem.docLinks,
                                variants: problem.variants
                            },
                            type: 'challenge', exerciseKey: key, moduleLabel: cat.name
                        }) : null;
                    }
                }
            }
        }
        return null;
    }

    // --- Module Data Loading ---

    var loadedModules = new Set();

    function preloadModuleData(moduleNum) {
        if (loadedModules.has(moduleNum)) return Promise.resolve();
        loadedModules.add(moduleNum);

        return new Promise(function(resolve) {
            var script = document.createElement('script');
            script.src = 'data/module' + moduleNum + '-variants.js';
            script.onload = resolve;
            script.onerror = resolve;
            document.head.appendChild(script);
        });
    }

    function loadModuleData(moduleNum) {
        if (loadedModules.has(moduleNum)) return;
        preloadModuleData(moduleNum);
    }

    // --- Public API ---

    window.startSession = doStartSession;
    window.nextExercise = function() { if (session) SE.nextExercise(session); };
    window.skipExercise = function() { if (session) SE.skipExercise(session); };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
