/**
 * Dashboard — module progress tracking and UI wiring
 *
 * @typedef {Object} ModuleProgress
 * @property {boolean} completed - Whether the module is marked complete
 * @property {string|null} lastStudied - ISO 8601 timestamp of last visit
 */

// Progress tracking with localStorage
var STORAGE_KEY = window.CourseConfigHelper ? window.CourseConfigHelper.storageKey('progress') : 'go-course-progress';
var LAST_MODULE_KEY = window.CourseConfigHelper ? window.CourseConfigHelper.storageKey('last-module') : 'go-course-last-module';

// Readiness signal tunables — surface "when can I move on?" on each module card
var READINESS_CHALLENGE_TARGET = 1.0; // fraction of unique challenges with rating ≤ 2
var READINESS_WARMUP_TARGET = 0.7;    // fraction of unique warmups completed
var BOREDOM_VISIT_WINDOW_DAYS = 7;    // module must have been visited within this window
var BOREDOM_STALL_DAYS = 5;           // ...with no new completions for this many days
var STALE_RETURN_DAYS = 14;           // gap that triggers the "pick up at next module?" banner
var DAY_MS = 24 * 60 * 60 * 1000;
var NUDGE_DISMISS_KEY_PREFIX = window.CourseConfigHelper
    ? window.CourseConfigHelper.storageKey('nudge-dismissed-m')
    : 'go-course-nudge-dismissed-m';

function loadProgress() {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : {};
}

// Group all variants of one exercise. Keys look like "m1_warmup_3_v0a"; the
// exercise id we care about is "m1_warmup_3" — variants of the same exercise
// should count once, not three times.
function exerciseIdFromKey(key) {
    const m = key.match(/^(m\d+_(?:warmup|challenge|advanced)_\d+)/);
    return m ? m[1] : null;
}

function computeReadiness(moduleId, warmupTotal, challengeTotal, exerciseProgress) {
    const prefix = 'm' + moduleId + '_';
    // Per unique exercise: best (lowest) selfRating across variants, latest lastAttempted
    const exercises = {}; // exerciseId -> { type, completed, bestRating, lastAttempted }
    Object.keys(exerciseProgress || {}).forEach(function (key) {
        if (key.indexOf(prefix) !== 0) return;
        const exId = exerciseIdFromKey(key);
        if (!exId) return;
        const data = exerciseProgress[key] || {};
        const type = exId.indexOf('_warmup_') > -1 ? 'warmup'
            : exId.indexOf('_challenge_') > -1 ? 'challenge'
            : 'advanced';
        const entry = exercises[exId] || { type: type, completed: false, bestRating: 999, lastAttempted: 0 };
        if (data.status === 'completed') {
            entry.completed = true;
            const rating = typeof data.selfRating === 'number' && data.selfRating > 0 ? data.selfRating : 999;
            if (rating < entry.bestRating) entry.bestRating = rating;
        }
        const t = data.lastAttempted ? Date.parse(data.lastAttempted) : 0;
        if (t && t > entry.lastAttempted) entry.lastAttempted = t;
        exercises[exId] = entry;
    });

    let warmupsCompleted = 0;
    let challengesGood = 0;
    let challengesCompleted = 0;
    let lastCompletionTimestamp = 0;
    Object.values(exercises).forEach(function (e) {
        if (e.lastAttempted > lastCompletionTimestamp) lastCompletionTimestamp = e.lastAttempted;
        if (!e.completed) return;
        if (e.type === 'warmup') warmupsCompleted++;
        if (e.type === 'challenge') {
            challengesCompleted++;
            if (e.bestRating <= 2) challengesGood++;
        }
    });

    const warmupsRatio = warmupTotal > 0 ? warmupsCompleted / warmupTotal : 1;
    const challengesGoodRatio = challengeTotal > 0 ? challengesGood / challengeTotal : 1;
    const anyTouched = warmupsCompleted > 0 || challengesCompleted > 0;

    let state;
    if (challengeTotal === 0 && warmupTotal === 0) {
        state = 'none'; // skip badge entirely; defer to manual checkbox
    } else if (challengesGoodRatio >= READINESS_CHALLENGE_TARGET && warmupsRatio >= READINESS_WARMUP_TARGET) {
        state = 'ready';
    } else if (anyTouched) {
        state = 'in-progress';
    } else {
        state = 'fresh';
    }

    return {
        state: state,
        warmupsCompleted: warmupsCompleted,
        warmupTotal: warmupTotal,
        challengesGood: challengesGood,
        challengesCompleted: challengesCompleted,
        challengeTotal: challengeTotal,
        warmupsRatio: warmupsRatio,
        challengesGoodRatio: challengesGoodRatio,
        lastCompletionTimestamp: lastCompletionTimestamp
    };
}

function renderReadinessBadges(progress, exerciseProgress) {
    const nextHrefs = (window.CourseConfig && window.CourseConfig.nextModuleHrefs) || {};
    document.querySelectorAll('.module-item[data-module]').forEach(function (item) {
        const id = item.dataset.module;
        if (!/^\d+$/.test(id)) return; // skip projects

        const warmupTotal = parseInt(item.dataset.warmups || '0', 10);
        const challengeTotal = parseInt(item.dataset.challenges || '0', 10);
        const badge = item.querySelector('.readiness-badge');
        const cta = item.querySelector('.next-cta');
        if (!badge) return;

        const manuallyCompleted = !!(progress[id] && progress[id].completed);
        const r = computeReadiness(id, warmupTotal, challengeTotal, exerciseProgress);
        const effectiveState = manuallyCompleted ? 'ready' : r.state;

        badge.classList.remove('ready', 'in-progress', 'fresh');
        if (effectiveState === 'ready') {
            badge.classList.add('ready');
            badge.textContent = 'Ready to move on';
        } else if (effectiveState === 'in-progress') {
            badge.classList.add('in-progress');
            badge.textContent = 'Keep going';
        } else if (effectiveState === 'fresh') {
            badge.classList.add('fresh');
            badge.textContent = 'Just getting started';
        } else {
            badge.textContent = '';
        }

        if (cta) {
            const nextHref = nextHrefs[id];
            if (effectiveState === 'ready' && nextHref) {
                cta.href = nextHref;
                cta.textContent = 'Next: Module ' + (parseInt(id, 10) + 1) + ' →';
                cta.classList.remove('hidden');
            } else {
                cta.classList.add('hidden');
            }
        }

        // Boredom hint — only on 'in-progress' state, and only with real data
        const existingHint = item.querySelector('.boredom-hint');
        if (existingHint) existingHint.remove();
        if (effectiveState === 'in-progress' && r.lastCompletionTimestamp) {
            const lastStudied = progress[id] && progress[id].lastStudied
                ? Date.parse(progress[id].lastStudied) : 0;
            const now = Date.now();
            const visitedRecently = lastStudied && (now - lastStudied) <= BOREDOM_VISIT_WINDOW_DAYS * DAY_MS;
            const stalled = (now - r.lastCompletionTimestamp) > BOREDOM_STALL_DAYS * DAY_MS;
            if (visitedRecently && stalled) {
                const hint = document.createElement('span');
                hint.className = 'boredom-hint';
                hint.textContent = 'No new progress in ' + BOREDOM_STALL_DAYS + ' days — try the next module?';
                item.appendChild(hint);
            }
        }
    });
}

function renderStaleReturnBanner(progress, exerciseProgress) {
    const banner = document.getElementById('stale-return-banner');
    if (!banner) return;
    const lastModuleId = localStorage.getItem(LAST_MODULE_KEY);
    if (!lastModuleId || !/^\d+$/.test(lastModuleId)) {
        banner.classList.add('hidden');
        return;
    }
    if (localStorage.getItem(NUDGE_DISMISS_KEY_PREFIX + lastModuleId) === 'true') {
        banner.classList.add('hidden');
        return;
    }
    const lastStudied = progress[lastModuleId] && progress[lastModuleId].lastStudied
        ? Date.parse(progress[lastModuleId].lastStudied) : 0;
    if (!lastStudied) {
        banner.classList.add('hidden');
        return;
    }
    const gap = Date.now() - lastStudied;
    if (gap < STALE_RETURN_DAYS * DAY_MS) {
        banner.classList.add('hidden');
        return;
    }

    const item = document.querySelector('.module-item[data-module="' + lastModuleId + '"]');
    if (!item) {
        banner.classList.add('hidden');
        return;
    }
    const warmupTotal = parseInt(item.dataset.warmups || '0', 10);
    const challengeTotal = parseInt(item.dataset.challenges || '0', 10);
    const r = computeReadiness(lastModuleId, warmupTotal, challengeTotal, exerciseProgress);
    const manuallyCompleted = !!(progress[lastModuleId] && progress[lastModuleId].completed);
    if (r.state !== 'ready' && !manuallyCompleted) {
        banner.classList.add('hidden');
        return;
    }

    const nextHrefs = (window.CourseConfig && window.CourseConfig.nextModuleHrefs) || {};
    const nextHref = nextHrefs[lastModuleId];
    if (!nextHref) {
        banner.classList.add('hidden');
        return;
    }

    const nextNum = parseInt(lastModuleId, 10) + 1;
    banner.innerHTML =
        '<span class="banner-text">' +
            '<strong>Welcome back.</strong> You cleared most of Module ' + lastModuleId +
            ' — pick up at Module ' + nextNum + '?' +
        '</span>' +
        '<a class="banner-action" href="' + nextHref + '">Take me there</a>' +
        '<button class="banner-dismiss" type="button">Dismiss</button>';
    banner.classList.remove('hidden');

    const dismissBtn = banner.querySelector('.banner-dismiss');
    if (dismissBtn) {
        dismissBtn.addEventListener('click', function () {
            localStorage.setItem(NUDGE_DISMISS_KEY_PREFIX + lastModuleId, 'true');
            banner.classList.add('hidden');
        });
    }
}

function saveProgress(moduleId, completed) {
    const progress = loadProgress();
    progress[moduleId] = {
        completed,
        lastStudied: completed ? new Date().toISOString() : (progress[moduleId]?.lastStudied || null)
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    updateStats();
}

function updateStats() {
    const progress = loadProgress();
    const moduleItems = document.querySelectorAll('.module-item[data-module]');
    const total = Array.from(moduleItems).filter(function (el) {
        return /^\d+$/.test(el.dataset.module);
    }).length;
    const completed = Object.values(progress).filter(function (p) { return p.completed; }).length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    var completedEl = document.getElementById('completed-count');
    if (completedEl) completedEl.textContent = completed;
    var percentEl = document.getElementById('progress-percent');
    if (percentEl) percentEl.textContent = percent + '%';

    // Exercise-level progress from progress.js API
    const exerciseProgress = window.ExerciseProgress ? window.ExerciseProgress.loadAll() : {};
    const exercisesByModule = {};
    let totalExercises = 0;

    Object.entries(exerciseProgress).forEach(function ([key, data]) {
        if (data.status === 'completed') {
            const match = key.match(/^m(\d+)_/);
            if (match) {
                const mod = match[1];
                exercisesByModule[mod] = (exercisesByModule[mod] || 0) + 1;
                totalExercises++;
            }
        }
    });

    const exercisesEl = document.getElementById('exercises-count');
    if (exercisesEl) exercisesEl.textContent = totalExercises;

    // SRS due count
    const dueEl = document.getElementById('due-count');
    var dueCount = 0;
    if (window.SRS) {
        dueCount = window.SRS.getDueCount();
    }
    if (dueEl) {
        dueEl.textContent = dueCount;
    }

    // Today's Focus section
    var todayDueCount = document.getElementById('today-due-count');
    if (todayDueCount) {
        todayDueCount.textContent = dueCount;
        if (dueCount === 0) {
            todayDueCount.classList.add('zero');
        } else {
            todayDueCount.classList.remove('zero');
        }
    }

    // Segmented progress bar
    var segmentsEl = document.getElementById('progress-segments');
    if (segmentsEl && moduleItems.length > 0) {
        segmentsEl.innerHTML = '';
        Array.from(moduleItems).filter(function(el) {
            return /^\d+$/.test(el.dataset.module);
        }).forEach(function(el) {
            var mid = el.dataset.module;
            var seg = document.createElement('div');
            seg.className = 'progress-segment';
            if (progress[mid] && progress[mid].completed) {
                seg.classList.add('complete');
            } else if (progress[mid] && progress[mid].lastStudied) {
                seg.classList.add('in-progress');
            }
            segmentsEl.appendChild(seg);
        });
    }

    // Streak stats
    if (window.Streaks) {
        const sc = document.getElementById('streak-current');
        const sl = document.getElementById('streak-longest');
        const st = document.getElementById('streak-today');
        if (sc) sc.textContent = Streaks.getCurrent();
        if (sl) sl.textContent = Streaks.getLongest();
        if (st) st.textContent = Streaks.getTodayCount();
        const heatmap = document.getElementById('activity-heatmap');
        if (heatmap) Streaks.renderHeatmap(heatmap);
    }

    // Update UI for all module items (numeric and project)
    moduleItems.forEach(function (item) {
        const id = item.dataset.module;
        const checkbox = item.querySelector('.module-checkbox');
        const lastStudied = item.querySelector('.last-studied');
        const exProgress = item.querySelector('.exercise-progress-inline');

        if (checkbox && progress[id]) {
            checkbox.checked = progress[id].completed;
            if (progress[id].completed) {
                item.classList.add('completed');
            }
            if (progress[id].lastStudied && lastStudied) {
                const date = new Date(progress[id].lastStudied);
                lastStudied.textContent = date.toLocaleDateString();
            }
        }

        // Show exercise completion count per module (numeric only)
        if (exProgress && exercisesByModule[id]) {
            const count = exercisesByModule[id];
            exProgress.innerHTML = '<span class="exercise-progress-bar"><span class="exercise-progress-fill" style="width: 100%"></span></span> ' + count + ' done';
        }
    });

    renderReadinessBadges(progress, exerciseProgress);
    renderStaleReturnBanner(progress, exerciseProgress);
}

function recordModuleVisit(moduleId) {
    localStorage.setItem(LAST_MODULE_KEY, moduleId);
    const progress = loadProgress();
    if (!progress[moduleId]) {
        progress[moduleId] = { completed: false };
    }
    progress[moduleId].lastStudied = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

function resumeLastModule(e) {
    e.preventDefault();
    const lastModule = localStorage.getItem(LAST_MODULE_KEY);
    if (lastModule) {
        // Find the correct page for this module (handles split modules)
        var pages = (window.CourseConfig && window.CourseConfig.sidebarPages) || [];
        var page = pages.find(function(p) {
            return (p.type === 'module' && String(p.id) === String(lastModule)) ||
                   (p.type === 'section' && String(p.moduleId) === String(lastModule) && p.sectionIndex === 0);
        });
        window.location.href = page ? page.file : ('module' + lastModule + '.html');
    } else {
        window.location.href = 'module0.html';
    }
}


function exportNotes() {
    var notesKey = window.CourseConfigHelper ? window.CourseConfigHelper.storageKey('personal-notes') : 'go-course-personal-notes';
    const allNotes = JSON.parse(localStorage.getItem(notesKey) || '{}');

    if (Object.keys(allNotes).length === 0) {
        alert('No notes to export yet!');
        return;
    }

    // Group notes by section
    const grouped = {
        warmups: [],
        challenges: [],
        advanced: []
    };

    Object.entries(allNotes).forEach(function ([key, note]) {
        if (note.trim() === '') return; // Skip empty notes

        const [exerciseId, variantId] = key.split('_');
        const section = exerciseId.replace(/[0-9]/g, ''); // warmup, challenge, advanced

        let title = key;
        if (exerciseId.startsWith('warmup')) {
            title = 'Warmup ' + exerciseId.replace('warmup', '') + ' - Variant ' + variantId.replace('v', '');
        } else if (exerciseId.startsWith('challenge')) {
            title = 'Challenge ' + exerciseId.replace('challenge', '') + ' - Variant ' + variantId.replace('v', '');
        } else if (exerciseId.startsWith('advanced')) {
            title = 'Advanced ' + exerciseId.replace('advanced', '') + ' - Variant ' + variantId.replace('v', '');
        }

        const item = { title: title, note: note };

        if (section === 'warmup') {
            grouped.warmups.push(item);
        } else if (section === 'challenge') {
            grouped.challenges.push(item);
        } else if (section === 'advanced') {
            grouped.advanced.push(item);
        }
    });

    // Generate Markdown
    let markdown = '# Go Course - Personal Notes\n\n';
    markdown += 'Exported on ' + new Date().toLocaleDateString() + ' at ' + new Date().toLocaleTimeString() + '\n\n';
    markdown += '---\n\n';

    if (grouped.warmups.length > 0) {
        markdown += '## Warmups\n\n';
        grouped.warmups.forEach(function (entry) {
            markdown += '### ' + entry.title + '\n\n' + entry.note + '\n\n---\n\n';
        });
    }

    if (grouped.challenges.length > 0) {
        markdown += '## Challenges\n\n';
        grouped.challenges.forEach(function (entry) {
            markdown += '### ' + entry.title + '\n\n' + entry.note + '\n\n---\n\n';
        });
    }

    if (grouped.advanced.length > 0) {
        markdown += '## Advanced\n\n';
        grouped.advanced.forEach(function (entry) {
            markdown += '### ' + entry.title + '\n\n' + entry.note + '\n\n---\n\n';
        });
    }

    // Create and download file
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    var downloadPrefix = (window.CourseConfigHelper ? window.CourseConfigHelper.slug : 'go-course') + '-notes-';
    a.download = downloadPrefix + new Date().toISOString().split('T')[0] + '.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function clearProgress() {
    if (confirm('Clear all progress? This cannot be undone.')) {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(LAST_MODULE_KEY);
        var _sk = window.CourseConfigHelper ? function(s) { return window.CourseConfigHelper.storageKey(s); } : function(s) { return 'go-course-' + s; };
        localStorage.removeItem(_sk('exercise-progress'));
        localStorage.removeItem(_sk('srs'));
        localStorage.removeItem(_sk('streaks'));
        localStorage.removeItem(_sk('activity'));
        location.reload();
    }
}

// Wire up event listeners on DOMContentLoaded
document.addEventListener('DOMContentLoaded', function () {
    updateStats();
    if (window.updateSessionTimer) {
        window.updateSessionTimer();
    }

    // Module checkboxes
    document.querySelectorAll('.module-checkbox').forEach(function (checkbox) {
        checkbox.addEventListener('change', function (e) {
            var item = e.target.closest('.module-item');
            var moduleId = item ? item.dataset.module : e.target.id.replace('m', '');

            saveProgress(moduleId, e.target.checked);

            if (item) {
                if (e.target.checked) {
                    item.classList.add('completed');
                } else {
                    item.classList.remove('completed');
                }
            }
        });
    });

    // Track clicks on module links
    document.querySelectorAll('.module-link').forEach(function (link) {
        link.addEventListener('click', function () {
            var moduleId = link.closest('[data-module]').dataset.module;
            recordModuleVisit(moduleId);
        });
    });

    // Session duration select
    var sessionDuration = document.getElementById('session-duration');
    if (sessionDuration) {
        sessionDuration.addEventListener('change', function () {
            window.updateSessionDuration && window.updateSessionDuration(this.value);
        });
    }

    // Start session button
    var startBtn = document.getElementById('start-session-btn');
    if (startBtn) {
        startBtn.addEventListener('click', function () {
            var duration = document.getElementById('session-duration').value;
            window.startTimerSession && window.startTimerSession(duration);
        });
    }

    // Resume last module
    var resumeBtn = document.getElementById('resume-btn');
    if (resumeBtn) {
        resumeBtn.addEventListener('click', resumeLastModule);
    }

    // Export Notes
    var exportNotesBtn = document.getElementById('export-notes-btn');
    if (exportNotesBtn) {
        exportNotesBtn.addEventListener('click', exportNotes);
    }

    // Export All Data
    var exportAllBtn = document.getElementById('export-all-btn');
    if (exportAllBtn) {
        exportAllBtn.addEventListener('click', function () {
            window.exportAllData && window.exportAllData();
        });
    }

    // Import Data
    var importInput = document.getElementById('import-data-input');
    if (importInput) {
        importInput.addEventListener('change', function () {
            window.importAllData && window.importAllData(this.files[0]);
        });
    }

    // Clear All Progress
    var clearBtn = document.getElementById('clear-progress-btn');
    if (clearBtn) {
        clearBtn.addEventListener('click', clearProgress);
    }

    // Nuke Everything
    var nukeBtn = document.getElementById('nuke-btn');
    if (nukeBtn) {
        nukeBtn.addEventListener('click', function () {
            window.nukeEverything && window.nukeEverything();
        });
    }

    // Session control buttons
    var toggleBtn = document.querySelector('[data-session-action="toggle"]');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', function () {
            window.sessionToggle && window.sessionToggle();
        });
    }

    var resetBtn = document.querySelector('[data-session-action="reset"]');
    if (resetBtn) {
        resetBtn.addEventListener('click', function () {
            window.sessionReset && window.sessionReset();
        });
    }

    var soundBtn = document.getElementById('sound-toggle');
    if (soundBtn) {
        soundBtn.addEventListener('click', function () {
            window.toggleTimerSound && window.toggleTimerSound();
        });
    }

    // Register service worker (progressive enhancement)
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(function () {});
    }
});
