/**
 * Vibe Bridge — connects course pages to the local `vibe watch` daemon.
 *
 * The browser is the scheduler; code runs in the user's real editor and is
 * verified by `vibe check` (go vet + go test -race). This bridge:
 *
 *   1. Probes http://127.0.0.1:<port>/health to detect the daemon.
 *   2. Announces the exercise currently on screen (POST /queue) so
 *      `vibe next` scaffolds/points at the right workspace.
 *   3. Polls GET /results and turns fresh test runs into objective SRS
 *      grades: pass on first attempt -> 5, pass after failures -> 3,
 *      fail -> 1. Self-rating is bypassed entirely for these items.
 *
 * Emits window events:
 *   'vibeStatusChanged'  detail: { online: boolean }
 *   'vibeResult'         detail: { result, quality } (after SRS is updated)
 *
 * All calls are safe when the daemon is down — the page falls back to
 * in-browser self-rated cards.
 */
(function() {
    'use strict';

    var isApp = !!window.vibeApp;
    var PORT = 4711;
    if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && location.port) {
        PORT = parseInt(location.port, 10) || PORT;
    }
    try {
        var stored = localStorage.getItem('vibe-learn:vibe-port');
        if (stored && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
            PORT = parseInt(stored, 10) || PORT;
        }
    } catch (e) {}

    var BASE = /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
        ? location.origin
        : 'http://127.0.0.1:' + PORT;
    var POLL_MS = 3000;
    var LAST_SEEN_KEY = window.CourseConfigHelper
        ? window.CourseConfigHelper.storageKey('vibe-last-seen')
        : 'course-vibe-last-seen';

    var online = false;
    var watching = false;
    var workspaceDir = null;
    var workspaces = null;   // array of variantKeys, null until fetched
    var pollTimer = null;
    var currentItem = null;  // { key, variantKey, title }

    function getLastSeen() {
        try { return parseInt(localStorage.getItem(LAST_SEEN_KEY) || '0', 10); }
        catch (e) { return 0; }
    }

    function setLastSeen(ts) {
        try { localStorage.setItem(LAST_SEEN_KEY, String(ts)); } catch (e) {}
    }

    function fetchJson(path, opts, timeoutMs) {
        var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var timer = controller ? setTimeout(function() { controller.abort(); }, timeoutMs || 1500) : null;
        var options = opts || {};
        if (controller) options.signal = controller.signal;
        return fetch(BASE + path, options).then(function(res) {
            if (timer) clearTimeout(timer);
            if (!res.ok) throw new Error('http ' + res.status);
            return res.json();
        }, function(err) {
            if (timer) clearTimeout(timer);
            throw err;
        });
    }

    function setOnline(value, health) {
        var nextWatching = !!(value && health && health.watching);
        var nextWorkspace = health && health.workspaceDir ? health.workspaceDir : workspaceDir;
        if (online === value && watching === nextWatching && workspaceDir === nextWorkspace) return;
        online = value;
        watching = nextWatching;
        workspaceDir = nextWorkspace;
        // Reconnected mid-session: tell the daemon what's on screen
        if (online && currentItem) announce(currentItem);
        window.dispatchEvent(new CustomEvent('vibeStatusChanged', {
            detail: { online: online, watching: watching, workspaceDir: workspaceDir }
        }));
    }

    /**
     * Probe the daemon; resolves to true/false and refreshes the workspace list.
     */
    function probe() {
        return fetchJson('/health').then(function(health) {
            return fetchJson('/exercises').then(function(data) {
                workspaces = data.exercises || [];
                setOnline(true, health);
                return true;
            });
        }).catch(function() {
            setOnline(false, null);
            return false;
        });
    }

    function isOnline() { return online; }
    function isWatching() { return watching; }
    function getWorkspaceDir() { return workspaceDir; }

    /**
     * Does a local go-test workspace exist for this exercise?
     * Accepts a full variant key ("m6_challenge_1_v2") or base key
     * ("m6_challenge_1") — base keys match any variant's workspace.
     */
    function hasWorkspace(key) {
        if (!online || !workspaces) return false;
        if (workspaces.indexOf(key) !== -1) return true;
        for (var i = 0; i < workspaces.length; i++) {
            if (workspaces[i].indexOf(key + '_') === 0) return true;
        }
        return false;
    }

    /** Resolve a base or variant key to a concrete workspace variantKey. */
    function resolveWorkspace(key) {
        if (!workspaces) return null;
        if (workspaces.indexOf(key) !== -1) return key;
        for (var i = 0; i < workspaces.length; i++) {
            if (workspaces[i].indexOf(key + '_') === 0) return workspaces[i];
        }
        return null;
    }

    /**
     * Announce the exercise currently on screen so `vibe next` targets it.
     */
    function announce(item) {
        currentItem = item;
        if (!online) return Promise.resolve(false);
        return fetchJson('/queue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                key: item.key,
                variantKey: resolveWorkspace(item.variantKey || item.key) || item.variantKey || item.key,
                title: item.title || ''
            })
        }, 2500).then(function() { return true; }).catch(function() { return false; });
    }

    // Session-scoped assist/failure tracking so grading reflects *this*
    // sitting, not all-time attempt counts.
    var assists = {};      // baseKey -> 'hint' | 'solution'
    var sessionFails = {}; // baseKey -> count of failed runs seen this session

    function markAssist(key, kind) {
        if (kind === 'solution' || !assists[key]) assists[key] = kind;
    }

    // Objective grading: the test run replaces self-rating.
    // Clean pass -> Easy; pass after hints -> Good; pass after failures or
    // the solution -> Hard; fail -> Again.
    function qualityFromResult(result) {
        if (!result.pass) {
            sessionFails[result.key] = (sessionFails[result.key] || 0) + 1;
            return 1;
        }
        if (assists[result.key] === 'solution') return 3;
        if (sessionFails[result.key] > 0) return 3;
        if (assists[result.key] === 'hint') return 4;
        return 5;
    }

    function handleResult(result) {
        var quality = qualityFromResult(result);
        var srsKey = result.key; // vibe already strips variant suffixes into .key

        if (window.SRS) {
            window.SRS.recordReview(srsKey, quality, currentItem && currentItem.title);
        }
        if (window.ExerciseProgress && result.pass) {
            var progressKey = result.variantKey || srsKey;
            window.ExerciseProgress.update(progressKey, {
                status: 'completed',
                selfRating: quality >= 5 ? 1 : 2,
                gradedBy: 'vibe'
            });
        }
        if (window.Streaks && result.pass) window.Streaks.recordActivity();

        window.dispatchEvent(new CustomEvent('vibeResult', {
            detail: { result: result, quality: quality }
        }));
    }

    function pollOnce() {
        if (!online) return Promise.resolve();
        return fetchJson('/results?since=' + getLastSeen(), null, 2500).then(function(data) {
            (data.results || []).forEach(handleResult);
            if (data.now) setLastSeen(data.now);
        }).catch(function() {
            setOnline(false);
        });
    }

    /**
     * Start the poll loop (idempotent). Re-probes (with backoff) when the
     * daemon is down, so starting `vibe watch` mid-session reconnects.
     */
    function startPolling() {
        if (pollTimer) return;
        // Fast-forward past any results generated while no session was open
        probe().then(function(ok) {
            if (ok) fetchJson('/results?since=0', null, 2500).then(function(data) {
                if (data.now && !getLastSeen()) setLastSeen(data.now);
            }).catch(function() {});
        });
        var tick = 0;
        pollTimer = setInterval(function() {
            tick++;
            if (online) pollOnce();
            else if (tick % 4 === 0) probe(); // offline: back off to ~12s
        }, POLL_MS);
    }

    function stopPolling() {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        currentItem = null;
    }

    // --- Result panes (module pages, exercises pages) ---
    //
    // The renderer marks workspace-backed cards data-objective and emits a
    // .vibe-results-pane; this bridge only fills panes when results land.
    // Self-rating never applies to those cards, connected or not.

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
        });
    }

    // Fill result panes on any page when a run lands
    window.addEventListener('vibeResult', function(e) {
        var result = e.detail.result;
        var paneKey = result.variantKey || result.key;
        document.querySelectorAll('[data-vibe-key="' + paneKey + '"] .vibe-results-pane').forEach(function(pane) {
            var html = '';
            if (result.buildFailed) {
                html += '<div class="vibe-line fail">✗ build failed</div>' +
                    '<div class="vibe-line dim">' + escapeHtml((result.buildOutput || '').split('\n').slice(0, 6).join('\n')) + '</div>';
            } else {
                (result.tests || []).forEach(function(t) {
                    html += '<div class="vibe-line ' + (t.pass ? 'pass' : 'fail') + '">' + (t.pass ? '✓' : '✗') + ' ' + escapeHtml(t.name) + '</div>';
                    if (!t.pass && t.output) {
                        var tail = t.output.split('\n').filter(function(l) { return /---|FAIL|got|want|expected/.test(l); }).slice(0, 3).join('\n');
                        if (tail) html += '<div class="vibe-line dim">' + escapeHtml(tail) + '</div>';
                    }
                });
            }
            if (result.vetOk === false && result.vetOutput) {
                html += '<div class="vibe-line dim">go vet: ' + escapeHtml(result.vetOutput.split('\n')[0]) + '</div>';
            }
            var entry = window.SRS && window.SRS.getAll()[result.key];
            html += '<div class="vibe-line meta">' + (result.pass ? 'passed ✓' : 'failed') +
                ' · attempt ' + result.attempt +
                (entry && entry.interval ? ' · next review in ' + entry.interval + 'd' : '') + '</div>';
            pane.innerHTML = html;
        });
    });

    // --- Connection pill ---
    // Fixed indicator on exercise pages: green when `vibe watch` is
    // connected (tests run on save), amber with the command when not.

    function renderStatusPill(state) {
        var pill = document.getElementById('vibe-status-pill');
        // Lesson pages show workbench status in the rail instead
        if (document.querySelector('.rail-workbench')) {
            if (pill) pill.remove();
            return;
        }
        if (!pill) {
            pill = document.createElement('div');
            pill.id = 'vibe-status-pill';
            pill.className = 'vibe-status-pill';
            pill.title = 'The vibe daemon runs your exercises: edit → save → graded by go test';
            document.body.appendChild(pill);
        }
        if (state === 'online') {
            pill.className = 'vibe-status-pill online';
            pill.innerHTML = '<span class="pill-dot"></span>workbench connected — save a file to run its tests';
        } else if (state === 'offline') {
            pill.className = 'vibe-status-pill offline';
            pill.innerHTML = isApp
                ? '<span class="pill-dot"></span>local runner unavailable — restart the desktop app'
                : '<span class="pill-dot"></span>workbench offline — run <code>node vibe.js watch</code>';
        } else {
            pill.className = 'vibe-status-pill probing';
            pill.innerHTML = '<span class="pill-dot"></span>checking local runner…';
        }
    }

    window.addEventListener('vibeStatusChanged', function(e) {
        if (document.getElementById('vibe-status-pill')) {
            renderStatusPill(e.detail.online ? 'online' : 'offline');
        }
    });

    function autoStart() {
        // Only poll on pages that actually show exercises
        if (document.querySelector('#warmups-container, #challenges-container, .inline-exercises, .exercise[data-exercise-key]')) {
            renderStatusPill('probing');
            probe().then(function(ok) {
                renderStatusPill(ok && (!isApp || isWatching()) ? 'online' : 'offline');
            });
            startPolling();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', autoStart);
    } else {
        autoStart();
    }

    window.VibeBridge = {
        probe: probe,
        isOnline: isOnline,
        isWatching: isWatching,
        getWorkspaceDir: getWorkspaceDir,
        hasWorkspace: hasWorkspace,
        resolveWorkspace: resolveWorkspace,
        announce: announce,
        markAssist: markAssist,
        startPolling: startPolling,
        stopPolling: stopPolling,
        port: PORT
    };
})();
