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
    var isApp = !!window.vibeApp;

    var MODULE_NAMES = (window.CourseConfigHelper && window.CourseConfigHelper.moduleNames) || {};
    var MODULES_WITHOUT_VARIANTS = new Set((window.CourseConfigHelper && window.CourseConfigHelper.modulesWithoutExercises) || [7, 8, 11, 13]);
    var MODULES_WITH_VARIANTS = (window.CourseConfigHelper && window.CourseConfigHelper.modulesWithExercises) || [1, 2, 3, 4, 5, 6, 9, 10, 12, 14, 15, 16, 17];

    var sessionConfig = { count: 10, mode: 'review', type: 'all', modules: 'all' };
    var session = null;

    // --- Initialization ---

    function renderContinueLinks() {
        var el = document.getElementById('dp-continue');
        if (!el) return;
        var plan = null;
        try { plan = JSON.parse(sessionStorage.getItem('vibe-learn:session-plan') || 'null'); } catch (e) {}
        if (!plan) return;
        var html = '';
        if (plan.gate && plan.gate.modules && plan.gate.modules.length) {
            var worst = plan.gate.modules[0];
            html += '<span class="session-continue-link" style="color:var(--text-tertiary)"><span class="segment-dot" style="background:var(--red)"></span>' +
                'New material locked — Module ' + worst.moduleNum + ' recall ' + Math.round(worst.recall * 100) + '%, unlocks at 70%</span>';
        } else if (plan.learn) {
            html += '<a class="session-continue-link" href="' + plan.learn.href + '"><span class="segment-dot" style="background:var(--cyan)"></span>Learn — ' + SE.escapeHtml(plan.learn.label) + '</a>';
        }
        if (plan.build) {
            html += '<a class="session-continue-link" href="' + plan.build.href + '"><span class="segment-dot" style="background:var(--green-bright)"></span>Build — ' + SE.escapeHtml(plan.build.label) + '</a>';
        }
        if (html) el.innerHTML = '<div class="session-continue-label">Next in today’s session</div>' + html;
    }

    function init() {
        updateStats();
        setupConfigButtons();
        renderContinueLinks();
        if (window.VibeBridge) window.VibeBridge.startPolling();

        var bestMode = SE.preselectBestMode(isRenderableExercise);
        sessionConfig.mode = bestMode;
        var btn = document.querySelector('#dp-mode-options .session-option[data-mode="' + bestMode + '"]');
        if (btn) {
            SE.setActiveOption('dp-mode-options', 'session-option', btn);
        }
        updateModuleButtonStates();

        var urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('today')) {
            history.replaceState(null, '', window.location.pathname);
            doStartTodaySession();
            return;
        }

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
        SE.updateStats({ due: 'dp-due', weak: 'dp-weak', total: 'dp-total' }, isRenderableExercise);
    }

    function isRenderableExercise(key) {
        if (key.startsWith('fc_')) return false;
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

    function startWithQueue(queue, opts) {
        opts = opts || {};
        // Disable start button while loading
        var startBtn = document.getElementById('dp-start');
        if (startBtn) { startBtn.disabled = true; startBtn.textContent = 'Loading\u2026'; }

        // Preload variant data BEFORE starting session to avoid race condition
        var modulesToLoad = new Set();
        queue.forEach(function(item) {
            if (item.moduleNum !== null && item.moduleNum !== undefined && !MODULES_WITHOUT_VARIANTS.has(item.moduleNum)) {
                modulesToLoad.add(item.moduleNum);
            }
        });

        var loadPromises = [];
        modulesToLoad.forEach(function(moduleNum) {
            loadPromises.push(preloadModuleData(moduleNum));
        });

        Promise.all(loadPromises).then(function() {
            if (startBtn) { startBtn.disabled = false; startBtn.textContent = 'Start Session'; }

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
                itemLabel: opts.itemLabel || 'Exercise',
                accentColor: 'accent',
                onRender: renderCurrentExercise,
                extraShowOnStart: ['dp-nav'],
                onSessionStart: function() {
                    document.body.classList.add('dp-in-session');
                    if (opts.onStart) opts.onStart();
                }
            });
            session.queue = queue;

            SE.startSession(session);
        });
    }

    function doStartSession() {
        if (sessionConfig.mode === 'discover') {
            startDiscoverSession();
            return;
        }

        var queue = buildQueue(sessionConfig.mode, sessionConfig.count);

        if (queue.length === 0) {
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

        startWithQueue(queue);
    }

    // --- Today's Session (unified runner: pretest \u2192 learn \u2192 review \u2192 build) ---

    var todayMode = false;
    var todayDeadline = 0;
    var countdownTimer = null;

    var PHASE_COLORS = {
        pretest: 'var(--purple)',
        learn: 'var(--cyan)',
        review: 'var(--orange)',
        build: 'var(--green-bright)'
    };

    function loadSessionPlan() {
        try { return JSON.parse(sessionStorage.getItem('vibe-learn:session-plan') || 'null'); }
        catch (e) { return null; }
    }

    function buildPretestItems(plan) {
        if (!plan || !plan.learn || !window.PredictIndex) return [];
        var answered = window.Predict && window.Predict.loadAll ? window.Predict.loadAll() : {};
        return window.PredictIndex
            .filter(function(p) {
                return p.moduleId === plan.learn.moduleId && !answered[p.id];
            })
            .slice(0, 3)
            .map(function(p) { return { phase: 'pretest', predict: p }; });
    }

    function doStartTodaySession() {
        var plan = loadSessionPlan();
        var gated = !!(plan && plan.gate && plan.gate.modules && plan.gate.modules.length);

        var reviews = buildQueue('review', 8);
        if (reviews.length === 0 && !gated) reviews = buildQueue('mixed', 8);
        reviews.forEach(function(r) { r.phase = 'review'; });

        // Mastery gate: pull the fading prerequisite module's weakest items
        // to the front of the review segment, even if not strictly due.
        if (gated && window.SRS && window.SRS.getLowestRecall) {
            var inQueue = {};
            reviews.forEach(function(r) { inQueue[r.key] = true; });
            var gateItems = [];
            plan.gate.modules.forEach(function(g) {
                window.SRS.getLowestRecall(g.moduleNum, 4).forEach(function(entry) {
                    if (inQueue[entry.key] || !matchesFilters(entry.key)) return;
                    inQueue[entry.key] = true;
                    gateItems.push({
                        key: entry.key,
                        phase: 'review',
                        moduleNum: g.moduleNum,
                        moduleName: MODULE_NAMES[g.moduleNum] || ('Module ' + g.moduleNum),
                        srsData: entry
                    });
                });
            });
            reviews = interleaveByModule(gateItems.concat(reviews));
        }

        // New material stays locked while a prerequisite is below the gate
        var queue = gated ? [] : buildPretestItems(plan);
        if (plan && plan.learn && !gated) queue.push({ phase: 'learn', target: plan.learn });
        queue = queue.concat(reviews);
        if (plan && plan.build) queue.push({ phase: 'build', target: plan.build });

        if (queue.length === 0) {
            var hintEl = document.getElementById('dp-start-hint');
            if (hintEl) {
                hintEl.textContent = 'Nothing to practice yet \u2014 study a module first, then today\u2019s session builds itself.';
                hintEl.style.display = '';
            }
            return;
        }

        var pretests = queue.filter(function(q) { return q.phase === 'pretest'; }).length;
        var totalMin = pretests * 1 +
            (plan && plan.learn && !gated ? 9 : 0) +
            Math.ceil(reviews.length * 1.25) +
            (plan && plan.build ? 3 : 0);

        try {
            var sck = window.CourseConfigHelper ? window.CourseConfigHelper.storageKey('session-count') : 'course-session-count';
            localStorage.setItem(sck, String((parseInt(localStorage.getItem(sck) || '0', 10) || 0) + 1));
        } catch (e) {}

        todayMode = true;
        startWithQueue(queue, {
            itemLabel: 'Step',
            onStart: function() {
                var sessionEl = document.getElementById('dp-session');
                if (sessionEl) sessionEl.classList.add('dp-today');
                todayDeadline = Date.now() + Math.max(totalMin, 5) * 60000;
                startCountdown();
            }
        });
    }

    function startCountdown() {
        var el = document.getElementById('dp-countdown');
        if (!el) return;
        if (countdownTimer) clearInterval(countdownTimer);
        function tick() {
            var left = todayDeadline - Date.now();
            if (left <= 0) {
                el.textContent = 'time \u2014 wrap up';
                return;
            }
            var m = Math.floor(left / 60000);
            var s = Math.floor((left % 60000) / 1000);
            el.textContent = m + ':' + (s < 10 ? '0' : '') + s + ' left';
        }
        tick();
        countdownTimer = setInterval(tick, 1000);
    }

    function renderTodaySegments(sess) {
        var bar = document.getElementById('dp-segments');
        if (!bar) return;
        if (!todayMode) { bar.innerHTML = ''; return; }
        bar.innerHTML = sess.queue.map(function(it, i) {
            var color = i <= sess.index ? (PHASE_COLORS[it.phase] || PHASE_COLORS.review) : 'var(--bg-muted)';
            var cls = 'dp-seg' + (i === sess.index ? ' current' : '');
            return '<span class="' + cls + '" style="background:' + color + '"></span>';
        }).join('');
    }

    function escapeAttr(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    }

    function renderPretestCard(container, item) {
        setVibeMode(true);
        var p = item.predict;
        var where = p.sectionNum ? '\u00a7' + p.moduleId + '.' + p.sectionNum : 'Module ' + p.moduleId;
        container.innerHTML =
            '<div class="exercise phase-card pretest-card">' +
                '<div class="vibe-card-tag" style="color:var(--purple)">Pretest \u00b7 ' + where + ' \u2014 before you read it</div>' +
                '<h4>Commit to an answer</h4>' +
                '<div class="predict-block" data-predict-id="' + escapeAttr(p.id) + '" data-predict-prompt="' + escapeAttr(p.prompt) + '">' +
                    '<div class="predict-code">' + p.codeHtml + '</div>' +
                    '<div class="predict-output" hidden>' + p.outputHtml + '</div>' +
                '</div>' +
                '<p class="phase-note">Wrong is fine \u2014 committing to an answer first improves what you remember from the section.</p>' +
            '</div>';
        var block = container.querySelector('.predict-block');
        if (block && window.Predict) window.Predict.initBlock(block);
    }

    function renderLearnCard(container, item) {
        setVibeMode(true);
        container.innerHTML =
            '<div class="exercise phase-card learn-card">' +
                '<div class="vibe-card-tag" style="color:var(--cyan)">Learn</div>' +
                '<h4>' + SE.escapeHtml(item.target.label) + '</h4>' +
                '<p class="phase-note">Open the section and work it top to bottom \u2014 worked example, fill the gaps, from scratch. ' +
                'The tab stays open; come back and hit <strong>Next</strong> when you\u2019re done.</p>' +
                '<a class="session-next-btn phase-open-link" href="' + escapeAttr(item.target.href) + '" target="_blank" rel="noopener">Open the lesson \u2197</a>' +
            '</div>';
    }

    function renderBuildCard(container, item) {
        setVibeMode(true);
        container.innerHTML =
            '<div class="exercise phase-card build-card">' +
                '<div class="vibe-card-tag" style="color:var(--green-bright)">Build \u00b7 ends the session in your real project</div>' +
                '<h4>' + SE.escapeHtml(item.target.label) + '</h4>' +
                '<p class="phase-note">Wire what you just practiced into the project \u2014 retrieval, then immediate transfer. ' +
                'Even one small step counts.</p>' +
                '<a class="session-next-btn phase-open-link" href="' + escapeAttr(item.target.href) + '" target="_blank" rel="noopener">Open the project \u2197</a>' +
            '</div>';
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
            accentColor: 'accent',
            onRender: renderCurrentExercise,
            extraShowOnStart: ['dp-nav'],
            onSessionStart: function() {
                document.body.classList.add('dp-in-session');
            }
        });
        // Set a placeholder queue so startSession succeeds
        session.queue = [{ key: '_placeholder' }];

        SE.startSession(session);

        var container = document.getElementById('dp-exercise-container');
        if (container) {
            container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-secondary);">Loading exercise data...</div>';
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

    /**
     * Interleave items across modules (round-robin) so consecutive cards
     * come from different concepts — no pattern-matching off the previous
     * card. Preserves the due-first ordering within each module.
     */
    function interleaveByModule(items) {
        var byModule = {};
        var order = [];
        items.forEach(function(item) {
            var m = String(item.moduleNum);
            if (!byModule[m]) { byModule[m] = []; order.push(m); }
            byModule[m].push(item);
        });
        if (order.length <= 1) return items;

        var out = [];
        var idx = 0;
        while (out.length < items.length) {
            var m = order[idx % order.length];
            if (byModule[m].length > 0) out.push(byModule[m].shift());
            idx++;
            // All buckets for this pass empty? (guard against spin)
            if (idx > items.length * order.length) break;
        }
        return out;
    }

    function buildQueue(mode, count) {
        var candidates = SE.buildPaddedSRSQueue(mode, count, matchesFilters);
        if (candidates.length === 0) return [];

        return interleaveByModule(candidates.map(function(item) {
            var match = item.key.match(/^(?:fc_)?m(\d+)_/);
            var moduleNum = match ? parseInt(match[1]) : null;
            return {
                key: item.key,
                moduleNum: moduleNum,
                moduleName: MODULE_NAMES[moduleNum] || ('Module ' + moduleNum),
                srsData: item
            };
        }));
    }

    function buildDiscoverQueue(count) {
        var registry = window.moduleDataRegistry;
        if (!registry) return [];

        var targetModules = sessionConfig.modules === 'all'
            ? MODULES_WITH_VARIANTS
            : MODULES_WITH_VARIANTS.filter(function(m) {
                return sessionConfig.modules.includes(m);
            });

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
                        allItems.push({
                            key: 'm' + moduleNum + '_' + warmup.id + '_' + variant.id,
                            moduleNum: moduleNum, moduleName: moduleName,
                            type: 'warmup', challenge: null, variant: variant
                        });
                    });
                });
            }

            if (variants.challenges && (sessionConfig.type === 'all' || sessionConfig.type === 'challenge')) {
                variants.challenges.forEach(function(challenge) {
                    if (!challenge.variants) return;
                    challenge.variants.forEach(function(variant) {
                        allItems.push({
                            key: 'm' + moduleNum + '_' + challenge.id + '_' + variant.id,
                            moduleNum: moduleNum, moduleName: moduleName,
                            type: 'challenge', challenge: challenge, variant: variant
                        });
                    });
                });
            }
        });

        return SE.buildDiscoverQueue(allItems, count);
    }

    // --- Exercise Rendering ---

    function resetCompletionState(container) {
        container.querySelectorAll('.exercise').forEach(function(ex) {
            ex.classList.remove('exercise-completed');
        });
        container.querySelectorAll('.self-rating .rating-btn').forEach(function(btn) {
            btn.classList.remove('active', 'got-it', 'struggled', 'peeked');
        });
        container.querySelectorAll('.self-rating-label').forEach(function(lbl) {
            lbl.textContent = 'How did it go?';
        });
    }

    function renderCurrentExercise(sess) {
        var item = sess.queue[sess.index];
        if (!item) return;

        var moduleEl = document.getElementById('dp-session-module');
        if (moduleEl) {
            moduleEl.textContent = item.moduleNum ? 'Module ' + item.moduleNum + ': ' + item.moduleName : (item.moduleName || '');
        }

        var container = document.getElementById('dp-exercise-container');
        if (!container) return;

        renderTodaySegments(sess);
        renderInterleaveStrip(sess);

        // Every card starts advanceable; renderVibeCard re-locks Next when
        // the runner is ready to grade.
        setNextLocked(false);

        // Phase cards (today's session runner)
        if (item.phase === 'pretest') { renderPretestCard(container, item); return; }
        if (item.phase === 'learn') { renderLearnCard(container, item); return; }
        if (item.phase === 'build') { renderBuildCard(container, item); return; }

        // Local-first: this exercise has a go-test workspace — the terminal
        // is the workbench, connected or not. Objective grading is the only
        // grading for these; the daemon being down just means "no run yet".
        var vd = item.variant
            ? { variant: item.variant, challenge: item.challenge, type: item.type }
            : findVariantData(item);
        if (vd && vd.variant && vd.variant.practiceDir) {
            renderVibeCard(container, item, vd);
            return;
        }
        setVibeMode(false);

        function mountWithRail(html) {
            var baseKey = item.key.replace(/_(?:v|tp)\w+$/, '');
            container.innerHTML = '<div class="vibe-layout">' + html + schedulerRailHtml(item, baseKey) + '</div>';
            wireRail(baseKey, null);
            if (window.initExerciseProgress) window.initExerciseProgress();
            container.querySelectorAll('.exercise').forEach(function(ex) {
                if (window.ExerciseRenderer) {
                    window.ExerciseRenderer.initPersonalNotes(ex);
                }
            });
            resetCompletionState(container);
        }

        // Discover items carry their variant data directly
        if (item.variant) {
            var html = window.ExerciseRenderer ? window.ExerciseRenderer.renderExerciseCard({
                num: 1,
                variant: item.variant,
                challenge: item.challenge,
                type: item.type,
                exerciseKey: item.key,
                moduleLabel: 'M' + item.moduleNum,
                expanded: true
            }) : null;
            if (html) {
                mountWithRail(html);
                return;
            }
        }

        // Standard path: render from key lookup
        var exerciseHtml = renderFromKey(item);
        if (exerciseHtml) {
            mountWithRail(exerciseHtml);
        } else {
            container.innerHTML =
                '<div class="exercise" style="text-align: center; padding: 2rem;">' +
                    '<h4 style="margin-bottom: 0.5rem;">Module ' + item.moduleNum + ': ' + item.moduleName + '</h4>' +
                    '<p style="color: var(--text-secondary); margin-bottom: 1.25rem;">This exercise is available in the module page.</p>' +
                    '<a href="module' + item.moduleNum + '.html" class="session-next-btn" style="text-decoration: none; display: inline-block;">' +
                        'Open Module ' + item.moduleNum + ' &rarr;' +
                    '</a>' +
                '</div>';
        }
    }

    /**
     * Resolve an SRS key to variant data. Matches, in order: exact
     * "group_variant" key, group-prefix (variant removed — pick a random
     * survivor), bare group id (SRS keys are variant-stripped — pick a
     * random variant). May rewrite item.key to the resolved variant key.
     *
     * @returns {{variant, challenge, type}|null}
     */
    function findVariantData(item) {
        var registry = window.moduleDataRegistry;
        if (!registry || !registry[item.moduleNum]) {
            loadModuleData(item.moduleNum);
            return null;
        }
        var variants = registry[item.moduleNum].variants;
        if (!variants) return null;

        var keyParts = item.key.replace('m' + item.moduleNum + '_', '');
        var groupsByType = [
            { groups: variants.warmups || [], type: 'warmup' },
            { groups: variants.challenges || [], type: 'challenge' }
        ];

        var strategies = [
            function(group, v) { return keyParts === group.id + '_' + v.id; },
            function(group) { return keyParts.indexOf(group.id + '_') === 0; },
            function(group) { return keyParts === group.id; }
        ];

        for (var s = 0; s < strategies.length; s++) {
            for (var t = 0; t < groupsByType.length; t++) {
                var entry = groupsByType[t];
                for (var g = 0; g < entry.groups.length; g++) {
                    var group = entry.groups[g];
                    if (!group.variants || group.variants.length === 0) continue;
                    if (s === 0) {
                        for (var v = 0; v < group.variants.length; v++) {
                            if (strategies[0](group, group.variants[v])) {
                                return { variant: group.variants[v], challenge: entry.type === 'challenge' ? group : null, type: entry.type };
                            }
                        }
                    } else if (strategies[s](group)) {
                        var pick = group.variants[Math.floor(Math.random() * group.variants.length)];
                        item.key = 'm' + item.moduleNum + '_' + group.id + '_' + pick.id;
                        return { variant: pick, challenge: entry.type === 'challenge' ? group : null, type: entry.type };
                    }
                }
            }
        }
        return null;
    }

    function renderFromKey(item) {
        var data = findVariantData(item);
        if (!data || !window.ExerciseRenderer) return null;
        return window.ExerciseRenderer.renderExerciseCard({
            num: 1,
            variant: data.variant,
            challenge: data.challenge,
            type: data.type,
            exerciseKey: item.key,
            moduleLabel: 'M' + item.moduleNum,
            expanded: true
        });
    }

    // --- Interleave Strip ---

    function renderInterleaveStrip(sess) {
        var strip = document.getElementById('dp-interleave');
        if (!strip) return;

        var current = sess.queue[sess.index];
        // Strip only makes sense while reviewing exercises
        if (!current || (current.phase && current.phase !== 'review')) { strip.innerHTML = ''; return; }
        var reviews = sess.queue.filter(function(q) { return !q.phase || q.phase === 'review'; });
        if (reviews.length < 2) { strip.innerHTML = ''; return; }
        var idx = reviews.indexOf(current);

        var html = '<span class="interleave-label">Review · interleaved</span>';
        var start = Math.max(0, idx - 1);
        var end = Math.min(reviews.length, start + 4);
        for (var i = start; i < end; i++) {
            var q = reviews[i];
            var concept = (window.ConceptIndex && window.ConceptIndex[q.key.replace(/_(?:v|tp)\w+$/, '')]) || q.moduleName || '';
            var cls = i === idx ? 'interleave-chip current' : (i < idx ? 'interleave-chip done' : 'interleave-chip');
            html += '<span class="' + cls + '">M' + q.moduleNum + ' · ' + SE.escapeHtml(String(concept).toLowerCase()) +
                (i < idx ? ' ✓' : (i === idx ? ' · now' : '')) + '</span>';
        }
        strip.innerHTML = html;
    }

    // --- Scheduler Rail (design 2a: legible scheduling) ---

    var railPre = null; // { key, stability } captured when the card renders
    var solutionTimer = null;
    var SOLUTION_LOCK_S = 90;

    function fmtDaysAgo(iso) {
        var d = (Date.now() - new Date(iso).getTime()) / 86400000;
        if (d < 1) return 'today';
        return Math.round(d) + 'd ago';
    }

    function schedulerRailHtml(item, baseKey) {
        if (!window.SRS) return '';
        var entry = window.SRS.getAll()[baseKey];
        var recall = window.SRS.getRetrievability ? window.SRS.getRetrievability(baseKey) : null;
        railPre = { key: baseKey, stability: entry ? entry.stability : null };

        var concept = window.ConceptIndex && window.ConceptIndex[baseKey];
        var why;
        if (entry && entry.reviewCount) {
            why = (concept ? '<strong>' + SE.escapeHtml(concept) + '</strong> — ' : '') +
                'last seen ' + (entry.lastReview ? fmtDaysAgo(entry.lastReview) : 'a while ago') +
                ' · ' + entry.reviewCount + ' review' + (entry.reviewCount === 1 ? '' : 's') +
                ', current streak ' + (entry.repetitions || 0) +
                '. It sits between unrelated concepts so you can’t pattern-match off the previous card.';
        } else {
            why = (concept ? '<strong>' + SE.escapeHtml(concept) + '</strong> — ' : '') +
                'first time through. Today’s result seeds its schedule.';
        }

        function row(label, value, id, color) {
            return '<div class="rail-row"><span>' + label + '</span><strong' +
                (id ? ' id="' + id + '"' : '') + (color ? ' style="color:' + color + '"' : '') + '>' +
                value + '</strong></div>';
        }

        var daemonOnline = !!(window.VibeBridge && window.VibeBridge.isRunnerReady());
        var daemonText = daemonOnline
            ? 'local runner ready · save a file to run its tests'
            : (isApp
                ? 'local runner unavailable — restart the desktop app; this card falls back to self-rating'
                : 'daemon offline — run <code>npm run vibe watch</code>; this card falls back to self-rating');

        // Successive relearning: re-surface the section this concept came
        // from, so the lesson itself gets relearned, not just the exercise.
        var refresherPanel = '';
        if (concept && window.SectionSummaries) {
            var section = null;
            for (var si = 0; si < window.SectionSummaries.length; si++) {
                if (window.SectionSummaries[si].concepts.indexOf(concept) !== -1) {
                    section = window.SectionSummaries[si];
                    break;
                }
            }
            if (section) {
                refresherPanel =
                    '<div class="rail-panel rail-refresher">' +
                        '<div class="rail-kicker">Refresher · §' + section.moduleId + '.' + section.sectionNum + '</div>' +
                        '<details><summary>' + SE.escapeHtml(section.title) + '</summary>' +
                        '<p class="rail-body">' + section.summary + '</p>' +
                        '<a class="rail-body" href="' + SE.escapeHtml(section.file) + '" target="_blank" rel="noopener">reread the section ↗</a>' +
                        '</details>' +
                    '</div>';
            }
        }

        return '<div class="vibe-rail">' +
            '<div class="rail-panel">' +
                '<div class="rail-kicker">Scheduler · this item</div>' +
                row('Predicted recall', recall === null ? '—' : Math.round(recall * 100) + '%', null, 'var(--orange)') +
                row('Outcome', 'waiting…', 'rail-outcome') +
                row('Stability', entry && entry.stability ? entry.stability + 'd' : '—', 'rail-stability') +
                row('Next review', entry && entry.interval ? 'was ' + entry.interval + 'd' : '—', 'rail-next') +
                '<p class="rail-footnote">Graded by the test run, not self-rating. One optional dial:</p>' +
                '<button type="button" class="vibe-hint-btn rail-harder" id="rail-harder" hidden>felt harder than it looks</button>' +
            '</div>' +
            '<div class="rail-panel">' +
                '<div class="rail-kicker">Why this item now</div>' +
                '<p class="rail-body">' + why + '</p>' +
            '</div>' +
            refresherPanel +
            '<div class="rail-panel">' +
                '<div class="rail-kicker">Workbench</div>' +
                '<p class="rail-body" id="rail-daemon">' + daemonText + '</p>' +
            '</div>' +
        '</div>';
    }

    function wireRail(baseKey, label) {
        var harder = document.getElementById('rail-harder');
        if (harder) {
            harder.addEventListener('click', function() {
                if (window.SRS) window.SRS.recordReview(baseKey, 3, label);
                updateRail(baseKey, 'adjusted — harder', 'var(--orange)');
                harder.disabled = true;
                harder.textContent = 'noted — stability nudged down';
            });
        }
    }

    function updateRail(baseKey, outcomeText, outcomeColor, showDial) {
        if (!railPre || railPre.key !== baseKey || !window.SRS) return;
        var entry = window.SRS.getAll()[baseKey];
        var outcome = document.getElementById('rail-outcome');
        if (outcome) { outcome.textContent = outcomeText; outcome.style.color = outcomeColor || ''; }
        if (!entry) return;
        var stab = document.getElementById('rail-stability');
        if (stab) {
            stab.textContent = railPre.stability
                ? railPre.stability + 'd → ' + entry.stability + 'd'
                : entry.stability + 'd';
        }
        var next = document.getElementById('rail-next');
        if (next && entry.interval) {
            next.textContent = entry.interval === 1 ? 'tomorrow' : 'in ' + entry.interval + 'd';
        }
        var harder = document.getElementById('rail-harder');
        if (harder && showDial) harder.hidden = false;
    }

    // --- Local-First (vibe) Cards ---

    function setVibeMode(on) {
        var sessionEl = document.getElementById('dp-session');
        if (sessionEl) sessionEl.classList.toggle('vibe-active', !!on);
        var guide = document.getElementById('dp-rating-guide');
        if (guide) guide.style.display = on ? 'none' : '';
        // Phase cards (pretest/learn/build) share vibe mode but have no test
        // run to unlock Next — only renderVibeCard decides to lock it.
        if (!on) setNextLocked(false);
    }

    // Watch mode: on workspace-backed cards "next" stays locked until the
    // tests go green — the run is the rating. Skip stays available.
    function setNextLocked(locked) {
        var btn = document.getElementById('dp-next');
        if (!btn) return;
        btn.disabled = locked;
        btn.innerHTML = locked ? '🔒 Next — unlocks on green' : 'Next →';
    }

    function renderVibeCard(container, item, vd) {
        setVibeMode(true);
        // Lock Next only while the runner can actually grade this card; when
        // it's offline the learner must be able to advance manually.
        setNextLocked(!!(window.VibeBridge && window.VibeBridge.isRunnerReady()));

        var variant = vd.variant;
        var baseKey = item.key.replace(/_(?:v|tp)\w+$/, '');
        // practiceDir is build-time truth: 'practice/moduleN/<group>_<vid>'
        var wsDir = variant.practiceDir;
        var wsParts = wsDir.match(/module(\d+)\/(.+)$/);
        var workspace = wsParts ? 'm' + wsParts[1] + '_' + wsParts[2] : baseKey;
        var displayDir = window.VibeBridge ? window.VibeBridge.displayPath(wsDir) : wsDir;

        var recall = window.SRS && window.SRS.getRetrievability ? window.SRS.getRetrievability(baseKey) : null;

        var hintsHtml = '';
        if (variant.hints && variant.hints.length) {
            hintsHtml = '<div class="vibe-hints">';
            variant.hints.forEach(function(hint, i) {
                var text = typeof hint === 'object' ? (hint.text || hint.title || '') : hint;
                hintsHtml += '<button type="button" class="vibe-hint-btn" data-hint-index="' + i + '">Hint (' + (i + 1) + '/' + variant.hints.length + ')</button>' +
                    '<div class="vibe-hint-body" hidden>' + text + '</div>';
            });
            hintsHtml += '</div>';
        }

        var solutionHtml = '';
        if (variant.solution) {
            solutionHtml =
                '<button type="button" class="vibe-hint-btn vibe-solution-btn" id="vibe-solution-btn" disabled>Solution · 1:30</button>' +
                '<div class="vibe-solution-body" id="vibe-solution-body" hidden><pre>' + SE.escapeHtml(variant.solution) + '</pre></div>';
        }

        var cardHtml =
            '<div class="exercise vibe-card" data-exercise-key="' + SE.escapeHtml(item.key) + '" data-base-key="' + SE.escapeHtml(baseKey) + '" data-variant-key="' + SE.escapeHtml(workspace) + '">' +
                '<div class="vibe-card-meta">' +
                    '<span class="vibe-card-tag">Module ' + item.moduleNum + (item.moduleName ? ' · ' + SE.escapeHtml(item.moduleName) : '') + '</span>' +
                    (function() {
                        var d = Math.max(1, Math.min(3, variant.difficulty || 2));
                        return '<span class="vibe-card-stars" title="difficulty ' + d + '/3">' +
                            '★★★'.slice(0, d) + '☆☆☆'.slice(0, 3 - d) + '</span>';
                    })() +
                    (recall !== null ? '<span class="vibe-card-recall">predicted recall <strong>' + Math.round(recall * 100) + '%</strong></span>' : '') +
                    '<span class="run-status fail" id="vibe-run-status">● not passing</span>' +
                '</div>' +
                '<h4>' + SE.escapeHtml(variant.title || baseKey) + '</h4>' +
                (variant.description ? '<div class="exercise-description">' + variant.description + '</div>' : '') +
                '<div class="vibe-terminal">' +
                    '<div class="vibe-terminal-head">' +
                        '<span>in your terminal — not here</span>' +
                        '<span class="vibe-watch-status" id="vibe-watch-status">' +
                        (window.VibeBridge && window.VibeBridge.isRunnerReady()
                            ? 'watching for results…'
                            : (isApp ? 'local runner unavailable — restart app' : 'daemon offline — run: node vibe.js watch')) +
                        '</span>' +
                    '</div>' +
                    (isApp
                        ? '<pre><span class="vibe-dim">' + SE.escapeHtml(displayDir) + '/exercise.go\n→ edit in your editor and save to run tests automatically</span></pre>'
                        : '<pre><span class="vibe-prompt">$</span> npm run vibe next\n<span class="vibe-dim">→ ' + SE.escapeHtml(workspace) + ' · ' + SE.escapeHtml(wsDir) + '/\n→ edit exercise.go in your editor</span>\n\n<span class="vibe-prompt">$</span> npm run vibe check ' + SE.escapeHtml(wsDir) + '</pre>') +
                '</div>' +
                '<div class="vibe-results" id="vibe-results"><span class="vibe-dim">no run received yet — results appear here after <code>vibe check</code></span></div>' +
                '<div class="vibe-card-footer">' +
                    hintsHtml +
                    solutionHtml +
                    '<span class="kc"><kbd>h</kbd>hint</span>' +
                    '<span class="vibe-footer-note">graded by the test run · passes advance automatically</span>' +
                '</div>' +
            '</div>';

        container.innerHTML = '<div class="vibe-layout">' + cardHtml + schedulerRailHtml(item, baseKey) + '</div>';
        wireRail(baseKey, variant.title || null);

        container.querySelectorAll('.vibe-hints .vibe-hint-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var body = btn.nextElementSibling;
                if (body) { body.hidden = false; btn.style.display = 'none'; }
                if (window.ExerciseProgress) window.ExerciseProgress.update(item.key, { hintsUsed: true });
                if (window.VibeBridge) window.VibeBridge.markAssist(baseKey, 'hint');
            });
        });

        // Timer-locked solution: unlocks after the thinking window
        var solBtn = document.getElementById('vibe-solution-btn');
        if (solBtn) {
            if (solutionTimer) clearInterval(solutionTimer);
            var unlockAt = Date.now() + SOLUTION_LOCK_S * 1000;
            solutionTimer = setInterval(function() {
                if (!document.getElementById('vibe-solution-btn')) { clearInterval(solutionTimer); return; }
                var left = Math.ceil((unlockAt - Date.now()) / 1000);
                if (left <= 0) {
                    clearInterval(solutionTimer);
                    solBtn.disabled = false;
                    solBtn.textContent = 'Show solution';
                } else {
                    solBtn.textContent = 'Solution · ' + Math.floor(left / 60) + ':' + (left % 60 < 10 ? '0' : '') + (left % 60);
                }
            }, 1000);
            solBtn.addEventListener('click', function() {
                if (solBtn.disabled) return;
                var body = document.getElementById('vibe-solution-body');
                if (body) body.hidden = false;
                solBtn.style.display = 'none';
                if (window.ExerciseProgress) window.ExerciseProgress.update(item.key, { solutionViewed: true });
                if (window.VibeBridge) window.VibeBridge.markAssist(baseKey, 'solution');
            });
        }

        // Tell the daemon what's on screen so `vibe next` targets it (the
        // bridge caches it and re-announces if the daemon connects later)
        if (window.VibeBridge) {
            window.VibeBridge.announce({
                key: baseKey,
                variantKey: workspace,
                title: variant.title || ''
            });
        }
    }

    function renderVibeResult(result, quality) {
        var card = document.querySelector('#dp-exercise-container .vibe-card');
        if (!card) return false;
        if (card.dataset.variantKey !== (result.variantKey || result.key)) return false;

        var pane = document.getElementById('vibe-results');
        if (!pane) return false;

        var html = '';
        if (result.buildFailed) {
            html += '<div class="vibe-line fail">✗ build failed</div>' +
                '<div class="vibe-line dim">' + SE.escapeHtml((result.buildOutput || '').split('\n').slice(0, 6).join('\n')) + '</div>';
        } else {
            (result.tests || []).forEach(function(t) {
                html += '<div class="vibe-line ' + (t.pass ? 'pass' : 'fail') + '">' + (t.pass ? '✓' : '✗') + ' ' + SE.escapeHtml(t.name) + '</div>';
                if (!t.pass && t.output) {
                    var tail = t.output.split('\n').filter(function(l) { return /---|FAIL|got|want|expected/.test(l); }).slice(0, 3).join('\n');
                    if (tail) html += '<div class="vibe-line dim">' + SE.escapeHtml(tail) + '</div>';
                }
            });
        }
        if (result.vetOk === false && result.vetOutput) {
            html += '<div class="vibe-line dim">go vet: ' + SE.escapeHtml(result.vetOutput.split('\n')[0]) + '</div>';
        }

        var entry = window.SRS && window.SRS.getAll()[result.key];
        var when = new Date(result.at).toLocaleTimeString();
        html += '<div class="vibe-line meta">received from vibe check · ' + when + ' · attempt ' + result.attempt +
            (entry && entry.interval ? ' · next review in ' + entry.interval + 'd' : '') + '</div>';

        pane.innerHTML = html;
        var status = document.getElementById('vibe-watch-status');
        if (status) status.textContent = result.pass ? 'passed ✓' : 'watching for results…';

        var runStatus = document.getElementById('vibe-run-status');
        if (runStatus) {
            runStatus.className = 'run-status ' + (result.pass ? 'pass' : 'fail');
            runStatus.textContent = result.pass ? '● passing' : '● not passing';
        }
        if (result.pass) setNextLocked(false);

        if (result.pass && session) {
            setTimeout(function() {
                // Only advance if this card is still the one on screen
                var current = document.querySelector('#dp-exercise-container .vibe-card');
                if (current && current.dataset.variantKey === (result.variantKey || result.key)) SE.nextExercise(session);
            }, 1800);
        }
        return true;
    }

    // Watch-mode keyboard: `h` reveals the next hint on the current card
    document.addEventListener('keydown', function(e) {
        if (e.key !== 'h' || e.metaKey || e.ctrlKey || e.altKey) return;
        if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
        var btn = document.querySelector('#dp-exercise-container .vibe-hints .vibe-hint-btn');
        if (btn && btn.offsetParent !== null) btn.click();
    });

    window.addEventListener('vibeResult', function(e) {
        renderVibeResult(e.detail.result, e.detail.quality);
        var r = e.detail.result;
        updateRail(r.key,
            r.pass ? 'vibe check passed' : 'vibe check failed',
            r.pass ? 'var(--green-bright)' : 'var(--red)',
            r.pass);
    });

    window.addEventListener('vibeStatusChanged', function(e) {
        var runnerReady = e.detail.runnerReady;
        var status = document.getElementById('vibe-watch-status');
        if (status) {
            status.textContent = runnerReady
                ? 'watching for results…'
                : (isApp ? 'local runner unavailable — restart app' : 'daemon offline — run: npm run vibe watch');
        }
        var daemon = document.getElementById('rail-daemon');
        if (daemon) {
            daemon.innerHTML = runnerReady
                ? 'local runner ready · save a file to run its tests'
                : (isApp
                    ? 'local runner unavailable — restart the desktop app; Next is unlocked meanwhile'
                    : 'daemon offline — run <code>npm run vibe watch</code>; Next is unlocked meanwhile');
        }
        // Re-evaluate the watch-mode lock for the card on screen: going
        // offline unlocks Next, reconnecting re-locks until a green run.
        var card = document.querySelector('#dp-exercise-container .vibe-card');
        if (card) {
            var passed = /\bpass\b/.test((document.getElementById('vibe-run-status') || {}).className || '');
            setNextLocked(runnerReady && !passed);
        }
    });

    // --- Module Data Loading ---

    var moduleLoadPromises = {};

    function preloadModuleData(moduleNum) {
        if (moduleLoadPromises[moduleNum]) return moduleLoadPromises[moduleNum];

        moduleLoadPromises[moduleNum] = new Promise(function(resolve) {
            var script = document.createElement('script');
            script.src = 'data/module' + moduleNum + '-variants.js';
            script.onload = resolve;
            script.onerror = resolve;
            document.head.appendChild(script);
        });

        return moduleLoadPromises[moduleNum];
    }

    function loadModuleData(moduleNum) {
        preloadModuleData(moduleNum);
    }

    // --- Public API ---

    // --- SRS Feedback after Rating ---

    window.addEventListener('exerciseRated', function(e) {
        if (!session) return;
        var key = e.detail.key;
        var srsKey = key.replace(/_(?:v|tp)\w+$/, '');
        var ratingLabels = { 1: ['got it', 'var(--green-bright)'], 2: ['struggled', 'var(--orange)'], 3: ['needed solution', 'var(--purple)'] };
        var rl = ratingLabels[e.detail.rating];
        if (rl) updateRail(srsKey, rl[0], rl[1], true);
        var srsData = window.SRS && window.SRS.getAll();
        var entry = srsData && srsData[srsKey];
        if (!entry || !entry.interval) return;

        var ratingEl = document.querySelector('.self-rating[data-exercise-key="' + key + '"]');
        if (!ratingEl) return;

        // Remove any previous feedback
        var old = ratingEl.parentNode.querySelector('.srs-feedback');
        if (old) old.remove();

        var fb = document.createElement('div');
        fb.className = 'srs-feedback';
        var days = entry.interval;
        var msg;
        if (days <= 1) msg = 'Next review in 1 day';
        else if (days < 30) msg = 'Next review in ' + days + ' days';
        else if (days < 365) msg = 'Next review in ' + Math.round(days / 30) + ' month' + (Math.round(days / 30) === 1 ? '' : 's');
        else msg = 'Mastered — next review in ' + Math.round(days / 365) + '+ year' + (Math.round(days / 365) === 1 ? '' : 's');
        fb.textContent = msg;
        fb.style.cssText = 'font-size: 0.78rem; color: var(--text-secondary); margin-top: 0.4rem;';
        ratingEl.insertAdjacentElement('afterend', fb);
    });

    window.startSession = doStartSession;
    window.nextExercise = function() { if (session) SE.nextExercise(session); };
    window.skipExercise = function() { if (session) SE.skipExercise(session); };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
