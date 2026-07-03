/**
 * Shared Exercise Rendering Module
 *
 * Provides rendering functions used by both course.js (module pages)
 * and daily-practice.js (cross-module practice).
 *
 * Exposes window.ExerciseRenderer with rendering utilities.
 */
(function() {
    'use strict';

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function getDifficultyStars(difficulty) {
        return Icons.stars(difficulty);
    }

    function getVariantDifficulty(variant, challenge) {
        if (variant && variant.difficulty) return variant.difficulty;
        return challenge ? (challenge.difficulty || challenge.block || 2) : 2;
    }

    // Render annotations below a solution
    var ANNOTATION_TYPES = (window.CourseConfigHelper && window.CourseConfigHelper.annotationTypes) || {
        idiom:       { icon: 'Go',  cssClass: 'ann-idiom' },
        complexity:  { icon: 'O',   cssClass: 'ann-complexity' },
        gotcha:      { icon: '!',   cssClass: 'ann-gotcha' },
        alternative: { icon: 'alt', cssClass: 'ann-alternative' },
        stdlib:      { icon: 'pkg', cssClass: 'ann-stdlib' },
        pattern:     { icon: 'P',   cssClass: 'ann-pattern' }
    };

    function renderAnnotations(annotations) {
        if (!annotations || annotations.length === 0) return '';

        let html = '<div class="solution-annotations">';
        annotations.forEach(ann => {
            const cfg = ANNOTATION_TYPES[ann.type] || ANNOTATION_TYPES.idiom;
            html += `<div class="annotation ${cfg.cssClass}">
                <span class="annotation-badge">${cfg.icon}</span>
                <div class="annotation-body">
                    <strong>${escapeHtml(ann.label)}</strong>
                    <span>${ann.text}</span>
                </div>
            </div>`;
        });
        html += '</div>';
        return html;
    }

    // Render hints for an exercise variant
    function renderHints(hints) {
        if (!hints || hints.length === 0) return '';
        let html = '';
        hints.forEach(hint => {
            const rawTitle = typeof hint === 'object' ? hint.title : 'Hint';
            const title = Icons.lightbulb + ' ' + rawTitle;
            const content = typeof hint === 'object' ? hint.content : hint;
            html += `<details class="exercise-support-detail hint-detail">
                <summary>${title}</summary>
                <div class="hint-content">${content}</div>
            </details>`;
        });
        return html;
    }

    // Render documentation links (collapsible details block)
    function renderDocLinks(docLinks) {
        if (!docLinks || docLinks.length === 0) return '';
        return `<details class="exercise-support-detail docs-detail">
                <summary>${Icons.books} Documentation</summary>
                <div class="hint-content">
                    <p class="docs-detail-intro">Relevant Go docs:</p>
                    <ul class="docs-detail-list">
                        ${docLinks.map(link =>
                            `<li><a href="${link.url}" target="_blank" rel="noopener">${link.title}</a>${link.note ? ` <span>\u2014 ${link.note}</span>` : ''}</li>`
                        ).join('\n                        ')}
                    </ul>
                </div>
            </details>`;
    }

    // Render solution details block with optional annotations
    function renderSolution(solution, annotations) {
        let html = `<details class="exercise-support-detail solution-detail">
            <summary>${Icons.checkCircle} Solution</summary>
            <div class="hint-content">
                <pre>${escapeHtml(solution)}</pre>
                ${renderAnnotations(annotations)}
            </div>
        </details>`;
        return html;
    }

    // Break long slice/map literals in test inputs onto multiple lines
    function formatTestInput(input) {
        if (input.length < 70) return input;
        // Match []type{...} patterns and break elements onto lines
        return input.replace(/(\[\]\w+\{)(.*?)(\})/g, function(match, open, inner, close) {
            var items = [];
            var current = '';
            var inStr = false;
            for (var i = 0; i < inner.length; i++) {
                var ch = inner[i];
                if (ch === '\\' && inStr) { current += ch + (inner[++i] || ''); continue; }
                if (ch === '"') inStr = !inStr;
                if (ch === ',' && !inStr) { items.push(current.trim()); current = ''; continue; }
                current += ch;
            }
            if (current.trim()) items.push(current.trim());
            if (items.length <= 2) return match;
            return open + '\n  ' + items.join(',\n  ') + ',\n' + close;
        });
    }

    // Render function signature block
    function renderFunctionSignature(variant) {
        var sig = variant.functionSignature;
        if (!sig) return '';
        return `<div class="function-signature">
            <div class="function-signature-label">Function Signature</div>
            <pre>${escapeHtml(sig)}</pre>
        </div>`;
    }

    // Render the local practice workspace path for variants that have one.
    // practiceDir is set at build time for challenge variants with a testGo
    // block (see generate-practice.js); done = `go test` passing there.
    function renderWorkspacePath(variant) {
        var dir = variant.practiceDir;
        if (!dir) return '';
        var cmd = 'cd ' + dir;
        return `<div class="workspace-path">
            <span class="workspace-path-label">Work locally</span>
            <code>${escapeHtml(cmd)}</code>
            <button type="button" class="workspace-copy-btn" data-copy="${escapeHtml(cmd)}">Copy</button>
            <span class="workspace-path-hint">edit exercise.go, then <code>go test</code></span>
        </div>`;
    }

    // One delegated listener: cards are re-rendered on shuffle and
    // easier/harder swaps, so per-card listeners would be lost.
    document.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('.workspace-copy-btn') : null;
        if (!btn) return;
        var text = btn.getAttribute('data-copy') || '';
        navigator.clipboard.writeText(text).then(function () {
            var original = btn.textContent;
            btn.textContent = 'Copied!';
            btn.classList.add('copied');
            setTimeout(function () {
                btn.textContent = original;
                btn.classList.remove('copied');
            }, 1500);
        });
    });

    // --- Calibration tracking for test-backed exercises -------------------
    // Before running go test the learner predicts pass/fail; afterwards they
    // record the real outcome. Comparing predictions to outcomes over time
    // gives feedback on judgment accuracy, not just performance.
    function calibStorageKey() {
        return window.CourseConfigHelper ? window.CourseConfigHelper.storageKey('calibration') : 'go-course-calibration';
    }

    function loadCalibration() {
        try {
            return JSON.parse(localStorage.getItem(calibStorageKey()) || '[]');
        } catch {
            return [];
        }
    }

    function saveCalibration(entries) {
        try {
            localStorage.setItem(calibStorageKey(), JSON.stringify(entries));
        } catch { /* ignore */ }
    }

    function calibrationStatsHTML(entries) {
        var stats = { confident: { pass: 0, total: 0 }, unsure: { pass: 0, total: 0 } };
        entries.forEach(function(e) {
            var bucket = stats[e.prediction];
            if (!e.result || !bucket) return;
            bucket.total++;
            if (e.result === 'pass') bucket.pass++;
        });
        if (stats.confident.total + stats.unsure.total === 0) return '';
        var parts = [];
        if (stats.confident.total) parts.push(`when confident: ${stats.confident.pass}/${stats.confident.total} pass`);
        if (stats.unsure.total) parts.push(`when unsure: ${stats.unsure.pass}/${stats.unsure.total} pass`);
        return `<span class="calibration-stats">Your calibration — ${parts.join(' · ')}</span>`;
    }

    function renderCalibrationByKey(exerciseKey) {
        var entries = loadCalibration();
        var pending = null;
        for (var i = entries.length - 1; i >= 0; i--) {
            if (entries[i].key === exerciseKey && !entries[i].result) { pending = entries[i]; break; }
        }
        var html = `<div class="calibration" data-exercise-key="${escapeHtml(exerciseKey)}">`;
        if (!pending) {
            html += `<span class="calibration-q">Before you run it — will your code pass <code>go test</code>?</span>
                <button type="button" class="calibration-btn" data-calib="predict" data-prediction="confident">I think it'll pass</button>
                <button type="button" class="calibration-btn" data-calib="predict" data-prediction="unsure">Not sure</button>`;
        } else {
            html += `<span class="calibration-q">You predicted <strong>${pending.prediction === 'confident' ? 'pass' : 'not sure'}</strong> — what did <code>go test</code> say?</span>
                <button type="button" class="calibration-btn" data-calib="result" data-result="pass">Passed</button>
                <button type="button" class="calibration-btn" data-calib="result" data-result="fail">Failed</button>`;
        }
        html += calibrationStatsHTML(entries);
        html += '</div>';
        return html;
    }

    function renderCalibration(variant, exerciseKey) {
        if (!variant.practiceDir || !exerciseKey) return '';
        return renderCalibrationByKey(exerciseKey);
    }

    // Delegated: calibration blocks are re-rendered with their card on
    // shuffle/easier/harder, so per-block listeners would be lost.
    document.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('.calibration-btn') : null;
        if (!btn) return;
        var block = btn.closest('.calibration');
        var key = block.getAttribute('data-exercise-key');
        var entries = loadCalibration();
        if (btn.getAttribute('data-calib') === 'predict') {
            entries.push({ key: key, prediction: btn.getAttribute('data-prediction'), result: null, ts: Date.now() });
        } else {
            for (var i = entries.length - 1; i >= 0; i--) {
                if (entries[i].key === key && !entries[i].result) {
                    entries[i].result = btn.getAttribute('data-result');
                    break;
                }
            }
        }
        saveCalibration(entries);
        block.outerHTML = renderCalibrationByKey(key);
    });

    // Render expected output / test cases
    function renderExpected(variant) {
        if (variant.testCases) {
            if (Array.isArray(variant.testCases) && variant.testCases.length > 0) {
                var rows = variant.testCases.map(function(tc) {
                    return `<div class="test-case-row">
                        <div class="test-case-section">
                            <span class="test-case-label">Input</span>
                            <pre>${formatTestInput(escapeHtml(tc.input))}</pre>
                        </div>
                        <div class="test-case-section">
                            <span class="test-case-label">Expected</span>
                            <pre>${escapeHtml(tc.output)}</pre>
                        </div>
                    </div>`;
                });
                return `<div class="expected">
                    <div class="expected-title">Test Cases</div>
                    ${rows.join('')}
                </div>`;
            }
            if (typeof variant.testCases === 'string' && variant.testCases.trim()) {
                return `<div class="expected">
                    <div class="expected-title">Test Cases</div>
                    <pre>${escapeHtml(variant.testCases)}</pre>
                </div>`;
            }
        }
        if (variant.expected) {
            return `<div class="expected">
                <div class="expected-title">Expected Output</div>
                <pre>${escapeHtml(variant.expected)}</pre>
            </div>`;
        }
        return '';
    }

    // Render a personal notes textarea
    function renderPersonalNotes(exerciseId, variantId) {
        var notesKey = window.CourseConfigHelper ? window.CourseConfigHelper.storageKey('personal-notes') : 'go-course-personal-notes';
        let savedNote = '';
        try {
            const allNotes = JSON.parse(localStorage.getItem(notesKey) || '{}');
            savedNote = allNotes[`${exerciseId}_${variantId}`] || '';
        } catch { /* ignore */ }

        const textareaId = `notes-${exerciseId}_${variantId}`;
        return `<details class="personal-notes">
            <summary>${Icons.pencil} Personal Notes</summary>
            <div class="hint-content">
                <textarea class="personal-notes-textarea" id="${textareaId}"
                    placeholder="Write your notes about this exercise..."
                >${escapeHtml(savedNote)}</textarea>
                <div class="personal-notes-hint">Auto-saves to browser storage</div>
            </div>
        </details>`;
    }

    // Render a single exercise card.
    // Used by daily-practice.js, course.js (module pages), and anywhere exercises appear.
    function renderExerciseCard(opts) {
        const {
            num,
            variant,
            challenge,      // parent challenge (may be null for warmups)
            type,           // 'warmup' or 'challenge'
            exerciseKey,    // e.g., "m2_challenge_1_v2"
            moduleLabel,    // e.g., "M2" (daily practice badge)
            conceptHtml,    // e.g., "(loops ↗)" link (module pages)
            difficultyNav,  // e.g., easier/harder buttons HTML (module pages)
            drill,          // truthy for scaffold drill cards (compact header, no notes)
            expanded        // truthy to render accordion pre-opened (daily practice, algorithms)
        } = opts;

        const progress = window.ExerciseProgress?.get(exerciseKey);
        const completedClass = progress?.status === 'completed' ? ' exercise-completed' : '';

        const variantDifficulty = getVariantDifficulty(variant, challenge);
        const difficultyHtml = type === 'challenge' && variant.difficulty
            ? `<span class="variant-difficulty" aria-label="Difficulty ${variantDifficulty}">${getDifficultyStars(variantDifficulty)}</span>`
            : '';

        const moduleBadge = moduleLabel
            ? `<span class="exercise-module-badge">${escapeHtml(moduleLabel)}</span>`
            : '';

        const conceptSuffix = conceptHtml ? `<span class="exercise-concept">${conceptHtml}</span>` : '';

        const typeLabel = type === 'warmup' ? 'Warmup' : 'Challenge';

        const challengeAttr = challenge ? ` data-challenge-id="${challenge.id}"` : '';

        const headingText = drill
            ? `Step ${num} \u00b7 ${escapeHtml(variant.title)}`
            : escapeHtml(variant.title);

        const chevronSvg = '<svg class="accordion-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4l4 4-4 4"/></svg>';
        const statusLabel = progress?.status === 'completed' ? 'Rated' : 'Not rated';
        const metaHtml = drill ? '' : `<div class="exercise-meta-line">
            <span>${typeLabel} ${num}</span>
            ${difficultyHtml}
            ${conceptSuffix}
            ${moduleBadge}
        </div>`;

        let html = `<div class="exercise exercise-work-item${completedClass}"${drill ? '' : ` data-exercise-key="${exerciseKey}"`}${challengeAttr}>`;

        if (drill) {
            // Drill cards: flat layout, no accordion
            html += `<h4>${headingText}</h4>`;

            if (difficultyNav) html += difficultyNav;
            html += `<div class="exercise-description">${variant.description}</div>`;
            html += renderFunctionSignature(variant);
            html += renderWorkspacePath(variant);
            html += renderCalibration(variant, exerciseKey);
            html += renderExpected(variant);
            html += renderHints(variant.hints);
            if (challenge && challenge.docLinks) html += renderDocLinks(challenge.docLinks);
            html += renderSolution(variant.solution, variant.annotations);
        } else {
            // Accordion wrapper for non-drill exercise cards
            const typePill = `<span class="exercise-type-tag">${typeLabel}</span>`;
            html += `<details class="exercise-accordion"${expanded ? ' open' : ''}>`;

            html += `<summary class="exercise-summary">
                <div class="exercise-summary-main">
                    <div class="exercise-summary-top">${typePill}<span class="exercise-status">${statusLabel}</span></div>
                    <h4>${headingText}</h4>
                    ${metaHtml}
                </div>
                ${chevronSvg}
            </summary>`;
            html += `<div class="exercise-body">`;

            if (difficultyNav) html += difficultyNav;
            html += `<div class="exercise-description exercise-prompt">${variant.description}</div>`;
            html += renderFunctionSignature(variant);
            html += renderWorkspacePath(variant);
            html += renderCalibration(variant, exerciseKey);
            html += renderExpected(variant);
            html += renderHints(variant.hints);
            if (challenge && challenge.docLinks) html += renderDocLinks(challenge.docLinks);
            html += renderSolution(variant.solution, variant.annotations);
            const exId = challenge ? challenge.id : (variant.warmupId || `ex${num}`);
            html += renderPersonalNotes(exId, variant.id);

            html += `</div></details>`;
        }

        html += '</div>';
        return html;
    }

    // Initialize personal notes save handlers on a container
    function initPersonalNotes(container) {
        let saveTimer = null;
        var notesKey = window.CourseConfigHelper ? window.CourseConfigHelper.storageKey('personal-notes') : 'go-course-personal-notes';

        container.querySelectorAll('.personal-notes-textarea').forEach(textarea => {
            const id = textarea.id;
            const match = id.match(/notes-(.+?)_(.+)/);
            if (!match) return;

            const [, exerciseId, variantId] = match;

            textarea.addEventListener('input', () => {
                clearTimeout(saveTimer);
                saveTimer = setTimeout(() => {
                    try {
                        const allNotes = JSON.parse(localStorage.getItem(notesKey) || '{}');
                        const key = `${exerciseId}_${variantId}`;
                        if (textarea.value.trim() === '') {
                            delete allNotes[key];
                        } else {
                            allNotes[key] = textarea.value;
                        }
                        localStorage.setItem(notesKey, JSON.stringify(allNotes));
                    } catch { /* ignore */ }
                }, 500);
            });
        });
    }

    // Public API
    window.ExerciseRenderer = {
        escapeHtml,
        getDifficultyStars,
        getVariantDifficulty,
        renderAnnotations,
        renderDocLinks,
        renderHints,
        renderSolution,
        renderFunctionSignature,
        renderExpected,
        renderPersonalNotes,
        renderExerciseCard,
        initPersonalNotes,
        ANNOTATION_TYPES
    };
})();
