/**
 * Lesson rail — design-1d right rail on lesson/section pages.
 *
 * Panels:
 *   1. "This concept in your memory" — per-concept exposure, predicted
 *      recall, and next touch, aggregated from FSRS entries.
 *   2. "Prerequisites" — weakest concepts from earlier modules with
 *      recall bars.
 *   3. "Reference" — press `r` for the quick-reference module.
 *
 * Renders only on pages that have a .lesson article and a numeric
 * body[data-module]. Degrades to nothing when SRS/ConceptIndex are absent.
 */
(function() {
    'use strict';

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function(c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
        });
    }

    function recallColor(r) {
        if (r >= 0.85) return 'var(--green-bright)';
        if (r >= 0.7) return 'var(--orange)';
        return 'var(--red)';
    }

    function conceptStats(concept, moduleId) {
        if (!window.SRS || !window.ConceptIndex) return null;
        var all = window.SRS.getAll();
        var prefix = 'm' + moduleId + '_';
        var count = 0, reviews = 0, recallSum = 0, nextMs = null;
        for (var key in all) {
            if (key.indexOf(prefix) !== 0) continue;
            if (window.ConceptIndex[key] !== concept) continue;
            var entry = all[key];
            count++;
            reviews += entry.reviewCount || 0;
            var r = window.SRS.getRetrievability(key);
            if (r !== null) recallSum += r;
            if (entry.nextReview) {
                var t = new Date(entry.nextReview).getTime();
                if (nextMs === null || t < nextMs) nextMs = t;
            }
        }
        if (count === 0) return null;
        return { count: count, reviews: reviews, recall: recallSum / count, nextMs: nextMs };
    }

    function fmtNext(nextMs) {
        if (!nextMs) return '—';
        var days = (nextMs - Date.now()) / 86400000;
        if (days <= 0) return 'due now';
        if (days < 1) return 'today';
        return 'in ' + Math.round(days) + 'd';
    }

    function buildRail() {
        var article = document.querySelector('article.lesson');
        var moduleId = parseInt(document.body.dataset.module, 10);
        if (!article || isNaN(moduleId)) return;

        var concepts = Array.prototype.slice.call(
            document.querySelectorAll('.inline-exercises[data-concept]')
        ).map(function(el) { return el.dataset.concept; });
        concepts = concepts.filter(function(c, i) { return concepts.indexOf(c) === i; });

        // Memory panel
        var memRows = '';
        concepts.forEach(function(concept) {
            var s = conceptStats(concept, moduleId);
            if (s) {
                memRows +=
                    '<div class="rail-row"><span>' + esc(concept) + '</span>' +
                    '<strong style="color:' + recallColor(s.recall) + '">' + Math.round(s.recall * 100) + '%</strong></div>' +
                    '<div class="rail-row rail-row-sub"><span>' + s.reviews + ' review' + (s.reviews === 1 ? '' : 's') +
                    '</span><strong>' + fmtNext(s.nextMs) + '</strong></div>';
            } else {
                memRows +=
                    '<div class="rail-row"><span>' + esc(concept) + '</span><strong>1st exposure</strong></div>' +
                    '<div class="rail-row rail-row-sub"><span>next touches</span><strong>tonight · +3d · +7d</strong></div>';
            }
        });
        var memPanel = concepts.length === 0 ? '' :
            '<div class="rail-panel">' +
                '<div class="rail-kicker">This concept in your memory</div>' + memRows +
                '<p class="rail-footnote">When the “from scratch” step comes due, this section’s summary comes back with it — the lesson gets relearned, not just the exercise.</p>' +
            '</div>';

        // Prerequisites panel: weakest concepts from earlier modules
        var prereqPanel = '';
        if (window.SRS && window.SRS.getFadingConcepts) {
            var prereqs = window.SRS.getFadingConcepts(12).filter(function(f) {
                return parseInt(f.moduleNum, 10) < moduleId;
            }).slice(0, 3);
            if (prereqs.length > 0) {
                var rows = prereqs.map(function(p) {
                    var pct = Math.round(p.recall * 100);
                    return '<div class="fading-row">' +
                        '<span class="fading-name">' + esc(p.concept) + '</span>' +
                        '<span class="fading-track"><span class="fading-fill" style="width:' + pct + '%;background:' + recallColor(p.recall) + '"></span></span>' +
                        '<span class="fading-pct" style="color:' + recallColor(p.recall) + '">' + pct + '%</span>' +
                        '</div>';
                }).join('');
                prereqPanel = '<div class="rail-panel"><div class="rail-kicker">Prerequisites</div>' + rows + '</div>';
            }
        }

        var workbenchPanel =
            '<div class="rail-panel rail-workbench">' +
                '<div class="rail-kicker"><span class="workbench-status-dot" id="rail-workbench-dot"></span>Workbench</div>' +
                '<p class="rail-body" id="rail-workbench-text">looking for vibe watch…</p>' +
            '</div>';

        var rail = document.createElement('aside');
        rail.className = 'lesson-rail';
        rail.innerHTML = memPanel + prereqPanel + workbenchPanel;

        var wrap = document.createElement('div');
        wrap.className = 'lesson-layout';
        article.parentNode.insertBefore(wrap, article);
        wrap.appendChild(article);
        wrap.appendChild(rail);
    }

    function renderWorkbenchStatus(online) {
        var dot = document.getElementById('rail-workbench-dot');
        var text = document.getElementById('rail-workbench-text');
        if (!dot || !text) return;
        dot.className = 'workbench-status-dot ' + (online ? 'online' : 'offline');
        text.innerHTML = online
            ? 'connected — save a file in <code>practice/</code> and its tests grade the exercises below'
            : 'offline — run <code>node vibe.js watch</code> to grade exercises from real test runs';
    }

    function initWorkbenchStatus() {
        window.addEventListener('vibeStatusChanged', function(e) {
            renderWorkbenchStatus(e.detail.online);
        });
        if (window.VibeBridge) {
            if (window.VibeBridge.isOnline()) renderWorkbenchStatus(true);
            else window.VibeBridge.probe().then(renderWorkbenchStatus);
        } else {
            renderWorkbenchStatus(false);
        }
    }

    function init() {
        buildRail();
        initWorkbenchStatus();
        // The rail's workbench panel supersedes the floating pill here
        var pill = document.getElementById('vibe-status-pill');
        if (pill && document.querySelector('.rail-workbench')) pill.remove();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
