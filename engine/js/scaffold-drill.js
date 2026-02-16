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
    // Drill container with step-by-step cognitive ladder
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

        // Store drill state on container
        container._drillState = {
            steps: selected,
            current: 0,
            concept: concept,
            container: container
        };

        // Header
        var header = document.createElement('div');
        header.className = 'drill-container-header';

        var titleSpan = document.createElement('span');
        titleSpan.className = 'drill-container-title';
        titleSpan.textContent = 'Drill: ' + concept;
        header.appendChild(titleSpan);

        var closeBtn = document.createElement('button');
        closeBtn.className = 'drill-close-btn';
        closeBtn.textContent = 'Close';
        closeBtn.addEventListener('click', function() {
            container.remove();
        });
        header.appendChild(closeBtn);

        container.appendChild(header);

        // Step indicator
        var stepIndicator = document.createElement('div');
        stepIndicator.className = 'drill-step-indicator';
        container._stepIndicator = stepIndicator;
        container.appendChild(stepIndicator);

        // Step content area
        var stepContent = document.createElement('div');
        stepContent.className = 'drill-step-content';
        container._stepContent = stepContent;
        container.appendChild(stepContent);

        // Nav button
        var navBtn = document.createElement('button');
        navBtn.className = 'drill-next-btn';
        navBtn.addEventListener('click', function() {
            advanceDrillStep(container);
        });
        container._navBtn = navBtn;
        container.appendChild(navBtn);

        // Insert after the exercise element
        exerciseEl.parentNode.insertBefore(container, exerciseEl.nextSibling);

        // Render first step
        renderDrillStep(container);

        // Smooth scroll into view
        container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function renderDrillStep(container) {
        var state = container._drillState;
        var step = state.steps[state.current];
        var total = state.steps.length;
        var num = state.current + 1;

        // Update step indicator
        var indicator = container._stepIndicator;
        indicator.innerHTML = '';

        var typeLabel = document.createElement('span');
        typeLabel.className = 'drill-type-label drill-type-' + step.type;
        typeLabel.textContent = COGNITIVE_LABELS[step.type] || step.type;
        indicator.appendChild(typeLabel);

        var stepCount = document.createElement('span');
        stepCount.className = 'drill-step-count';
        stepCount.textContent = 'Step ' + num + ' of ' + total;
        indicator.appendChild(stepCount);

        // Render exercise card into step content
        var content = container._stepContent;
        content.innerHTML = '';

        var ER = window.ExerciseRenderer;
        var moduleNum = getModuleNum();

        var cardHtml = ER.renderExerciseCard({
            num: num,
            variant: {
                id: step.id,
                title: step.title,
                description: step.description,
                hints: step.hints,
                solution: step.solution
            },
            challenge: null,
            type: 'warmup',
            exerciseKey: 'm' + moduleNum + '_' + step.id,
            drill: true
        });

        var wrapper = document.createElement('div');
        wrapper.innerHTML = cardHtml;
        var cardEl = wrapper.firstElementChild;
        content.appendChild(cardEl);

        // Update nav button
        var navBtn = container._navBtn;
        navBtn.style.display = '';
        if (num < total) {
            navBtn.textContent = 'Next Step \u2192';
        } else {
            navBtn.textContent = 'Finish Drill';
        }
    }

    function advanceDrillStep(container) {
        var state = container._drillState;
        state.current++;

        if (state.current >= state.steps.length) {
            // Show completion state
            showDrillComplete(container);
        } else {
            renderDrillStep(container);
        }
    }

    function showDrillComplete(container) {
        var state = container._drillState;

        // Hide step indicator and nav button
        container._stepIndicator.innerHTML = '';
        container._navBtn.style.display = 'none';

        // Replace step content with completion message
        var content = container._stepContent;
        content.innerHTML = '';

        var complete = document.createElement('div');
        complete.className = 'drill-complete';
        complete.textContent = '\u2713 Drill complete';

        var sub = document.createElement('div');
        sub.className = 'drill-complete-sub';
        sub.textContent = state.steps.length + ' steps completed for ' + state.concept;
        complete.appendChild(sub);

        var closeBtn = document.createElement('button');
        closeBtn.className = 'drill-next-btn';
        closeBtn.textContent = 'Close';
        closeBtn.style.marginTop = '1rem';
        closeBtn.addEventListener('click', function() {
            container.remove();
        });

        content.appendChild(complete);
        content.appendChild(closeBtn);
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
            inlineEl.style.boxShadow = '0 0 0 3px var(--accent)';
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
