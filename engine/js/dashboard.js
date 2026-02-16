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

function loadProgress() {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : {};
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
    if (dueEl && window.SRS) {
        dueEl.textContent = window.SRS.getDueCount();
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
        window.location.href = 'module' + lastModule + '.html';
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
