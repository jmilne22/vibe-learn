/**
 * Scaffold Drill System
 *
 * Provides cognitive-ladder drills (trace → fix → complete → produce)
 * for concepts where learners struggle, plus a concept mastery panel.
 *
 * Depends on: ExerciseCore, ExerciseRenderer, SRS, ExerciseProgress, ConceptIndex
 *
 * Exposed as window.ScaffoldDrill
 */
(function() {
    'use strict';

    // Cognitive type ordering: easiest to hardest
    var COGNITIVE_ORDER = ['trace', 'fix', 'complete', 'produce'];

    // Human-readable labels for each cognitive type
    var COGNITIVE_LABELS = {
        trace:    'Read & Predict',
        fix:      'Find the Bug',
        complete: 'Fill the Gaps',
        produce:  'Write It'
    };

    // ---------------------------------------------------------------------------
    // Styles (injected once)
    // ---------------------------------------------------------------------------
    function injectStyles() {
        if (document.getElementById('scaffold-drill-styles')) return;

        var style = document.createElement('style');
        style.id = 'scaffold-drill-styles';
        style.textContent =
            '.drill-btn {' +
                'background: transparent;' +
                'border: 2px solid var(--orange);' +
                'color: var(--orange);' +
                'padding: 0.5rem 1rem;' +
                'border-radius: 8px;' +
                'font-weight: 600;' +
                'cursor: pointer;' +
                'margin-top: 0.75rem;' +
                'transition: all 0.2s;' +
                'font-size: 0.85rem;' +
                'display: inline-block;' +
            '}' +
            '.drill-btn:hover {' +
                'background: var(--orange);' +
                'color: white;' +
                'transform: translateY(-1px);' +
            '}' +
            '.drill-container {' +
                'border: 2px solid var(--orange);' +
                'border-radius: 10px;' +
                'padding: 1.25rem;' +
                'margin-top: 1rem;' +
                'background: var(--bg-surface);' +
            '}' +
            '.drill-container-header {' +
                'display: flex;' +
                'align-items: center;' +
                'gap: 0.5rem;' +
                'margin-bottom: 1rem;' +
                'padding-bottom: 0.75rem;' +
                'border-bottom: 1px solid var(--border-default);' +
            '}' +
            '.drill-container-title {' +
                'font-weight: 600;' +
                'color: var(--orange);' +
                'font-size: 0.95rem;' +
            '}' +
            '.drill-container-subtitle {' +
                'font-size: 0.8rem;' +
                'color: var(--text-secondary);' +
            '}' +
            '.drill-close-btn {' +
                'margin-left: auto;' +
                'background: transparent;' +
                'border: 1px solid var(--text-secondary);' +
                'color: var(--text-secondary);' +
                'padding: 0.2rem 0.6rem;' +
                'border-radius: 4px;' +
                'font-size: 0.75rem;' +
                'cursor: pointer;' +
            '}' +
            '.drill-close-btn:hover {' +
                'border-color: var(--orange);' +
                'color: var(--orange);' +
            '}' +
            '.drill-type-label {' +
                'display: inline-block;' +
                'font-size: 0.7rem;' +
                'font-weight: 600;' +
                'text-transform: uppercase;' +
                'letter-spacing: 0.05em;' +
                'padding: 0.15rem 0.5rem;' +
                'border-radius: 4px;' +
                'margin-bottom: 0.5rem;' +
            '}' +
            '.drill-type-trace { background: var(--cyan); color: var(--bg-base); }' +
            '.drill-type-fix { background: var(--orange); color: white; }' +
            '.drill-type-complete { background: var(--purple); color: white; }' +
            '.drill-type-produce { background: var(--green-bright); color: var(--bg-base); }' +
            '.drill-container .exercise {' +
                'border: none;' +
                'border-bottom: 1px solid var(--border-default);' +
                'padding: 0.75rem 0;' +
                'margin: 0;' +
            '}' +
            '.drill-container .exercise:last-child { border-bottom: none; }' +
            '.drill-container .exercise h4 {' +
                'font-size: 0.9rem;' +
                'margin-bottom: 0.4rem;' +
            '}' +
            '.concept-mastery-panel {' +
                'background: var(--bg-surface);' +
                'border: 1px solid var(--border-default);' +
                'border-radius: 10px;' +
                'padding: 1.25rem;' +
                'margin-bottom: 1.5rem;' +
            '}' +
            '.concept-mastery-title {' +
                'font-weight: 600;' +
                'font-size: 1rem;' +
                'margin-bottom: 1rem;' +
                'color: var(--text);' +
            '}' +
            '.concept-mastery-item {' +
                'display: flex;' +
                'align-items: center;' +
                'gap: 0.75rem;' +
                'padding: 0.5rem 0;' +
                'border-bottom: 1px solid var(--border-default);' +
            '}' +
            '.concept-mastery-item:last-child { border-bottom: none; }' +
            '.concept-mastery-name {' +
                'flex: 1;' +
                'font-size: 0.85rem;' +
                'color: var(--text);' +
                'min-width: 0;' +
            '}' +
            '.concept-mastery-bar-container {' +
                'width: 80px;' +
                'height: 6px;' +
                'background: var(--border-default);' +
                'border-radius: 3px;' +
                'overflow: hidden;' +
                'flex-shrink: 0;' +
            '}' +
            '.concept-mastery-bar {' +
                'height: 100%;' +
                'border-radius: 3px;' +
                'transition: width 0.3s;' +
            '}' +
            '.concept-mastery-badge {' +
                'font-size: 0.7rem;' +
                'font-weight: 600;' +
                'padding: 0.1rem 0.4rem;' +
                'border-radius: 4px;' +
                'white-space: nowrap;' +
                'flex-shrink: 0;' +
            '}' +
            '.concept-mastery-practice-btn {' +
                'background: transparent;' +
                'border: 1px solid var(--orange);' +
                'color: var(--orange);' +
                'padding: 0.2rem 0.5rem;' +
                'border-radius: 4px;' +
                'font-size: 0.7rem;' +
                'cursor: pointer;' +
                'transition: all 0.2s;' +
                'flex-shrink: 0;' +
            '}' +
            '.concept-mastery-practice-btn:hover {' +
                'background: var(--orange);' +
                'color: white;' +
            '}';
        document.head.appendChild(style);
    }

    // ---------------------------------------------------------------------------
    // Data access
    // ---------------------------------------------------------------------------

    function getScaffoldsForConcept(concept) {
        var data = window.variantsDataEmbedded;
        if (!data || !Array.isArray(data.scaffolds)) return [];

        var result = [];
        data.scaffolds.forEach(function(scaffold) {
            if (scaffold.concept !== concept) return;
            if (!Array.isArray(scaffold.variants)) return;
            scaffold.variants.forEach(function(v) {
                result.push({
                    id: scaffold.id + '_' + v.id,
                    type: v.type || 'produce',
                    title: v.title,
                    description: v.description,
                    hints: v.hints,
                    solution: v.solution,
                    scaffoldId: scaffold.id,
                    concept: concept
                });
            });
        });

        return result;
    }

    function hasScaffoldsForConcept(concept) {
        var data = window.variantsDataEmbedded;
        if (!data || !Array.isArray(data.scaffolds)) return false;
        return data.scaffolds.some(function(s) {
            return s.concept === concept && Array.isArray(s.variants) && s.variants.length > 0;
        });
    }

    function getModuleNum() {
        return document.body && document.body.dataset && document.body.dataset.module ||
               (window.location.pathname.match(/module(\d+)/) || [])[1] || '1';
    }

    // ---------------------------------------------------------------------------
    // Drill button (appears after struggling)
    // ---------------------------------------------------------------------------

    function showDrillButton(exerciseEl, concept, srsKey) {
        // Don't add duplicate buttons
        if (exerciseEl.querySelector('.drill-btn')) return;
        if (!hasScaffoldsForConcept(concept)) return;

        var btn = document.createElement('button');
        btn.className = 'drill-btn';
        btn.textContent = 'Drill this pattern';
        btn.addEventListener('click', function() {
            btn.remove();
            var scaffolds = getScaffoldsForConcept(concept);
            renderDrillContainer(exerciseEl, concept, scaffolds);
        });

        exerciseEl.appendChild(btn);
    }

    // ---------------------------------------------------------------------------
    // Drill container with cognitive ladder
    // ---------------------------------------------------------------------------

    function renderDrillContainer(exerciseEl, concept, scaffolds) {
        // Remove any existing drill container on this exercise
        var existing = exerciseEl.parentNode.querySelector('.drill-container');
        if (existing) existing.remove();

        // Group by cognitive type
        var byType = {};
        scaffolds.forEach(function(s) {
            var t = s.type || 'produce';
            if (!byType[t]) byType[t] = [];
            byType[t].push(s);
        });

        // Sequence by cognitive order, pick one per available type
        var selected = [];
        COGNITIVE_ORDER.forEach(function(type) {
            if (!byType[type] || byType[type].length === 0) return;
            var pool = byType[type];
            var picked = pool[Math.floor(Math.random() * pool.length)];
            selected.push(picked);
        });

        if (selected.length === 0) return;

        var container = document.createElement('div');
        container.className = 'drill-container';

        // Header
        var header = document.createElement('div');
        header.className = 'drill-container-header';

        var titleSpan = document.createElement('span');
        titleSpan.className = 'drill-container-title';
        titleSpan.textContent = 'Drill: ' + concept;
        header.appendChild(titleSpan);

        var subtitleSpan = document.createElement('span');
        subtitleSpan.className = 'drill-container-subtitle';
        subtitleSpan.textContent = selected.length + ' step' + (selected.length !== 1 ? 's' : '') + ', easiest first';
        header.appendChild(subtitleSpan);

        var closeBtn = document.createElement('button');
        closeBtn.className = 'drill-close-btn';
        closeBtn.textContent = 'Close';
        closeBtn.addEventListener('click', function() {
            container.remove();
        });
        header.appendChild(closeBtn);

        container.appendChild(header);

        // Render each selected scaffold as an exercise card
        var ER = window.ExerciseRenderer;
        var moduleNum = getModuleNum();

        selected.forEach(function(scaffold, idx) {
            // Human-readable step label
            var typeLabel = document.createElement('div');
            typeLabel.className = 'drill-type-label drill-type-' + scaffold.type;
            typeLabel.textContent = COGNITIVE_LABELS[scaffold.type] || scaffold.type;
            container.appendChild(typeLabel);

            // Render exercise card in drill mode (compact header, no notes, no data-exercise-key)
            var cardHtml = ER.renderExerciseCard({
                num: idx + 1,
                variant: {
                    id: scaffold.id,
                    title: scaffold.title,
                    description: scaffold.description,
                    hints: scaffold.hints,
                    solution: scaffold.solution
                },
                challenge: null,
                type: 'warmup',
                exerciseKey: 'm' + moduleNum + '_' + scaffold.id,
                drill: true
            });

            var wrapper = document.createElement('div');
            wrapper.innerHTML = cardHtml;
            var cardEl = wrapper.firstElementChild;
            container.appendChild(cardEl);

            // No initThinkingTimer — drills are low-pressure practice
            // No initExerciseProgress — drills don't get SRS tracking
        });

        // Insert after the exercise element
        exerciseEl.parentNode.insertBefore(container, exerciseEl.nextSibling);
    }

    // ---------------------------------------------------------------------------
    // Concept mastery panel (shown on module pages)
    // ---------------------------------------------------------------------------

    function renderConceptMasteryPanel() {
        if (!window.SRS || !window.SRS.getConceptStrengths) return;

        var moduleNum = getModuleNum();
        if (!moduleNum) return;

        var strengths = window.SRS.getConceptStrengths({ moduleNum: parseInt(moduleNum, 10) });
        if (!strengths || strengths.length === 0) return;

        // Find the exercises heading to insert before
        var exercisesHeading = null;
        var headings = document.querySelectorAll('h2');
        for (var i = 0; i < headings.length; i++) {
            if (headings[i].textContent.indexOf('Exercises') !== -1) {
                exercisesHeading = headings[i];
                break;
            }
        }
        if (!exercisesHeading) return;

        // Don't add duplicate panels
        if (document.querySelector('.concept-mastery-panel')) return;

        var panel = document.createElement('div');
        panel.className = 'concept-mastery-panel';

        var title = document.createElement('div');
        title.className = 'concept-mastery-title';
        title.textContent = 'Concept Strength';
        panel.appendChild(title);

        strengths.forEach(function(s) {
            var item = document.createElement('div');
            item.className = 'concept-mastery-item';

            // Concept name
            var name = document.createElement('span');
            name.className = 'concept-mastery-name';
            name.textContent = s.concept;
            item.appendChild(name);

            // Strength bar
            var barContainer = document.createElement('div');
            barContainer.className = 'concept-mastery-bar-container';
            var bar = document.createElement('div');
            bar.className = 'concept-mastery-bar';
            // Map avgEase (1.3-3.0) to percentage (0-100%)
            var pct = Math.min(100, Math.max(0, ((s.avgEase - 1.3) / 1.7) * 100));
            bar.style.width = pct + '%';
            bar.style.background = s.color;
            barContainer.appendChild(bar);
            item.appendChild(barContainer);

            // Badge
            var badge = document.createElement('span');
            badge.className = 'concept-mastery-badge';
            badge.textContent = s.label;
            badge.style.color = s.color;
            badge.style.border = '1px solid ' + s.color;
            item.appendChild(badge);

            // Practice button for weak/moderate concepts with scaffolds
            if ((s.label === 'Weak' || s.label === 'Moderate') && hasScaffoldsForConcept(s.concept)) {
                var practiceBtn = document.createElement('button');
                practiceBtn.className = 'concept-mastery-practice-btn';
                practiceBtn.textContent = 'Practice';
                practiceBtn.addEventListener('click', function() {
                    handlePracticeClick(s.concept, item);
                });
                item.appendChild(practiceBtn);
            }

            panel.appendChild(item);
        });

        exercisesHeading.parentNode.insertBefore(panel, exercisesHeading);
    }

    function handlePracticeClick(concept, panelItem) {
        // Try to find the inline exercises section for this concept
        var inlineEl = document.querySelector('.inline-exercises[data-concept="' + concept + '"]');
        if (inlineEl) {
            inlineEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Brief highlight
            inlineEl.style.transition = 'box-shadow 0.3s';
            inlineEl.style.boxShadow = '0 0 0 3px var(--orange)';
            setTimeout(function() {
                inlineEl.style.boxShadow = '';
            }, 2000);
            return;
        }

        // No inline section — render drill container in-place
        var existingDrill = panelItem.parentNode.querySelector('.drill-container');
        if (existingDrill) existingDrill.remove();

        var scaffolds = getScaffoldsForConcept(concept);
        if (scaffolds.length === 0) return;

        renderDrillContainer(panelItem, concept, scaffolds);
    }

    // ---------------------------------------------------------------------------
    // Init on page load
    // ---------------------------------------------------------------------------

    function init() {
        injectStyles();
        // Render mastery panel once module data is available
        if (window.variantsDataEmbedded) {
            renderConceptMasteryPanel();
        } else {
            window.addEventListener('moduleDataLoaded', function() {
                renderConceptMasteryPanel();
            }, { once: true });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Public API
    window.ScaffoldDrill = {
        showDrillButton: showDrillButton,
        renderConceptMasteryPanel: renderConceptMasteryPanel
    };
})();
