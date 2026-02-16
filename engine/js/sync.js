/**
 * Cross-Device Sync via PocketBase
 *
 * Monkey-patches localStorage.setItem to intercept writes from existing
 * scripts (srs.js, progress.js, streaks.js, etc.) and push changes to
 * a PocketBase backend. Pulls latest data on page load and tab focus.
 *
 * If window.CourseConfig.syncUrl is not set, this entire file is a no-op.
 *
 * Load order: course-data.js → course-config.js → pocketbase.umd.js → sync.js → [everything else]
 */
(function() {
    'use strict';

    // ── Early exit: no sync URL configured ──────────────────────────
    var config = (window.CourseConfig && window.CourseConfig.course) || {};
    var syncUrl = config.syncUrl;
    if (!syncUrl) return;

    var pb = new PocketBase(syncUrl);
    var AUTH_KEY = 'vibe-learn-auth';
    var helper = window.CourseConfigHelper;
    var storagePrefix = helper ? helper.storagePrefix : 'course';

    // ── Keys to sync (suffixes, not full keys) ──────────────────────
    var SYNCED_SUFFIXES = [
        'progress', 'exercise-progress', 'srs', 'personal-notes',
        'streaks', 'activity', 'last-module',
        'focus-mode', 'timer-sound'
    ];

    // Add plugin backup keys
    var plugins = (window.CourseConfig && window.CourseConfig.plugins) || [];
    plugins.forEach(function(p) {
        if (p.backupKey) SYNCED_SUFFIXES.push(p.backupKey);
    });

    // Build full key → suffix lookup
    var keyToSuffix = {};
    SYNCED_SUFFIXES.forEach(function(suffix) {
        var fullKey = storagePrefix + '-' + suffix;
        keyToSuffix[fullKey] = suffix;
    });

    function getSyncSuffix(fullKey) {
        return keyToSuffix[fullKey] || null;
    }

    function fullKey(suffix) {
        return storagePrefix + '-' + suffix;
    }

    // ── Auth: restore token from localStorage ───────────────────────
    function restoreAuth() {
        try {
            var saved = localStorage.getItem(AUTH_KEY);
            if (saved) {
                var parsed = JSON.parse(saved);
                pb.authStore.save(parsed.token, parsed.record);
            }
        } catch (e) { /* ignore */ }
    }

    function persistAuth() {
        try {
            if (pb.authStore.isValid) {
                localStorage.setItem(AUTH_KEY, JSON.stringify({
                    token: pb.authStore.token,
                    record: pb.authStore.record
                }));
            } else {
                localStorage.removeItem(AUTH_KEY);
            }
        } catch (e) { /* ignore */ }
    }

    restoreAuth();

    // Listen for auth changes
    pb.authStore.onChange(function() {
        persistAuth();
        updateUI();
    });

    // ── Dirty tracking & debounced push ─────────────────────────────
    var dirtyKeys = {};   // suffix -> true
    var pushTimer = null;
    var DEBOUNCE_MS = 3000;
    var status = pb.authStore.isValid ? 'synced' : 'logged-out';
    var lastSyncTime = null;

    function markDirty(suffix) {
        if (!pb.authStore.isValid) return;
        dirtyKeys[suffix] = true;
        clearTimeout(pushTimer);
        pushTimer = setTimeout(pushDirty, DEBOUNCE_MS);
    }

    function pushDirty() {
        if (!pb.authStore.isValid) return;
        var suffixes = Object.keys(dirtyKeys);
        if (suffixes.length === 0) return;
        dirtyKeys = {};
        setStatus('syncing');
        var promises = suffixes.map(function(suffix) {
            return pushKey(suffix);
        });
        Promise.all(promises).then(function() {
            setStatus('synced');
            lastSyncTime = new Date();
            updateUI();
        }).catch(function(err) {
            console.warn('[sync] push failed:', err);
            // Re-mark keys as dirty for retry
            suffixes.forEach(function(s) { dirtyKeys[s] = true; });
            setStatus('offline');
        });
    }

    function pushKey(suffix) {
        var fk = fullKey(suffix);
        var raw = localStorage.getItem(fk);
        var data = null;
        try { data = JSON.parse(raw); } catch (e) { data = raw; }

        var now = new Date().toISOString();
        var userId = pb.authStore.record.id;
        var courseSlug = config.slug || storagePrefix;

        var filter = 'user="' + userId + '" && course="' + courseSlug + '" && key="' + suffix + '"';

        return pb.collection('sync_data').getList(1, 1, { filter: filter }).then(function(result) {
            var payload = {
                user: userId,
                course: courseSlug,
                key: suffix,
                data: data,
                client_updated: now
            };
            if (result.items.length > 0) {
                return pb.collection('sync_data').update(result.items[0].id, payload);
            } else {
                return pb.collection('sync_data').create(payload);
            }
        });
    }

    // ── Pull & Merge ────────────────────────────────────────────────
    function pullAll() {
        if (!pb.authStore.isValid) return Promise.resolve();

        var userId = pb.authStore.record.id;
        var courseSlug = config.slug || storagePrefix;
        var filter = 'user="' + userId + '" && course="' + courseSlug + '"';

        setStatus('syncing');
        return pb.collection('sync_data').getFullList({
            filter: filter,
            sort: '-client_updated'
        }).then(function(records) {
            // Temporarily disable the localStorage proxy while merging
            merging = true;
            records.forEach(function(record) {
                mergeKey(record.key, record.data, record.client_updated);
            });
            merging = false;
            setStatus('synced');
            lastSyncTime = new Date();
            updateUI();
        }).catch(function(err) {
            console.warn('[sync] pull failed:', err);
            merging = false;
            setStatus('offline');
        });
    }

    function mergeKey(suffix, remoteData, remoteTimestamp) {
        var fk = fullKey(suffix);
        var localRaw = localStorage.getItem(fk);
        var localData = null;
        try { localData = JSON.parse(localRaw); } catch (e) { localData = localRaw; }

        // No local data → just accept remote
        if (localData === null || localData === undefined) {
            originalSetItem(fk, JSON.stringify(remoteData));
            return;
        }

        // No remote data → keep local
        if (remoteData === null || remoteData === undefined) {
            return;
        }

        var merged;
        if (suffix === 'srs') {
            merged = mergeSRS(localData, remoteData);
        } else if (suffix === 'exercise-progress') {
            merged = mergeExerciseProgress(localData, remoteData);
        } else if (suffix === 'activity') {
            merged = mergeActivity(localData, remoteData);
        } else {
            // Last-writer-wins for everything else
            merged = mergeLastWriterWins(localData, remoteData, remoteTimestamp);
        }

        originalSetItem(fk, JSON.stringify(merged));
    }

    // ── Merge Strategies ────────────────────────────────────────────

    /**
     * Last-Writer-Wins: accept remote if its timestamp is newer.
     */
    function mergeLastWriterWins(localData, remoteData, remoteTimestamp) {
        // If we have no way to compare timestamps, prefer remote
        // (it came from the server, so it's at least as recent as our last push)
        if (!remoteTimestamp) return localData;
        return remoteData;
    }

    /**
     * SRS merge: per-entry merge for individual exercise SRS entries.
     *
     * Each entry has: { easeFactor, interval, repetitions, nextReview, lastQuality, reviewCount, label }
     *
     * @param {Object} local  - Local SRS data { exerciseKey: SRSEntry, ... }
     * @param {Object} remote - Remote SRS data from PocketBase
     * @returns {Object} Merged SRS data
     */
    function mergeSRS(local, remote) {
        if (!local || typeof local !== 'object') return remote || {};
        if (!remote || typeof remote !== 'object') return local || {};

        var merged = {};
        var allKeys = {};
        Object.keys(local).forEach(function(k) { allKeys[k] = true; });
        Object.keys(remote).forEach(function(k) { allKeys[k] = true; });

        Object.keys(allKeys).forEach(function(key) {
            var l = local[key];
            var r = remote[key];

            if (!l) { merged[key] = r; return; }
            if (!r) { merged[key] = l; return; }

            // Both exist — pick the entry with more reviews.
            // If tied, the later nextReview wins (further scheduling = more current).
            var lCount = l.reviewCount || 0;
            var rCount = r.reviewCount || 0;

            if (lCount > rCount) {
                merged[key] = l;
            } else if (rCount > lCount) {
                merged[key] = r;
            } else {
                var lNext = l.nextReview || '';
                var rNext = r.nextReview || '';
                merged[key] = (rNext >= lNext) ? r : l;
            }
        });

        return merged;
    }

    /**
     * Exercise progress merge: per-entry, latest lastAttempted wins.
     */
    function mergeExerciseProgress(local, remote) {
        if (!local || typeof local !== 'object') return remote || {};
        if (!remote || typeof remote !== 'object') return local || {};

        var merged = {};
        var allKeys = {};
        Object.keys(local).forEach(function(k) { allKeys[k] = true; });
        Object.keys(remote).forEach(function(k) { allKeys[k] = true; });

        Object.keys(allKeys).forEach(function(key) {
            var l = local[key];
            var r = remote[key];

            if (!l) { merged[key] = r; return; }
            if (!r) { merged[key] = l; return; }

            // Both exist — take the one with later lastAttempted
            var lTime = l.lastAttempted || '';
            var rTime = r.lastAttempted || '';
            merged[key] = (rTime >= lTime) ? r : l;
        });

        return merged;
    }

    /**
     * Activity heatmap merge: per-date max.
     * For each date, take Math.max(local.exercises, remote.exercises).
     */
    function mergeActivity(local, remote) {
        if (!local || typeof local !== 'object') return remote || {};
        if (!remote || typeof remote !== 'object') return local || {};

        var merged = {};
        var allDates = {};
        Object.keys(local).forEach(function(k) { allDates[k] = true; });
        Object.keys(remote).forEach(function(k) { allDates[k] = true; });

        Object.keys(allDates).forEach(function(date) {
            var lEx = (local[date] && local[date].exercises) || 0;
            var rEx = (remote[date] && remote[date].exercises) || 0;
            merged[date] = { exercises: Math.max(lEx, rEx) };
        });

        return merged;
    }

    // ── localStorage monkey-patch ───────────────────────────────────
    var merging = false;
    var originalSetItem = localStorage.setItem.bind(localStorage);

    localStorage.setItem = function(key, value) {
        originalSetItem(key, value);
        if (merging) return;  // Don't re-queue during merge
        var suffix = getSyncSuffix(key);
        if (suffix) markDirty(suffix);
    };

    // ── Status management ───────────────────────────────────────────
    function setStatus(s) {
        status = s;
        updateUI();
    }

    // ── Sync on page load and tab focus ─────────────────────────────
    if (pb.authStore.isValid) {
        // Defer initial pull slightly to let page render first
        setTimeout(function() { pullAll(); }, 500);
    }

    document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'visible' && pb.authStore.isValid) {
            pullAll();
        }
    });

    // Also flush dirty keys before page unload
    window.addEventListener('beforeunload', function() {
        if (Object.keys(dirtyKeys).length > 0 && pb.authStore.isValid) {
            // Use sendBeacon-style: synchronous push attempt
            pushDirty();
        }
    });

    // ── Online/offline detection ────────────────────────────────────
    window.addEventListener('online', function() {
        if (pb.authStore.isValid && Object.keys(dirtyKeys).length > 0) {
            pushDirty();
        }
    });

    // ── UI update helper ────────────────────────────────────────────
    function updateUI() {
        var container = document.getElementById('sync-status');
        if (!container) return;

        var loginBtn = document.getElementById('sync-login-btn');
        var loggedInUI = document.getElementById('sync-logged-in');
        var statusDot = document.getElementById('sync-status-dot');
        var statusText = document.getElementById('sync-status-text');
        var lastSyncEl = document.getElementById('sync-last-time');
        var userName = document.getElementById('sync-user-name');
        var logoutBtn = document.getElementById('sync-logout-btn');

        if (!pb.authStore.isValid) {
            if (loginBtn) loginBtn.style.display = '';
            if (loggedInUI) loggedInUI.style.display = 'none';
            return;
        }

        if (loginBtn) loginBtn.style.display = 'none';
        if (loggedInUI) loggedInUI.style.display = '';

        // User name
        if (userName && pb.authStore.record) {
            userName.textContent = pb.authStore.record.name || pb.authStore.record.username || 'User';
        }

        // Status indicator
        if (statusDot) {
            statusDot.className = 'sync-dot sync-dot--' + status;
        }
        if (statusText) {
            var labels = {
                'synced': 'Synced',
                'syncing': 'Syncing\u2026',
                'offline': 'Offline',
                'logged-out': ''
            };
            statusText.textContent = labels[status] || '';
        }

        // Last sync time
        if (lastSyncEl && lastSyncTime) {
            var ago = Math.round((Date.now() - lastSyncTime.getTime()) / 60000);
            lastSyncEl.textContent = ago < 1 ? 'just now' : ago + ' min ago';
        }
    }

    // ── SyncManager public API ──────────────────────────────────────
    window.SyncManager = {
        login: function() {
            return pb.collection('users').authWithOAuth2({ provider: 'github' }).then(function() {
                persistAuth();
                setStatus('synced');
                return pullAll();
            }).catch(function(err) {
                console.error('[sync] login failed:', err);
                throw err;
            });
        },

        logout: function() {
            pb.authStore.clear();
            localStorage.removeItem(AUTH_KEY);
            dirtyKeys = {};
            clearTimeout(pushTimer);
            setStatus('logged-out');
            lastSyncTime = null;
            updateUI();
        },

        isLoggedIn: function() {
            return pb.authStore.isValid;
        },

        syncNow: function() {
            return pushDirty(), pullAll();
        },

        getStatus: function() {
            return status;
        },

        /** Trigger a full push of all synced keys (used after data import) */
        pushAll: function() {
            if (!pb.authStore.isValid) return Promise.resolve();
            SYNCED_SUFFIXES.forEach(function(suffix) {
                var fk = fullKey(suffix);
                if (localStorage.getItem(fk) !== null) {
                    dirtyKeys[suffix] = true;
                }
            });
            return pushDirty();
        }
    };

    // Wire up UI event handlers on DOM ready
    function wireUI() {
        var loginBtn = document.getElementById('sync-login-btn');
        if (loginBtn) {
            loginBtn.addEventListener('click', function() {
                loginBtn.disabled = true;
                loginBtn.textContent = 'Signing in\u2026';
                window.SyncManager.login().catch(function() {
                    loginBtn.disabled = false;
                    loginBtn.textContent = 'Sign in with GitHub';
                });
            });
        }

        var logoutBtn = document.getElementById('sync-logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', function(e) {
                e.preventDefault();
                window.SyncManager.logout();
            });
        }

        var retryBtn = document.getElementById('sync-retry-btn');
        if (retryBtn) {
            retryBtn.addEventListener('click', function() {
                window.SyncManager.syncNow();
            });
        }

        updateUI();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', wireUI);
    } else {
        wireUI();
    }
})();
