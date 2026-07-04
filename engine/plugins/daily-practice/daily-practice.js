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

    function renderContinueLinks() {
        var el = document.getElementById('dp-continue');
        if (!el) return;
        var plan = null;
        try { plan = JSON.parse(sessionStorage.getItem('vibe-learn:session-plan') || 'null'); } catch (e) {}
        if (!plan) return;
        var html = '';
        if (plan.learn) {
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

        // Disable start button while loading
        var startBtn = document.getElementById('dp-start');
        if (startBtn) { startBtn.disabled = true; startBtn.textContent = 'Loading\u2026'; }

        // Preload variant data BEFORE starting session to avoid race condition
        var modulesToLoad = new Set();
        queue.forEach(function(item) {
            if (item.moduleNum !== null && !MODULES_WITHOUT_VARIANTS.has(item.moduleNum)) {
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
                itemLabel: 'Exercise',
                accentColor: 'accent',
                onRender: renderCurrentExercise,
                extraShowOnStart: ['dp-nav'],
                onSessionStart: function() {
                    document.body.classList.add('dp-in-session');
                }
            });
            session.queue = queue;

            SE.startSession(session);
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

        renderInterleaveStrip(sess);

        // Local-first: this exercise has a go-test workspace and the vibe
        // daemon is up — the terminal is the workbench, no code input here.
        if (window.VibeBridge && window.VibeBridge.isOnline() && window.VibeBridge.hasWorkspace(item.key.replace(/_(?:v|tp)\w+$/, ''))) {
            var vd = item.variant
                ? { variant: item.variant, challenge: item.challenge, type: item.type }
                : findVariantData(item);
            if (vd) {
                renderVibeCard(container, item, vd);
                return;
            }
        }
        setVibeMode(false);

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
                container.innerHTML = html;
                if (window.initExerciseProgress) window.initExerciseProgress();
                container.querySelectorAll('.exercise').forEach(function(ex) {
                    if (window.ExerciseRenderer) {
                        window.ExerciseRenderer.initPersonalNotes(ex);
                    }
                });
                resetCompletionState(container);
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
            resetCompletionState(container);
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
        if (sess.queue.length < 2) { strip.innerHTML = ''; return; }

        var html = '<span class="interleave-label">Review · interleaved</span>';
        var start = Math.max(0, sess.index - 1);
        var end = Math.min(sess.queue.length, start + 4);
        for (var i = start; i < end; i++) {
            var q = sess.queue[i];
            var concept = (window.ConceptIndex && window.ConceptIndex[q.key.replace(/_(?:v|tp)\w+$/, '')]) || q.moduleName || '';
            var cls = i === sess.index ? 'interleave-chip current' : (i < sess.index ? 'interleave-chip done' : 'interleave-chip');
            html += '<span class="' + cls + '">M' + q.moduleNum + ' · ' + SE.escapeHtml(String(concept).toLowerCase()) +
                (i < sess.index ? ' ✓' : (i === sess.index ? ' · now' : '')) + '</span>';
        }
        strip.innerHTML = html;
    }

    // --- Local-First (vibe) Cards ---

    function setVibeMode(on) {
        var sessionEl = document.getElementById('dp-session');
        if (sessionEl) sessionEl.classList.toggle('vibe-active', !!on);
        var guide = document.getElementById('dp-rating-guide');
        if (guide) guide.style.display = on ? 'none' : '';
    }

    function renderVibeCard(container, item, vd) {
        setVibeMode(true);

        var variant = vd.variant;
        var baseKey = item.key.replace(/_(?:v|tp)\w+$/, '');
        var workspace = window.VibeBridge.resolveWorkspace(item.key) ||
                        window.VibeBridge.resolveWorkspace(baseKey) || baseKey;
        var wsMatch = workspace.match(/^m(\d+)_(.+)$/);
        var wsDir = wsMatch ? 'practice/module' + wsMatch[1] + '/' + wsMatch[2] : 'practice/';

        var srsEntry = window.SRS && window.SRS.getAll()[baseKey];
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

        container.innerHTML =
            '<div class="exercise vibe-card" data-exercise-key="' + SE.escapeHtml(item.key) + '" data-base-key="' + SE.escapeHtml(baseKey) + '">' +
                '<div class="vibe-card-meta">' +
                    '<span class="vibe-card-tag">Module ' + item.moduleNum + (item.moduleName ? ' · ' + SE.escapeHtml(item.moduleName) : '') + '</span>' +
                    (recall !== null ? '<span class="vibe-card-recall">predicted recall <strong>' + Math.round(recall * 100) + '%</strong></span>' : '') +
                '</div>' +
                '<h4>' + SE.escapeHtml(variant.title || baseKey) + '</h4>' +
                (variant.description ? '<div class="exercise-description">' + variant.description + '</div>' : '') +
                '<div class="vibe-terminal">' +
                    '<div class="vibe-terminal-head">' +
                        '<span>in your terminal — not here</span>' +
                        '<span class="vibe-watch-status" id="vibe-watch-status">watching for results…</span>' +
                    '</div>' +
                    '<pre><span class="vibe-prompt">$</span> npm run vibe next\n<span class="vibe-dim">→ ' + SE.escapeHtml(workspace) + ' · ' + SE.escapeHtml(wsDir) + '/\n→ edit exercise.go in your editor</span>\n\n<span class="vibe-prompt">$</span> npm run vibe check ' + SE.escapeHtml(wsDir) + '</pre>' +
                '</div>' +
                '<div class="vibe-results" id="vibe-results"><span class="vibe-dim">no run received yet — results appear here after <code>vibe check</code></span></div>' +
                '<div class="vibe-card-footer">' +
                    hintsHtml +
                    '<span class="vibe-footer-note">graded by the test run, not self-rating · passes advance automatically</span>' +
                '</div>' +
            '</div>';

        container.querySelectorAll('.vibe-hint-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var body = btn.nextElementSibling;
                if (body) { body.hidden = false; btn.style.display = 'none'; }
                if (window.ExerciseProgress) window.ExerciseProgress.update(item.key, { hintsUsed: true });
            });
        });

        // Tell the daemon what's on screen so `vibe next` targets it
        window.VibeBridge.announce({
            key: baseKey,
            variantKey: workspace,
            title: variant.title || ''
        });
    }

    function renderVibeResult(result, quality) {
        var card = document.querySelector('#dp-exercise-container .vibe-card');
        if (!card) return false;
        if (card.dataset.baseKey !== result.key) return false;

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

        if (result.pass && session) {
            setTimeout(function() {
                // Only advance if this card is still the one on screen
                var current = document.querySelector('#dp-exercise-container .vibe-card');
                if (current && current.dataset.baseKey === result.key) SE.nextExercise(session);
            }, 1800);
        }
        return true;
    }

    window.addEventListener('vibeResult', function(e) {
        renderVibeResult(e.detail.result, e.detail.quality);
    });

    window.addEventListener('vibeStatusChanged', function(e) {
        var status = document.getElementById('vibe-watch-status');
        if (status && !e.detail.online) status.textContent = 'daemon offline — run: npm run vibe watch';
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
