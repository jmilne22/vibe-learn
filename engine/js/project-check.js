/** Read-only project verification result UI. */
(function() {
    'use strict';

    var projectId = document.body && document.body.dataset.project;
    if (!projectId) return;

    var statusEl = document.getElementById('project-verify-status');
    var outputEl = document.getElementById('project-check-output');
    var lastSeen = 0;
    var timer = null;

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>]/g, function(c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c];
        });
    }

    function progressKey() {
        return window.CourseConfigHelper
            ? window.CourseConfigHelper.storageKey('progress')
            : 'go-course-progress';
    }

    function saveVerification(result) {
        try {
            var all = JSON.parse(localStorage.getItem(progressKey()) || '{}');
            var entry = all[projectId] || { completed: false };
            entry.verified = !!result.pass;
            entry.verificationAt = new Date(result.at).toISOString();
            entry.verification = {
                vetOk: !!result.vetOk,
                testOk: !!result.testOk,
                elapsedMs: result.elapsedMs
            };
            all[projectId] = entry;
            localStorage.setItem(progressKey(), JSON.stringify(all));
        } catch (e) {}
    }

    function recordMetricOnce(result) {
        if (!window.LearningMetrics) return;
        var key = (window.CourseConfigHelper
            ? window.CourseConfigHelper.storageKey('project-metric-last-')
            : 'go-course-project-metric-last-') + projectId;
        var prior = 0;
        try { prior = parseInt(localStorage.getItem(key) || '0', 10); } catch (e) {}
        if (result.at <= prior) return;
        window.LearningMetrics.recordProjectCheck(result);
        try { localStorage.setItem(key, String(result.at)); } catch (e) {}
    }

    function render(result) {
        if (!result) return;
        lastSeen = Math.max(lastSeen, result.at || 0);
        if (statusEl) {
            statusEl.className = 'project-verify-status ' + (result.pass ? 'pass' : 'fail');
            statusEl.textContent = result.pass ? 'verified by tests' : 'check failed';
        }
        if (outputEl) {
            var lines = [
                (result.vetOk ? '✓' : '✗') + ' go vet ./...',
                (result.testOk ? '✓' : '✗') + ' go test -count=1 ./...',
                result.projectName ? 'project: ' + result.projectName : '',
                'checked: ' + new Date(result.at).toLocaleString()
            ];
            if (!result.pass && result.vetOutput) lines.push('', result.vetOutput);
            if (!result.pass && result.testOutput) lines.push('', result.testOutput);
            outputEl.innerHTML = esc(lines.filter(Boolean).join('\n'));
        }
        saveVerification(result);
        recordMetricOnce(result);
    }

    function poll() {
        if (!window.VibeBridge || !window.VibeBridge.isOnline()) return;
        window.VibeBridge.getProjectResults(projectId, lastSeen).then(function(data) {
            var results = data.results || [];
            if (results.length) render(results[results.length - 1]);
        }).catch(function() {});
    }

    function init() {
        if (!window.VibeBridge) return;
        window.VibeBridge.probe().then(function(online) {
            if (!online && outputEl) {
                outputEl.textContent = 'Local runner offline. Start `node vibe.js watch`, then run the checkpoint command.';
            }
            poll();
            timer = setInterval(poll, 3000);
        });
        window.addEventListener('beforeunload', function() {
            if (timer) clearInterval(timer);
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
