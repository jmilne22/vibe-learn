/**
 * App shell — the cross-platform "vibe-learn desktop" window chrome.
 *
 * Every course page renders inside a neutral window: titlebar with the
 * course switcher and daemon status, a persistent left rail, content in
 * the main pane. This script wires the chrome:
 *
 *   - marks the active rail item (body[data-rail] ↔ a[data-rail])
 *   - reflects daemon state in the titlebar pill and the rail footer
 *   - course switcher: dropdown of built courses (from the daemon's
 *     /api/courses); falls back to the all-courses page when unavailable
 *   - window controls. In the browser: – collapses the rail, ▢ toggles
 *     fullscreen, ✕ links out. In the Electron app (window.vibeApp from
 *     the preload) they are the real minimize / maximize / close, and the
 *     titlebar becomes the drag region (body.is-app).
 *
 * Safe on pages without the shell — it does nothing.
 */
(function() {
    'use strict';

    var RAIL_KEY = 'vibe-learn:rail-collapsed';
    var isApp = !!window.vibeApp;

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function(c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
        });
    }

    function currentSlug() {
        var parts = location.pathname.split('/').filter(Boolean);
        return parts.length > 1 ? parts[parts.length - 2] : null;
    }

    function initCourseSwitcher() {
        var switcher = document.querySelector('.win-switch');
        if (!switcher) return;

        var menu = null;

        function closeMenu() {
            if (menu) { menu.remove(); menu = null; }
            document.removeEventListener('click', onDocClick, true);
        }

        function onDocClick(e) {
            if (menu && !menu.contains(e.target) && !switcher.contains(e.target)) closeMenu();
        }

        function openMenu(courses) {
            closeMenu();
            menu = document.createElement('div');
            menu.className = 'win-menu';
            menu.setAttribute('role', 'menu');
            var slug = currentSlug();
            var html = '<div class="win-menu-label">Courses</div>';
            courses.forEach(function(c) {
                var on = c.slug === slug;
                html += '<a class="win-menu-item' + (on ? ' on' : '') + '" role="menuitem" href="/' + esc(c.slug) + '/index.html">' +
                    '<span class="cd"' + (on ? '' : ' style="opacity:.25"') + '></span>' +
                    esc(c.shortName || c.name) + (on ? '<span class="win-menu-check">✓</span>' : '') + '</a>';
            });
            menu.innerHTML = html;
            switcher.parentNode.insertBefore(menu, switcher.nextSibling);
            document.addEventListener('click', onDocClick, true);
        }

        switcher.addEventListener('click', function(e) {
            e.preventDefault();
            if (menu) { closeMenu(); return; }
            fetch('/api/courses').then(function(res) {
                if (!res.ok) throw new Error('http ' + res.status);
                return res.json();
            }).then(function(data) {
                if (data.courses && data.courses.length) openMenu(data.courses);
                else if (!isApp) location.href = switcher.getAttribute('href');
            }).catch(function() {
                // Not served by the daemon (static hosting) — the plain
                // all-courses page is the switcher there.
                if (!isApp) location.href = switcher.getAttribute('href');
            });
        });

        window.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') closeMenu();
        });
    }

    function initWindowControls() {
        try {
            if (localStorage.getItem(RAIL_KEY) === '1') document.body.classList.add('rail-collapsed');
        } catch (e) {}

        document.querySelectorAll('.win-ctrl[data-win]').forEach(function(btn) {
            btn.addEventListener('click', function() {
                if (isApp) {
                    if (btn.dataset.win === 'rail') window.vibeApp.minimize();
                    else if (btn.dataset.win === 'full') window.vibeApp.toggleMaximize();
                    return;
                }
                if (btn.dataset.win === 'rail') {
                    var collapsed = document.body.classList.toggle('rail-collapsed');
                    try { localStorage.setItem(RAIL_KEY, collapsed ? '1' : '0'); } catch (e) {}
                } else if (btn.dataset.win === 'full') {
                    if (document.fullscreenElement) document.exitFullscreen();
                    else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
                }
            });
        });

        // ✕ is a link to the all-courses page on the web; in the app it
        // closes the window.
        var close = document.querySelector('.win-ctrls a.win-ctrl');
        if (close && isApp) {
            close.addEventListener('click', function(e) {
                e.preventDefault();
                window.vibeApp.close();
            });
        }

        if (isApp) {
            var minBtn = document.querySelector('.win-ctrl[data-win="rail"]');
            var maxBtn = document.querySelector('.win-ctrl[data-win="full"]');
            if (minBtn) { minBtn.title = 'Minimize'; minBtn.setAttribute('aria-label', 'Minimize window'); }
            if (maxBtn) { maxBtn.title = 'Maximize'; maxBtn.setAttribute('aria-label', 'Maximize window'); }
            if (close) { close.title = 'Close'; close.setAttribute('aria-label', 'Close window'); }
        }
    }

    function initDaemonStatus() {
        function render() {
            var online = !!(window.VibeBridge && window.VibeBridge.isOnline());
            var runnerReady = !!(window.VibeBridge && window.VibeBridge.isRunnerReady());
            // In-app the pill reflects grading readiness, not just the HTTP
            // server — a green pill next to "runner unavailable" lies.
            var healthy = isApp ? runnerReady : online;
            var pill = document.getElementById('win-daemon');
            var label = document.getElementById('win-daemon-label');
            var port = window.VibeBridge ? window.VibeBridge.port : 4711;
            if (pill) pill.dataset.state = healthy ? 'online' : 'offline';
            if (label) {
                label.textContent = healthy ? 'daemon · :' + port
                    : (online ? 'runner unavailable' : 'daemon offline');
            }

            var dot = document.getElementById('rail-daemon-dot');
            var text = document.getElementById('rail-daemon-text');
            if (dot) dot.className = 'sdot ' + (healthy ? 'online' : 'offline');
            if (text) {
                text.textContent = isApp
                    ? (runnerReady ? 'exercise runner ready' : 'runner unavailable · restart app')
                    : (online ? 'connected · vibe watch' : 'run: node vibe.js watch');
            }
        }

        window.addEventListener('vibeStatusChanged', render);
        if (window.VibeBridge) {
            if (window.VibeBridge.isOnline()) render();
            else window.VibeBridge.probe().then(render);
            window.VibeBridge.startPolling();
        } else {
            render();
        }
    }

    function initProgressiveRail(shell, active) {
        var tracked = 0;
        try {
            tracked = window.SRS && window.SRS.getAll ? Object.keys(window.SRS.getAll()).filter(function(key) {
                return key.indexOf('fc_') !== 0;
            }).length : 0;
        } catch (e) {}

        var metrics = window.LearningMetrics && window.LearningMetrics.summary
            ? window.LearningMetrics.summary()
            : { events: 0, objectiveRuns: 0 };
        var lastModule = 0;
        try {
            var lastKey = window.CourseConfigHelper
                ? window.CourseConfigHelper.storageKey('last-module')
                : 'go-course-last-module';
            lastModule = parseInt(localStorage.getItem(lastKey) || '0', 10) || 0;
        } catch (e) {}

        shell.querySelectorAll('.app-side a[data-progressive]').forEach(function(link) {
            var rule = link.dataset.progressive;
            var show = link.dataset.rail === active;
            if (rule === 'memory') show = show || tracked >= 3;
            else if (rule === 'activity') show = show || tracked >= 5 || metrics.objectiveRuns >= 3;
            else if (rule === 'flashcards') {
                var coverage = (window.CourseConfig && window.CourseConfig.flashcardModules) || [];
                var firstLearningModule = coverage.filter(function(n) { return n > 0; })[0];
                show = show || tracked > 0 || (firstLearningModule !== undefined && lastModule >= firstLearningModule);
                if (coverage.length) link.title = 'Cards currently available for Module' + (coverage.length === 1 ? ' ' : 's ') + coverage.join(', ');
            } else if (rule.indexOf('module:') === 0) {
                show = show || lastModule >= parseInt(rule.split(':')[1], 10);
            }
            link.hidden = !show;
        });
    }

    function init() {
        var shell = document.querySelector('.app-body');
        if (!shell) return;

        if (isApp) document.body.classList.add('is-app');

        // Active rail item
        var active = document.body.dataset.rail;
        if (active) {
            var link = shell.querySelector('.app-side a[data-rail="' + active + '"]');
            if (link) {
                link.classList.add('on');
                link.setAttribute('aria-current', 'page');
            }
        }

        initProgressiveRail(shell, active);

        initCourseSwitcher();
        initWindowControls();
        initDaemonStatus();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
