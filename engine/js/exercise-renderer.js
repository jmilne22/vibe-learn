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
        const stars = Math.min(Math.max(difficulty || 1, 1), 5);
        return '\u2B50'.repeat(stars);
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
            const title = typeof hint === 'object' ? hint.title : '\uD83D\uDCA1 Hint';
            const content = typeof hint === 'object' ? hint.content : hint;
            html += `<details>
                <summary>${title}</summary>
                <div class="hint-content">${content}</div>
            </details>`;
        });
        return html;
    }

    // Render documentation links (collapsible details block)
    function renderDocLinks(docLinks) {
        if (!docLinks || docLinks.length === 0) return '';
        return `<details>
                <summary>\uD83D\uDCDA Documentation</summary>
                <div class="hint-content">
                    <p style="margin-bottom: 0.5rem; color: var(--text-dim);">Relevant Go docs:</p>
                    <ul style="margin: 0; padding-left: 1.5rem;">
                        ${docLinks.map(link =>
                            `<li><a href="${link.url}" target="_blank" rel="noopener" style="color: var(--cyan);">${link.title}</a>${link.note ? ` <span style="color: var(--text-dim);">\u2014 ${link.note}</span>` : ''}</li>`
                        ).join('\n                        ')}
                    </ul>
                </div>
            </details>`;
    }

    // Render solution details block with optional annotations
    function renderSolution(solution, annotations) {
        let html = `<details>
            <summary>\u2705 Solution</summary>
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

    // Render expected output / test cases
    function renderExpected(variant) {
        if (variant.testCases) {
            if (Array.isArray(variant.testCases) && variant.testCases.length > 0) {
                var blocks = variant.testCases.map(function(tc) {
                    return formatTestInput(tc.input) + '\n\u2192 ' + tc.output;
                });
                return `<div class="expected">
                    <div class="expected-title">Expected Output</div>
                    <pre>${blocks.join('\n\n')}</pre>
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
            <summary>\uD83D\uDCDD Personal Notes</summary>
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
            difficultyNav   // e.g., easier/harder buttons HTML (module pages)
        } = opts;

        const progress = window.ExerciseProgress?.get(exerciseKey);
        const completedClass = progress?.status === 'completed' ? ' exercise-completed' : '';

        const difficultyHtml = type === 'challenge' && variant.difficulty
            ? ` <span class="variant-difficulty">${getDifficultyStars(getVariantDifficulty(variant, challenge))}</span>`
            : '';

        const moduleBadge = moduleLabel
            ? `<span style="font-size: 0.7rem; color: var(--text-dim); font-family: 'JetBrains Mono', monospace; margin-left: 0.5rem;">[${moduleLabel}]</span>`
            : '';

        const conceptSuffix = conceptHtml ? ' ' + conceptHtml : '';

        const typeLabel = type === 'warmup' ? 'Warmup' : 'Challenge';

        const challengeAttr = challenge ? ` data-challenge-id="${challenge.id}"` : '';

        let html = `<div class="exercise${completedClass}" data-exercise-key="${exerciseKey}"${challengeAttr}>
            <h4>${typeLabel} ${num}: ${escapeHtml(variant.title)}${difficultyHtml}${conceptSuffix}${moduleBadge}</h4>`;

        if (difficultyNav) html += difficultyNav;

        html += `<p>${variant.description}</p>`;

        // Hints
        html += renderHints(variant.hints);

        // Documentation links (challenge-level, not on warmups)
        if (challenge && challenge.docLinks) {
            html += renderDocLinks(challenge.docLinks);
        }

        // Solution with annotations
        html += renderSolution(variant.solution, variant.annotations);

        // Personal notes
        const exId = challenge ? challenge.id : (variant.warmupId || `ex${num}`);
        html += renderPersonalNotes(exId, variant.id);

        // Expected output
        html += renderExpected(variant);

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
        renderExpected,
        renderPersonalNotes,
        renderExerciseCard,
        initPersonalNotes,
        ANNOTATION_TYPES
    };
})();
