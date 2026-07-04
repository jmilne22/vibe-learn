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

    var PORT = 4711;
    try {
        var stored = localStorage.getItem('vibe-learn:vibe-port');
        if (stored) PORT = parseInt(stored, 10) || PORT;
    } catch (e) {}

    var BASE = 'http://127.0.0.1:' + PORT;
    var POLL_MS = 3000;
    var LAST_SEEN_KEY = window.CourseConfigHelper
        ? window.CourseConfigHelper.storageKey('vibe-last-seen')
        : 'course-vibe-last-seen';

    var online = false;
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

    function setOnline(value) {
        if (online === value) return;
        online = value;
        window.dispatchEvent(new CustomEvent('vibeStatusChanged', { detail: { online: online } }));
    }

    /**
     * Probe the daemon; resolves to true/false and refreshes the workspace list.
     */
    function probe() {
        return fetchJson('/health').then(function() {
            return fetchJson('/exercises').then(function(data) {
                workspaces = data.exercises || [];
                setOnline(true);
                return true;
            });
        }).catch(function() {
            setOnline(false);
            return false;
        });
    }

    function isOnline() { return online; }

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

    // Objective grading: the test run replaces self-rating
    function qualityFromResult(result) {
        if (!result.pass) return 1;                 // Again
        return result.attempt <= 1 ? 5 : 3;         // Easy first try, Hard after fails
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
     * Start the poll loop (idempotent). Re-probes when the daemon is down,
     * so starting `vibe watch` mid-session reconnects automatically.
     */
    function startPolling() {
        if (pollTimer) return;
        // Fast-forward past any results generated while no session was open
        probe().then(function(ok) {
            if (ok) fetchJson('/results?since=0', null, 2500).then(function(data) {
                if (data.now && !getLastSeen()) setLastSeen(data.now);
            }).catch(function() {});
        });
        pollTimer = setInterval(function() {
            if (online) pollOnce();
            else probe();
        }, POLL_MS);
    }

    function stopPolling() {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        currentItem = null;
    }

    window.VibeBridge = {
        probe: probe,
        isOnline: isOnline,
        hasWorkspace: hasWorkspace,
        resolveWorkspace: resolveWorkspace,
        announce: announce,
        startPolling: startPolling,
        stopPolling: stopPolling,
        port: PORT
    };
})();
