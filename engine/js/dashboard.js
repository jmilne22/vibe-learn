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
    // Per unique exercise: best (lowest) selfRating across variants
    const exercises = {}; // exerciseId -> { type, completed, bestRating }
    Object.keys(exerciseProgress || {}).forEach(function (key) {
        if (key.indexOf(prefix) !== 0) return;
        const exId = exerciseIdFromKey(key);
        if (!exId) return;
        const data = exerciseProgress[key] || {};
        const type = exId.indexOf('_warmup_') > -1 ? 'warmup'
            : exId.indexOf('_challenge_') > -1 ? 'challenge'
            : 'advanced';
        const entry = exercises[exId] || { type: type, completed: false, bestRating: 999 };
        if (data.status === 'completed') {
            entry.completed = true;
            const rating = typeof data.selfRating === 'number' && data.selfRating > 0 ? data.selfRating : 999;
            if (rating < entry.bestRating) entry.bestRating = rating;
        }
        exercises[exId] = entry;
    });

    let warmupsCompleted = 0;
    let challengesGood = 0;
    let challengesCompleted = 0;
    Object.values(exercises).forEach(function (e) {
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

    return { state: state };
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

        badge.classList.remove('ready', 'in-progress', 'fresh', 'complete', 'none');
        item.classList.remove('is-ready', 'is-in-progress', 'is-fresh', 'is-complete');

        if (manuallyCompleted) {
            badge.classList.add('complete');
            badge.textContent = 'Complete';
            item.classList.add('is-complete');
        } else if (effectiveState === 'ready') {
            badge.classList.add('ready');
            badge.textContent = 'Ready to advance';
            item.classList.add('is-ready');
        } else if (effectiveState === 'in-progress') {
            badge.classList.add('in-progress');
            badge.textContent = 'In progress';
            item.classList.add('is-in-progress');
        } else if (effectiveState === 'none') {
            badge.classList.add('none');
            badge.textContent = 'Reference';
            item.classList.add('is-fresh');
        } else {
            badge.classList.add('fresh');
            badge.textContent = 'Not started';
            item.classList.add('is-fresh');
        }

        if (cta) {
            const nextHref = nextHrefs[id];
            if (effectiveState === 'ready' && nextHref) {
                cta.href = nextHref;
                cta.textContent = 'Next module';
                cta.classList.remove('hidden');
            } else {
                cta.classList.add('hidden');
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
    const numericModuleItems = Array.from(moduleItems).filter(function (el) {
        return /^\d+$/.test(el.dataset.module);
    });
    const total = numericModuleItems.length;
    const completed = numericModuleItems.filter(function (el) {
        const entry = progress[el.dataset.module];
        return entry && entry.completed;
    }).length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    var completedEl = document.getElementById('completed-count');
    if (completedEl) completedEl.textContent = completed;
    var totalEl = document.getElementById('total-modules-count');
    if (totalEl) totalEl.textContent = total;
    var percentEl = document.getElementById('progress-percent');
    if (percentEl) percentEl.textContent = percent + '%';
    var overallProgressValue = document.getElementById('overall-progress-value');
    if (overallProgressValue) overallProgressValue.textContent = percent + '%';
    var overallProgressFill = document.getElementById('overall-progress-fill');
    if (overallProgressFill) overallProgressFill.style.width = percent + '%';
    var moduleProgressLabel = document.getElementById('module-progress-label');
    if (moduleProgressLabel) {
        moduleProgressLabel.textContent = completed === 0
            ? 'Not started'
            : completed === total
                ? 'Course complete'
                : completed + ' of ' + total + ' modules';
    }

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
    const todayExerciseLabel = document.getElementById('today-exercise-label');
    if (todayExerciseLabel) {
        todayExerciseLabel.textContent = totalExercises === 0 ? 'No reps yet' : 'Practice reps logged';
    }

    // SRS due count
    const dueEl = document.getElementById('due-count');
    var dueCount = 0;
    var weakCount = 0;
    if (window.SRS) {
        dueCount = window.SRS.getDueCount();
        weakCount = window.SRS.getWeakestExercises ? window.SRS.getWeakestExercises(10).length : 0;
    }
    if (dueEl) {
        dueEl.textContent = dueCount;
    }
    const todayDueLabel = document.getElementById('today-due-label');
    if (todayDueLabel) {
        todayDueLabel.textContent = dueCount === 0 ? 'Nothing due' : 'Ready for review';
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

    updateTodayPanel(progress, dueCount, weakCount, percent);

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
        const sli = document.getElementById('streak-longest-inline');
        const st = document.getElementById('streak-today');
        if (sc) sc.textContent = Streaks.getCurrent();
        if (sl) sl.textContent = Streaks.getLongest();
        if (sli) sli.textContent = Streaks.getLongest();
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
        } else if (checkbox) {
            checkbox.checked = false;
            item.classList.remove('completed');
        }
        if (progress[id] && progress[id].lastStudied && lastStudied) {
            const date = new Date(progress[id].lastStudied);
            lastStudied.textContent = 'Last studied ' + date.toLocaleDateString();
        } else if (lastStudied) {
            lastStudied.textContent = '';
        }

        // Show exercise completion count per module (numeric only)
        if (exProgress && exercisesByModule[id]) {
            const count = exercisesByModule[id];
            exProgress.innerHTML = '<span class="exercise-progress-bar"><span class="exercise-progress-fill" style="width: 100%"></span></span> ' + count + ' done';
        } else if (exProgress) {
            exProgress.innerHTML = '';
        }
    });

    renderReadinessBadges(progress, exerciseProgress);
    renderStaleReturnBanner(progress, exerciseProgress);

    // Session-first surfaces (no-ops on pages without the new markup)
    renderSessionPlan(progress);
    renderMemoryPanel();
    renderMasteryMap(progress);
}

function findModulePage(moduleId) {
    var pages = (window.CourseConfig && window.CourseConfig.sidebarPages) || [];
    var page = pages.find(function(p) {
        return (p.type === 'module' && String(p.id) === String(moduleId)) ||
               (p.type === 'section' && String(p.moduleId) === String(moduleId) && p.sectionIndex === 0);
    });
    return page ? page.file : ('module' + moduleId + '.html');
}

function updateTodayPanel(progress, dueCount, weakCount, percent) {
    var title = document.getElementById('today-primary-title');
    var meta = document.getElementById('today-primary-meta');
    var action = document.getElementById('resume-btn');
    var heading = document.getElementById('course-progress-heading');
    var copy = document.getElementById('course-progress-copy');
    if (!title || !meta || !action) return;

    action.removeAttribute('data-href');
    action.textContent = 'Continue learning';

    if (dueCount > 0) {
        title.textContent = dueCount + ' review' + (dueCount === 1 ? '' : 's') + ' due';
        meta.textContent = 'Start with spaced repetition while the material is ready to be reinforced.';
        action.textContent = 'Start daily practice';
        action.setAttribute('data-href', 'daily-practice.html');
    } else {
        var lastModule = localStorage.getItem(LAST_MODULE_KEY);
        if (lastModule && /^\d+$/.test(lastModule)) {
            var moduleName = window.CourseConfigHelper ? window.CourseConfigHelper.getModuleName(parseInt(lastModule, 10)) : ('Module ' + lastModule);
            title.textContent = 'Continue ' + moduleName;
            meta.textContent = weakCount > 0
                ? weakCount + ' weak area' + (weakCount === 1 ? '' : 's') + ' will stay queued for practice.'
                : 'No review is due right now. Keep the path moving while the context is warm.';
            action.textContent = 'Resume module';
            action.setAttribute('data-href', findModulePage(lastModule));
        } else {
            title.textContent = 'Start the course path';
            meta.textContent = 'Begin with the reference module, then move into the first hands-on bootcamp.';
            action.textContent = 'Start Module 00';
            action.setAttribute('data-href', 'module0.html');
        }
    }

    if (heading) {
        heading.textContent = percent === 0
            ? 'Your course spine is ready.'
            : percent === 100
                ? 'The full path is complete.'
                : 'You are ' + percent + '% through the path.';
    }
    if (copy) {
        copy.textContent = dueCount > 0
            ? 'Review is waiting. Clear it first, then continue the next module.'
            : 'No due review is blocking you. Continue the path or start a timed study block.';
    }
}

// --- Session-first dashboard (today's session, memory panel, mastery map) ---

var SESSION_PLAN_KEY = 'vibe-learn:session-plan';

function escapeHtmlDash(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
}

function recallColor(recall) {
    if (recall >= 0.85) return 'var(--green-bright)';
    if (recall >= 0.7) return 'var(--orange)';
    return 'var(--red)';
}

function buildSessionPlanData(progress) {
    var cfg = window.CourseConfig || {};
    var dueCount = window.SRS ? window.SRS.getDueCount() : 0;
    var summary = window.SRS && window.SRS.getMemorySummary ? window.SRS.getMemorySummary() : { count: 0, avgRecall: null };

    // Learn target: the module being studied, or the first not-completed one
    var learn = null;
    var lastModule = localStorage.getItem(LAST_MODULE_KEY);
    var numericModules = (cfg.modules || []).filter(function (m) { return /^\d+$/.test(String(m.id)); });
    var learnModule = null;
    if (lastModule && /^\d+$/.test(lastModule) && !(progress[lastModule] && progress[lastModule].completed)) {
        learnModule = numericModules.find(function (m) { return String(m.id) === String(lastModule); }) || null;
    }
    if (!learnModule) {
        learnModule = numericModules.find(function (m) {
            return m.id > 0 && !(progress[m.id] && progress[m.id].completed);
        }) || null;
    }
    if (learnModule) {
        learn = {
            moduleId: learnModule.id,
            label: 'Module ' + learnModule.id + ' · ' + learnModule.title,
            href: findModulePage(learnModule.id)
        };
    }

    // Build target: first project milestone not manually completed
    var build = null;
    var projects = cfg.projects || [];
    for (var i = 0; i < projects.length; i++) {
        var p = projects[i];
        if (progress[p.id] && progress[p.id].completed) continue;
        build = { label: p.title, href: (p.file || p.id) + '.html', afterModule: p.afterModule };
        break;
    }

    // Mastery gate: a prerequisite module fading below 70% pulls its items
    // into today's review before new material unlocks.
    var gate = null;
    if (learn && window.SRS && window.SRS.getFadingModules) {
        var fadingModules = window.SRS.getFadingModules().filter(function (f) {
            return parseInt(f.moduleNum, 10) < learn.moduleId;
        });
        if (fadingModules.length > 0) {
            gate = {
                modules: fadingModules.map(function (f) {
                    return { moduleNum: parseInt(f.moduleNum, 10), recall: f.recall };
                }),
                blockedModuleId: learn.moduleId
            };
        }
    }

    var reviewMin = Math.round(dueCount * 1.25) + (gate ? 5 : 0);
    var minutes = (learn && !gate ? 3 + 9 : 0) + reviewMin + (build ? 3 : 0);
    minutes = Math.max(10, Math.round(minutes / 5) * 5);

    return { dueCount: dueCount, tracked: summary.count, learn: learn, build: build, gate: gate, minutes: minutes, reviewMin: reviewMin };
}

function renderSessionPlan(progress) {
    var segments = document.getElementById('session-segments');
    if (!segments) return;

    var plan = buildSessionPlanData(progress);

    var kicker = document.getElementById('session-plan-kicker');
    if (kicker) {
        var d = new Date();
        var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        kicker.textContent = 'Today · ' + days[d.getDay()] + ' ' + months[d.getMonth()] + ' ' + d.getDate();
    }

    var title = document.getElementById('session-plan-title');
    if (title) title.textContent = 'One session. ' + plan.minutes + ' minutes.';

    var rows = '';
    function row(color, name, desc, est) {
        return '<div class="session-segment"><span class="segment-dot" style="background:' + color + '"></span>' +
            '<span class="segment-name">' + name + '</span>' +
            '<span class="segment-desc">' + desc + '</span>' +
            '<span class="segment-est">' + est + '</span></div>';
    }

    if (plan.gate) {
        var worst = plan.gate.modules[0];
        rows += row('var(--red)', 'Gate',
            'Module ' + worst.moduleNum + ' recall is at <strong>' + Math.round(worst.recall * 100) + '%</strong> — ' +
            'its items lead today’s review; Module ' + plan.gate.blockedModuleId + ' unlocks at 70%', 'first');
    } else if (plan.learn) {
        rows += row('var(--purple)', 'Pretest', escapeHtmlDash(plan.learn.label) + ' — commit to answers before you read', '~3 min');
        rows += row('var(--cyan)', 'Learn', '<a href="' + plan.learn.href + '">' + escapeHtmlDash(plan.learn.label) + '</a> — worked example → fill the gaps → from scratch', '~9 min');
    }
    if (plan.dueCount > 0 || plan.gate) {
        var fading = window.SRS && window.SRS.getFadingConcepts ? window.SRS.getFadingConcepts(4) : [];
        var conceptNames = fading.map(function (f) { return escapeHtmlDash(String(f.concept).toLowerCase()); }).join(' · ');
        rows += row('var(--orange)', 'Review',
            (plan.dueCount > 0 ? plan.dueCount + ' due item' + (plan.dueCount === 1 ? '' : 's') : 'fading items') +
            ', interleaved' + (conceptNames ? ' — ' + conceptNames : ''), '~' + Math.max(plan.reviewMin, 1) + ' min');
    }
    if (plan.build) {
        rows += row('var(--green-bright)', 'Build', '<a href="' + escapeHtmlDash(plan.build.href) + '">' + escapeHtmlDash(plan.build.label) + '</a> — wire in what you just practiced', '~3 min');
    }
    if (!rows) {
        rows = '<div class="session-segment"><span class="segment-dot" style="background:var(--purple)"></span>' +
            '<span class="segment-name">Start</span><span class="segment-desc">Begin with the first module — the memory model takes over from there</span><span class="segment-est">~10 min</span></div>';
    }
    segments.innerHTML = rows;

    // Start CTA: the unified session runner (pretest → learn → review → build)
    var start = document.getElementById('start-today-session');
    var alt = document.getElementById('session-cta-alt');
    if (start) {
        if (plan.dueCount > 0 || plan.tracked > 0 || plan.learn || plan.build) {
            start.href = 'daily-practice.html?today=1';
        } else {
            start.href = 'module0.html';
        }
    }
    if (alt) {
        if (plan.dueCount > 0) {
            alt.innerHTML = 'or <a href="daily-practice.html?autostart&mode=review&count=' +
                Math.min(plan.dueCount, 14) + '">just the ' + plan.dueCount + ' review' +
                (plan.dueCount === 1 ? '' : 's') + '</a> (~' + Math.max(plan.reviewMin, 1) + ' min)';
        } else if (plan.tracked > 0) {
            alt.textContent = 'nothing due — the review segment mixes weak and recent items';
        } else {
            alt.textContent = '';
        }
    }

    // Hand the plan to the session page so "Session Complete" links onward
    try {
        sessionStorage.setItem(SESSION_PLAN_KEY, JSON.stringify({
            learn: plan.learn, build: plan.build, gate: plan.gate, savedAt: Date.now()
        }));
    } catch (e) {}
}

function renderMemoryPanel() {
    var recallEl = document.getElementById('memory-recall');
    if (!recallEl || !window.SRS || !window.SRS.getMemorySummary) return;

    var summary = window.SRS.getMemorySummary();
    recallEl.textContent = summary.avgRecall === null ? '–' : Math.round(summary.avgRecall * 100) + '%';
    var countEl = document.getElementById('memory-count');
    if (countEl) {
        countEl.textContent = summary.count;
        var countLabel = countEl.parentNode;
        if (countLabel) {
            countLabel.innerHTML = 'predicted recall across <span id="memory-count">' + summary.count +
                '</span> learned item' + (summary.count === 1 ? '' : 's');
        }
    }

    var list = document.getElementById('fading-list');
    if (list) {
        var fading = window.SRS.getFadingConcepts ? window.SRS.getFadingConcepts(4) : [];
        var label = list.parentNode && list.parentNode.querySelector('.memory-fading-label');
        if (label) {
            // Don't cry wolf: only call it "fading" when something actually is
            label.textContent = (fading.length > 0 && fading[0].recall < 0.85) ? 'Fading fastest' : 'Tracked concepts';
        }
        if (fading.length === 0) {
            list.innerHTML = '<div class="fading-empty">Nothing tracked yet — rate a few exercises first.</div>';
        } else {
            list.innerHTML = fading.map(function (f) {
                var pct = Math.round(f.recall * 100);
                return '<div class="fading-row">' +
                    '<span class="fading-name">' + escapeHtmlDash(f.concept) + '</span>' +
                    '<span class="fading-track"><span class="fading-fill" style="width:' + pct + '%;background:' + recallColor(f.recall) + '"></span></span>' +
                    '<span class="fading-pct" style="color:' + recallColor(f.recall) + '">' + pct + '%</span>' +
                    '</div>';
            }).join('');
        }
    }

    var foot = document.getElementById('memory-footnote');
    if (foot && window.SRS.getDueCount) {
        var due = window.SRS.getDueCount();
        foot.textContent = due > 0
            ? 'Today’s ' + due + ' review' + (due === 1 ? '' : 's') + ' target exactly these. Skip a day and the queue grows; nothing is ever “lost”, it just comes back sooner.'
            : (summary.count > 0
                ? 'Nothing due right now — the model schedules each item just before you’d forget it.'
                : 'Complete and rate exercises and the memory model starts scheduling reviews for you.');
    }
}

function renderMasteryMap(progress) {
    var rowsEl = document.getElementById('mastery-rows');
    if (!rowsEl) return;
    var cfg = window.CourseConfig || {};
    var tracks = cfg.tracks || [];
    if (tracks.length === 0) { rowsEl.innerHTML = ''; return; }

    var moduleRecall = window.SRS && window.SRS.getModuleRecall ? window.SRS.getModuleRecall() : {};
    var modulesById = {};
    (cfg.modules || []).forEach(function (m) { modulesById[m.id] = m; });
    var projectsAfter = {};
    (cfg.projects || []).forEach(function (p) {
        if (p.afterModule !== undefined) projectsAfter[p.afterModule] = p;
    });
    var lastModule = localStorage.getItem(LAST_MODULE_KEY);

    var html = '';
    tracks.forEach(function (track) {
        var chips = '';
        (track.modules || []).forEach(function (modId) {
            var mod = modulesById[modId];
            if (!mod || modId === 0) return;
            var rec = moduleRecall[modId];
            var isCurrent = String(modId) === String(lastModule) && !(progress[modId] && progress[modId].completed);
            var title = escapeHtmlDash(mod.title);
            var href = findModulePage(modId);

            var cls, label;
            if (rec && rec.count >= 3) {
                var pct = Math.round(rec.recall * 100);
                cls = rec.recall >= 0.85 ? 'strong' : (rec.recall >= 0.7 ? 'fading' : 'weak');
                label = 'M' + modId + ' · ' + pct + '%';
            } else if (isCurrent || (progress[modId] && progress[modId].lastStudied)) {
                cls = 'learning';
                label = 'M' + modId + (isCurrent ? ' · now' : ' · learning');
            } else {
                cls = 'ahead';
                label = 'M' + modId;
            }
            chips += '<a class="mastery-chip ' + cls + '" href="' + href + '" title="' + title + '">' + label + '</a>';

            var proj = projectsAfter[modId];
            if (proj) {
                var done = progress[proj.id] && progress[proj.id].completed;
                chips += '<a class="mastery-chip milestone' + (done ? ' strong' : '') + '" href="' + escapeHtmlDash((proj.file || proj.id) + '.html') + '" title="' + escapeHtmlDash(proj.title) + '">' +
                    escapeHtmlDash(String(proj.id).toUpperCase()) + (done ? ' ✓' : '') + '</a>';
            }
        });
        if (!chips) return;
        html += '<div class="mastery-row"><span class="mastery-track-name">' + escapeHtmlDash(track.title) + '</span>' +
            '<div class="mastery-chips">' + chips + '</div></div>';
    });
    rowsEl.innerHTML = html;
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
    var directHref = e.currentTarget && e.currentTarget.getAttribute('data-href');
    if (directHref) {
        window.location.href = directHref;
        return;
    }
    const lastModule = localStorage.getItem(LAST_MODULE_KEY);
    if (lastModule) {
        window.location.href = findModulePage(lastModule);
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
