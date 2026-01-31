/**
 * Real-World Challenges — Runtime JS
 *
 * Reads challenge data from window.RealWorldChallengeData,
 * manages progress in localStorage, renders challenge cards,
 * and handles filtering.
 */
(function() {
    'use strict';

    var DATA = window.RealWorldChallengeData || {};
    var challenges = DATA.challenges || [];
    var STORAGE_KEY = window.CourseConfigHelper
        ? window.CourseConfigHelper.storageKey('real-world-challenges')
        : 'go-course-real-world-challenges';

    // =========================================================================
    // PROGRESS MANAGEMENT
    // =========================================================================
    function loadProgress() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        } catch (e) {
            return {};
        }
    }

    function saveProgress(progress) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    }

    function getStatus(id) {
        var progress = loadProgress();
        return (progress[id] && progress[id].status) || 'not-started';
    }

    function setStatus(id, status) {
        var progress = loadProgress();
        if (!progress[id]) {
            progress[id] = {};
        }
        progress[id].status = status;
        if (status === 'in-progress' && !progress[id].startedAt) {
            progress[id].startedAt = new Date().toISOString();
        }
        if (status === 'completed') {
            progress[id].completedAt = new Date().toISOString();
        }
        if (status === 'not-started') {
            progress[id].completedAt = null;
        }
        saveProgress(progress);
    }

    function getCheckedCriteria(id) {
        var progress = loadProgress();
        return (progress[id] && progress[id].checkedCriteria) || [];
    }

    function setCheckedCriteria(id, idx, checked) {
        var progress = loadProgress();
        if (!progress[id]) {
            progress[id] = {};
        }
        if (!progress[id].checkedCriteria) {
            progress[id].checkedCriteria = [];
        }
        var list = progress[id].checkedCriteria;
        var pos = list.indexOf(idx);
        if (checked && pos === -1) {
            list.push(idx);
        } else if (!checked && pos !== -1) {
            list.splice(pos, 1);
        }
        progress[id].checkedCriteria = list;
        saveProgress(progress);
    }

    // =========================================================================
    // FILTERS STATE
    // =========================================================================
    var filters = {
        difficulty: 'all',
        status: 'all',
        company: 'all'
    };

    // =========================================================================
    // RENDERING
    // =========================================================================

    function renderDifficultyDots(level) {
        var html = '<div class="rwc-difficulty" title="Difficulty: ' + level + '/5">';
        for (var i = 1; i <= 5; i++) {
            html += '<div class="rwc-difficulty-dot' + (i <= level ? ' filled' : '') + '"></div>';
        }
        html += '</div>';
        return html;
    }

    function renderStatusBadge(status) {
        var labels = {
            'not-started': 'Not Started',
            'in-progress': 'In Progress',
            'completed': 'Completed'
        };
        return '<span class="rwc-status-badge ' + status + '">' + (labels[status] || status) + '</span>';
    }

    function renderActionButton(id, status) {
        if (status === 'not-started') {
            return '<button class="rwc-action-btn start" data-id="' + id + '" data-action="start">Start Challenge</button>';
        } else if (status === 'in-progress') {
            return '<div class="rwc-action-group">' +
                '<button class="rwc-action-btn complete" data-id="' + id + '" data-action="complete">Mark Completed</button>' +
                '<button class="rwc-action-btn reset" data-id="' + id + '" data-action="reset">Reset</button>' +
                '</div>';
        } else {
            return '<button class="rwc-action-btn reopen" data-id="' + id + '" data-action="reopen">Reopen</button>';
        }
    }

    function renderChallengeCard(challenge) {
        var status = getStatus(challenge.id);

        var html = '<div class="rwc-card" data-challenge-id="' + challenge.id + '" data-difficulty="' + challenge.difficulty + '" data-status="' + status + '">';

        // Header: title + difficulty + status
        html += '<div class="rwc-card-header">';
        html += '<span class="rwc-card-title">' + escapeHtml(challenge.title) + '</span>';
        html += renderDifficultyDots(challenge.difficulty);
        html += renderStatusBadge(status);
        html += '</div>';

        // Company + concept tags
        html += '<div class="rwc-tags">';
        if (challenge.companies) {
            challenge.companies.forEach(function(company) {
                html += '<span class="rwc-company-tag">' + escapeHtml(company) + '</span>';
            });
        }
        if (challenge.concepts) {
            challenge.concepts.forEach(function(concept) {
                html += '<span class="rwc-concept-tag">' + escapeHtml(concept) + '</span>';
            });
        }
        html += '</div>';

        // Source attribution
        if (challenge.source) {
            html += '<div class="rwc-source"><span class="rwc-source-label">Source:</span> ';
            if (challenge.sourceUrl) {
                html += '<a href="' + escapeHtml(challenge.sourceUrl) + '" target="_blank" rel="noopener">' + escapeHtml(challenge.source) + '</a>';
            } else {
                html += escapeHtml(challenge.source);
            }
            html += '</div>';
        }

        // Expandable details
        html += '<details class="rwc-details">';
        html += '<summary>View Requirements & Hints</summary>';

        // Requirements
        if (challenge.requirementsHtml) {
            html += '<div class="rwc-section">';
            html += '<div class="rwc-section-title">Requirements</div>';
            html += '<div class="rwc-requirements">' + challenge.requirementsHtml + '</div>';
            html += '</div>';
        }

        // Acceptance Criteria (interactive checkboxes)
        if (challenge.acceptanceCriteria && challenge.acceptanceCriteria.length > 0) {
            html += '<div class="rwc-section">';
            html += '<div class="rwc-section-title">Acceptance Criteria</div>';
            html += '<ul class="rwc-checklist">';
            var checkedItems = getCheckedCriteria(challenge.id);
            challenge.acceptanceCriteria.forEach(function(criterion, idx) {
                var isChecked = checkedItems.indexOf(idx) !== -1;
                html += '<li>';
                html += '<label class="rwc-check-label">';
                html += '<input type="checkbox" class="rwc-check" data-challenge="' + challenge.id + '" data-idx="' + idx + '"' + (isChecked ? ' checked' : '') + '>';
                html += '<span>' + escapeHtml(criterion) + '</span>';
                html += '</label>';
                html += '</li>';
            });
            html += '</ul>';
            html += '</div>';
        }

        // Hints (progressive)
        if (challenge.hints && challenge.hints.length > 0) {
            html += '<div class="rwc-section">';
            html += '<div class="rwc-section-title">Hints</div>';
            html += '<div class="rwc-hints-list">';
            challenge.hints.forEach(function(hint, index) {
                html += '<details class="rwc-hint-toggle">';
                html += '<summary>Hint ' + (index + 1) + ': ' + escapeHtml(hint.title) + '</summary>';
                html += '<div class="rwc-hint-content">' + (hint.contentHtml || escapeHtml(hint.content)) + '</div>';
                html += '</details>';
            });
            html += '</div>';
            html += '</div>';
        }

        // Extensions
        if (challenge.extensions && challenge.extensions.length > 0) {
            html += '<div class="rwc-section">';
            html += '<div class="rwc-section-title">Extensions (Stretch Goals)</div>';
            html += '<ul class="rwc-extensions">';
            challenge.extensions.forEach(function(ext) {
                html += '<li>' + escapeHtml(ext) + '</li>';
            });
            html += '</ul>';
            html += '</div>';
        }

        html += '</details>';

        // Action button
        html += renderActionButton(challenge.id, status);

        html += '</div>';
        return html;
    }

    function renderChallengeList() {
        var listEl = document.getElementById('rwc-challenge-list');
        var emptyEl = document.getElementById('rwc-empty');
        if (!listEl) return;

        var filtered = challenges.filter(function(c) {
            var status = getStatus(c.id);

            if (filters.difficulty !== 'all' && c.difficulty !== parseInt(filters.difficulty)) {
                return false;
            }
            if (filters.status !== 'all' && status !== filters.status) {
                return false;
            }
            if (filters.company !== 'all') {
                if (!c.companies || c.companies.indexOf(filters.company) === -1) {
                    return false;
                }
            }
            return true;
        });

        if (filtered.length === 0) {
            listEl.innerHTML = '';
            if (emptyEl) emptyEl.hidden = false;
            return;
        }

        if (emptyEl) emptyEl.hidden = true;
        listEl.innerHTML = filtered.map(renderChallengeCard).join('');

        // Bind action buttons
        listEl.querySelectorAll('.rwc-action-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var id = btn.dataset.id;
                var action = btn.dataset.action;
                if (action === 'start') {
                    setStatus(id, 'in-progress');
                } else if (action === 'complete') {
                    setStatus(id, 'completed');
                } else if (action === 'reset') {
                    setStatus(id, 'not-started');
                } else if (action === 'reopen') {
                    setStatus(id, 'in-progress');
                }
                renderChallengeList();
                updateStats();
            });
        });

        // Bind acceptance criteria checkboxes
        listEl.querySelectorAll('.rwc-check').forEach(function(cb) {
            cb.addEventListener('change', function() {
                setCheckedCriteria(cb.dataset.challenge, parseInt(cb.dataset.idx), cb.checked);
            });
        });
    }

    function updateStats() {
        var total = challenges.length;
        var inProgress = 0;
        var completed = 0;

        challenges.forEach(function(c) {
            var status = getStatus(c.id);
            if (status === 'in-progress') inProgress++;
            if (status === 'completed') completed++;
        });

        setText('rwc-total', total);
        setText('rwc-in-progress', inProgress);
        setText('rwc-completed', completed);
    }

    // =========================================================================
    // FILTERS
    // =========================================================================
    function setupFilters() {
        // Difficulty filter
        bindFilterGroup('rwc-difficulty-filter', 'difficulty', 'difficulty');

        // Status filter
        bindFilterGroup('rwc-status-filter', 'status', 'status');

        // Company filter (dynamic)
        buildCompanyFilter();
    }

    function bindFilterGroup(containerId, filterKey, dataAttr) {
        var container = document.getElementById(containerId);
        if (!container) return;

        container.querySelectorAll('.rwc-filter-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                container.querySelectorAll('.rwc-filter-btn').forEach(function(b) {
                    b.classList.remove('active');
                });
                btn.classList.add('active');
                filters[filterKey] = btn.dataset[dataAttr];
                renderChallengeList();
            });
        });
    }

    function buildCompanyFilter() {
        var container = document.getElementById('rwc-company-filter');
        if (!container) return;

        // Collect unique companies
        var companies = {};
        challenges.forEach(function(c) {
            if (c.companies) {
                c.companies.forEach(function(company) {
                    companies[company] = true;
                });
            }
        });

        var sorted = Object.keys(companies).sort();

        // "All" button
        var allBtn = document.createElement('button');
        allBtn.className = 'rwc-filter-btn active';
        allBtn.dataset.company = 'all';
        allBtn.textContent = 'All';
        container.appendChild(allBtn);

        sorted.forEach(function(company) {
            var btn = document.createElement('button');
            btn.className = 'rwc-filter-btn';
            btn.dataset.company = company;
            btn.textContent = company;
            container.appendChild(btn);
        });

        bindFilterGroup('rwc-company-filter', 'company', 'company');
    }

    // =========================================================================
    // HELPERS
    // =========================================================================
    function escapeHtml(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function setText(id, text) {
        var el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    // =========================================================================
    // DASHBOARD INTEGRATION
    // =========================================================================
    window.RealWorldChallenges = {
        getStats: function() {
            var total = challenges.length;
            var inProgress = 0;
            var completed = 0;
            challenges.forEach(function(c) {
                var status = getStatus(c.id);
                if (status === 'in-progress') inProgress++;
                if (status === 'completed') completed++;
            });
            return { total: total, inProgress: inProgress, completed: completed };
        }
    };

    // =========================================================================
    // INIT
    // =========================================================================
    function init() {
        updateStats();
        setupFilters();
        renderChallengeList();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
