/**
 * Session Engine — shared session lifecycle for practice plugins
 *
 * Provides queue building, session management, and UI helpers used by
 * both the Algorithm Practice and Daily Practice plugins.
 *
 * @typedef {Object} SessionConfig
 * @property {Object} ids - DOM element IDs: { config, stats, session, label, bar, category, container, complete, results, hint }
 * @property {string} itemLabel - Display label for items (e.g. "Problem", "Exercise")
 * @property {string} accentColor - CSS variable name for accent color (e.g. "purple")
 * @property {function(SessionState): void} onRender - Callback to render current exercise
 * @property {string[]} [extraHideOnStart] - Additional element IDs to hide when session starts
 * @property {string[]} [extraShowOnStart] - Additional element IDs to show when session starts
 * @property {function(SessionState): void} [onSessionStart] - Callback after session UI is shown
 *
 * @typedef {Object} SessionState
 * @property {Array<{key: string}>} queue - Ordered list of exercises to present
 * @property {number} index - Current position in queue
 * @property {{completed: number, skipped: number}} results - Session outcome counters
 * @property {Object} ids - DOM element IDs (from SessionConfig)
 * @property {string} itemLabel - Display label (from SessionConfig)
 * @property {string} accentColor - Accent color (from SessionConfig)
 * @property {function(SessionState): void} onRender - Render callback (from SessionConfig)
 */
(function() {
    'use strict';

    var MIN_SESSION_SIZE = 5;

    // --- Helpers ---

    function shuffle(arr) {
        for (var i = arr.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = arr[i];
            arr[i] = arr[j];
            arr[j] = tmp;
        }
        return arr;
    }

    function setText(id, text) {
        var el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    function show(id) {
        var el = document.getElementById(id);
        if (el) { el.hidden = false; el.style.display = ''; }
    }

    function hide(id) {
        var el = document.getElementById(id);
        if (el) { el.hidden = true; el.style.display = 'none'; }
    }

    // --- Config Button Helpers ---

    /**
     * Wire up an option-button group inside a container.
     *
     * @param {string} containerId   - DOM id of the container element
     * @param {string} btnClass      - CSS class of the buttons (e.g. 'session-option')
     * @param {object} configObj     - Config object to mutate
     * @param {string} configKey     - Key on configObj to set
     * @param {Function|object} [transformOrOpts] - Value transform function, or options object
     * @param {Function} [transformOrOpts.transform] - Optional value transform (e.g. parseInt)
     * @param {Function} [transformOrOpts.onChange]   - Optional callback after value change
     */
    function setupOptionGroup(containerId, btnClass, configObj, configKey, transformOrOpts) {
        var transform = typeof transformOrOpts === 'function' ? transformOrOpts : (transformOrOpts && transformOrOpts.transform);
        var onChange = (transformOrOpts && typeof transformOrOpts === 'object') ? transformOrOpts.onChange : undefined;

        document.querySelectorAll('#' + containerId + ' .' + btnClass).forEach(function(btn) {
            btn.addEventListener('click', function() {
                document.querySelectorAll('#' + containerId + ' .' + btnClass).forEach(function(b) {
                    b.classList.remove('active');
                });
                btn.classList.add('active');
                var val = btn.dataset[configKey];
                configObj[configKey] = transform ? transform(val) : val;
                if (onChange) onChange(configObj[configKey], btn);
            });
        });
    }

    /**
     * Set the active button in an option group (for programmatic selection).
     */
    function setActiveOption(containerId, btnClass, activeBtn) {
        document.querySelectorAll('#' + containerId + ' .' + btnClass).forEach(function(b) {
            b.classList.remove('active');
        });
        activeBtn.classList.add('active');
    }

    // --- SRS Queue Building ---

    /**
     * Build an SRS-based queue (review / weakest / mixed).
     *
     * @param {string} mode      - 'review', 'weakest', or 'mixed'
     * @param {number} count     - Desired queue size
     * @param {Function} filterFn - function(key) => boolean, plugin-specific filter
     * @returns {Array} Array of SRS candidate objects { key, ... }
     */
    function buildSRSQueue(mode, count, filterFn) {
        if (!window.SRS) return [];

        var candidates = [];

        if (mode === 'review') {
            candidates = window.SRS.getDueExercises();
        } else if (mode === 'weakest') {
            candidates = window.SRS.getWeakestExercises(count * 2);
        } else if (mode === 'mixed') {
            var due = window.SRS.getDueExercises();
            var weak = window.SRS.getWeakestExercises(count);
            var seen = {};
            candidates = [];
            due.concat(weak).forEach(function(item) {
                if (!seen[item.key]) {
                    seen[item.key] = true;
                    candidates.push(item);
                }
            });
        }

        if (filterFn) {
            candidates = candidates.filter(function(item) { return filterFn(item.key); });
        }

        return candidates;
    }

    /**
     * Determine the best mode to preselect based on SRS state.
     *
     * @param {Function} filterFn - function(key) => boolean
     * @returns {string} 'review', 'weakest', 'mixed', or 'discover'
     */
    function preselectBestMode(filterFn) {
        if (!window.SRS) return 'discover';

        var due = window.SRS.getDueExercises().filter(function(e) { return filterFn(e.key); });
        var weak = window.SRS.getWeakestExercises(10).filter(function(e) {
            return filterFn(e.key);
        });

        if (due.length >= MIN_SESSION_SIZE) return 'review';
        if (weak.length >= MIN_SESSION_SIZE) return 'weakest';
        if (due.length > 0 || weak.length > 0) return 'mixed';
        return 'discover';
    }

    // --- Session Lifecycle ---

    /**
     * Create a new session object.
     *
     * @param {object} opts - Configuration:
     *   ids: { config, stats, session, label, bar, category, container, complete, results, hint }
     *   itemLabel: 'Problem' or 'Exercise'
     *   accentColor: CSS variable name (e.g. 'purple' or 'orange')
     *   onRender: function(session) called to render the current exercise
     *   extraHideOnStart: array of additional element IDs to hide when starting
     *   extraShowOnStart: array of additional element IDs to show when starting
     *   onSessionStart: optional callback after session UI is shown
     */
    function createSession(opts) {
        return {
            queue: [],
            index: 0,
            results: { completed: 0, skipped: 0 },
            ids: opts.ids || {},
            itemLabel: opts.itemLabel || 'Exercise',
            accentColor: opts.accentColor || 'orange',
            onRender: opts.onRender || null,
            extraHideOnStart: opts.extraHideOnStart || [],
            extraShowOnStart: opts.extraShowOnStart || [],
            onSessionStart: opts.onSessionStart || null
        };
    }

    /**
     * Start a session: hide config/stats, show session area, render first exercise.
     * Returns false if queue is empty (caller should show hint).
     */
    function startSession(session) {
        if (session.queue.length === 0) return false;

        var hintId = session.ids.hint;
        if (hintId) hide(hintId);

        session.index = 0;
        session.results = { completed: 0, skipped: 0 };

        hide(session.ids.config);
        hide(session.ids.stats);

        session.extraHideOnStart.forEach(function(id) { hide(id); });
        session.extraShowOnStart.forEach(function(id) { show(id); });

        show(session.ids.session);

        if (session.onSessionStart) session.onSessionStart(session);
        renderSessionHeader(session);
        if (session.onRender) session.onRender(session);

        return true;
    }

    function nextExercise(session) {
        session.results.completed++;
        if (window.Streaks) window.Streaks.recordActivity();
        advance(session);
    }

    function skipExercise(session) {
        session.results.skipped++;
        advance(session);
    }

    function advance(session) {
        session.index++;
        if (session.index >= session.queue.length) {
            finishSession(session);
        } else {
            renderSessionHeader(session);
            if (session.onRender) session.onRender(session);
        }
    }

    /**
     * Update the session header label and progress bar.
     */
    function renderSessionHeader(session) {
        var labelEl = document.getElementById(session.ids.label);
        if (labelEl) {
            labelEl.innerHTML = session.itemLabel + ' <strong>' + (session.index + 1) +
                '</strong> of <strong>' + session.queue.length + '</strong>';
        }

        var barEl = document.getElementById(session.ids.bar);
        if (barEl) {
            barEl.style.width = (session.index / session.queue.length * 100) + '%';
        }
    }

    /**
     * End the session: hide session area, show completion card with 5-stat results.
     */
    function finishSession(session) {
        hide(session.ids.session);
        show(session.ids.complete);

        var resultsEl = document.getElementById(session.ids.results);
        if (!resultsEl) return;

        var progress = window.ExerciseProgress && window.ExerciseProgress.loadAll ? window.ExerciseProgress.loadAll() : {};
        var gotIt = 0, struggled = 0, peeked = 0;
        session.queue.forEach(function(item) {
            var p = progress[item.key];
            if (p && p.selfRating === 1) gotIt++;
            else if (p && p.selfRating === 2) struggled++;
            else if (p && p.selfRating === 3) peeked++;
        });

        resultsEl.innerHTML =
            '<div class="session-stat">' +
                '<div class="session-stat-value" style="color: var(--green-bright);">' + session.results.completed + '</div>' +
                '<div class="session-stat-label">Completed</div>' +
            '</div>' +
            '<div class="session-stat">' +
                '<div class="session-stat-value" style="color: var(--text-dim);">' + session.results.skipped + '</div>' +
                '<div class="session-stat-label">Skipped</div>' +
            '</div>' +
            '<div class="session-stat">' +
                '<div class="session-stat-value" style="color: var(--green-bright);">' + gotIt + '</div>' +
                '<div class="session-stat-label">Got It</div>' +
            '</div>' +
            '<div class="session-stat">' +
                '<div class="session-stat-value" style="color: var(--orange);">' + struggled + '</div>' +
                '<div class="session-stat-label">Struggled</div>' +
            '</div>' +
            '<div class="session-stat">' +
                '<div class="session-stat-value" style="color: var(--purple);">' + peeked + '</div>' +
                '<div class="session-stat-label">Needed Solution</div>' +
            '</div>';
    }

    // --- Reusable Helpers ---

    /**
     * Update stats display from SRS data.
     *
     * @param {object} elementMap - { due: 'el-id', weak: 'el-id', total: 'el-id' }
     * @param {Function} filterFn - function(key) => boolean
     * @returns {object} { due, weak, total } counts
     */
    function updateStats(elementMap, filterFn) {
        if (!window.SRS) return { due: 0, weak: 0, total: 0 };

        var due = window.SRS.getDueExercises().filter(function(e) { return filterFn(e.key); });
        var weak = window.SRS.getWeakestExercises(50).filter(function(e) {
            return filterFn(e.key);
        });
        var all = window.SRS.getAll();
        var total = Object.keys(all).filter(filterFn).length;

        if (elementMap.due) setText(elementMap.due, due.length);
        if (elementMap.weak) setText(elementMap.weak, weak.length);
        if (elementMap.total) setText(elementMap.total, total);

        return { due: due.length, weak: weak.length, total: total };
    }

    /**
     * Build a discover queue: unseen items first, then seen, shuffled.
     *
     * @param {Array} items - Array of objects, each with a .key property
     * @param {number} count - Desired queue size
     * @returns {Array} Reordered slice of items
     */
    function buildDiscoverQueue(items, count) {
        var srsData = window.SRS ? window.SRS.getAll() : {};

        var unseen = items.filter(function(item) { return !srsData[item.key.replace(/_v\d+$/, '')]; });
        var seen = items.filter(function(item) { return !!srsData[item.key.replace(/_v\d+$/, '')]; });

        shuffle(unseen);
        shuffle(seen);

        return unseen.concat(seen).slice(0, count);
    }

    /**
     * Build an SRS queue with minimum threshold checking and optional padding.
     *
     * @param {string} mode - 'review', 'weakest', or 'mixed'
     * @param {number} count - Desired queue size
     * @param {Function} filterFn - function(key) => boolean
     * @param {object} [opts] - { minThreshold: 5, pad: true }
     * @returns {Array} SRS candidate objects or empty array if below threshold
     */
    function buildPaddedSRSQueue(mode, count, filterFn, opts) {
        opts = opts || {};
        var minThreshold = opts.minThreshold !== undefined ? opts.minThreshold : MIN_SESSION_SIZE;
        var pad = opts.pad !== undefined ? opts.pad : true;

        var candidates = buildSRSQueue(mode, count, filterFn);

        if ((mode === 'review' || mode === 'weakest') && candidates.length < minThreshold) {
            return [];
        }
        if (mode === 'mixed' && candidates.length === 0) {
            return [];
        }

        if (pad && candidates.length < count && window.SRS) {
            var all = window.SRS.getAll();
            var existing = {};
            candidates.forEach(function(c) { existing[c.key] = true; });
            var extras = Object.keys(all)
                .filter(function(key) { return !existing[key] && filterFn(key); })
                .map(function(key) { var item = all[key]; item.key = key; return item; })
                .sort(function() { return Math.random() - 0.5; });
            candidates = candidates.concat(extras);
        }

        return candidates.slice(0, count);
    }

    // --- HTML Utilities ---

    function escapeHtml(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // --- Public API ---

    window.SessionEngine = {
        shuffle: shuffle,
        setText: setText,
        show: show,
        hide: hide,
        setupOptionGroup: setupOptionGroup,
        setActiveOption: setActiveOption,
        buildSRSQueue: buildSRSQueue,
        preselectBestMode: preselectBestMode,
        createSession: createSession,
        startSession: startSession,
        nextExercise: nextExercise,
        skipExercise: skipExercise,
        advance: advance,
        renderSessionHeader: renderSessionHeader,
        finishSession: finishSession,
        updateStats: updateStats,
        buildDiscoverQueue: buildDiscoverQueue,
        buildPaddedSRSQueue: buildPaddedSRSQueue,
        escapeHtml: escapeHtml
    };
})();
