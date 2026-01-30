/**
 * Exercise-Level Progress Tracking for Go Course
 *
 * Tracks individual exercise completion, hint/solution usage, and self-ratings.
 * Works with both static HTML exercises and dynamic variant exercises (course.js).
 *
 * localStorage key: 'go-course-exercise-progress'
 * Schema: { "m2_warmup_1": { status, hintsUsed, solutionViewed, selfRating, lastAttempted } }
 */
(function() {
    'use strict';

    var PROGRESS_KEY = window.CourseConfigHelper ? window.CourseConfigHelper.storageKey('exercise-progress') : 'go-course-exercise-progress';

    function getModuleNum() {
        return document.body?.dataset?.module ||
               window.location.pathname.match(/module(\d+)/)?.[1] || null;
    }

    function loadAllProgress() {
        try {
            return JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}');
        } catch {
            return {};
        }
    }

    function saveAllProgress(data) {
        try {
            localStorage.setItem(PROGRESS_KEY, JSON.stringify(data));
        } catch (e) {
            console.warn('Failed to save exercise progress:', e);
        }
    }

    function getExerciseProgress(key) {
        const all = loadAllProgress();
        return all[key] || null;
    }

    function updateExerciseProgress(key, updates) {
        const all = loadAllProgress();
        const existing = all[key] || {
            status: 'attempted',
            hintsUsed: false,
            solutionViewed: false,
            selfRating: 0,
            lastAttempted: null
        };
        all[key] = { ...existing, ...updates, lastAttempted: new Date().toISOString() };
        saveAllProgress(all);
        return all[key];
    }

    // Derive a stable exercise key from h4 text for static exercises
    // "Warmup 1: Get an Address" -> "m2_warmup_1"
    // "Challenge 3: Swap" -> "m2_challenge_3"
    // "Exercise 2: Something" -> "m5_exercise_2"
    // "Advanced: Linked List" -> "m2_advanced_1" (uses index)
    function deriveExerciseKey(moduleNum, h4Text, fallbackIndex) {
        const text = h4Text.trim();
        const match = text.match(/^(Warmup|Challenge|Exercise|Advanced)\s*(\d*)/i);
        if (!match) return `m${moduleNum}_ex_${fallbackIndex}`;

        const type = match[1].toLowerCase();
        const num = match[2] || String(fallbackIndex);
        return `m${moduleNum}_${type}_${num}`;
    }

    // Create self-rating UI HTML
    function createRatingHTML(key) {
        const progress = getExerciseProgress(key);
        const currentRating = progress?.selfRating || 0;
        const isCompleted = progress?.status === 'completed';

        return `
        <div class="self-rating" data-exercise-key="${key}">
            <span class="self-rating-label">${isCompleted ? 'Rated:' : 'How did it go?'}</span>
            <button class="rating-btn ${currentRating === 1 ? 'active got-it' : ''}" data-rating="1" title="Solved it independently">Got it</button>
            <button class="rating-btn ${currentRating === 2 ? 'active struggled' : ''}" data-rating="2" title="Needed hints or took a while">Struggled</button>
            <button class="rating-btn ${currentRating === 3 ? 'active peeked' : ''}" data-rating="3" title="Had to look at the solution">Had to peek</button>
        </div>`;
    }

    // Initialize progress tracking on a single .exercise element
    function initExercise(exerciseEl, key) {
        if (!key || exerciseEl.dataset.progressInit) return;
        exerciseEl.dataset.progressInit = 'true';
        exerciseEl.dataset.exerciseKey = key;

        const progress = getExerciseProgress(key);

        // Apply completed state
        if (progress?.status === 'completed') {
            exerciseEl.classList.add('exercise-completed');
        }

        // Track details toggle for hint/solution usage
        const allDetails = exerciseEl.querySelectorAll('details');
        allDetails.forEach(details => {
            details.addEventListener('toggle', function() {
                if (!this.open) return;
                const summary = this.querySelector('summary');
                if (!summary) return;
                const text = summary.textContent;

                if (text.includes('Solution')) {
                    updateExerciseProgress(key, { solutionViewed: true });
                    // Show rating UI when solution is first revealed
                    showRatingUI(exerciseEl, key);
                } else if (text.includes('Hint')) {
                    updateExerciseProgress(key, { hintsUsed: true });
                }
            });
        });

        // If solution was already viewed, show rating UI immediately
        if (progress?.solutionViewed) {
            showRatingUI(exerciseEl, key);
        }
    }

    function showRatingUI(exerciseEl, key) {
        // Don't add duplicate rating UI
        if (exerciseEl.querySelector('.self-rating')) return;

        const ratingDiv = document.createElement('div');
        ratingDiv.innerHTML = createRatingHTML(key);
        const ratingEl = ratingDiv.firstElementChild;

        // Insert before the last element (usually expected output or personal notes)
        exerciseEl.appendChild(ratingEl);

        // Attach click handlers
        ratingEl.querySelectorAll('.rating-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const rating = parseInt(this.dataset.rating);
                updateExerciseProgress(key, { selfRating: rating, status: 'completed' });

                // Update button states
                ratingEl.querySelectorAll('.rating-btn').forEach(b => {
                    b.classList.remove('active', 'got-it', 'struggled', 'peeked');
                });
                this.classList.add('active');
                if (rating === 1) this.classList.add('got-it');
                else if (rating === 2) this.classList.add('struggled');
                else if (rating === 3) this.classList.add('peeked');

                // Update label
                const label = ratingEl.querySelector('.self-rating-label');
                if (label) label.textContent = 'Rated:';

                // Mark exercise as completed visually
                exerciseEl.classList.add('exercise-completed');

                // Dispatch event for SRS integration
                window.dispatchEvent(new CustomEvent('exerciseRated', {
                    detail: { key, rating }
                }));
            });
        });
    }

    // Main init: scan all .exercise elements on the page
    function init() {
        const moduleNum = getModuleNum();
        if (!moduleNum) return;

        let advancedCounter = 1;

        document.querySelectorAll('.exercise').forEach((ex, idx) => {
            // Skip if already initialized
            if (ex.dataset.progressInit) return;

            // If course.js already set a key, use it
            let key = ex.dataset.exerciseKey;

            if (!key) {
                // Derive key from h4 text (static exercises)
                const h4 = ex.querySelector('h4');
                if (!h4) return;
                const text = h4.textContent;

                // Track advanced exercises separately since they often lack numbers
                if (text.match(/^Advanced/i)) {
                    key = `m${moduleNum}_advanced_${advancedCounter}`;
                    advancedCounter++;
                } else {
                    key = deriveExerciseKey(moduleNum, text, idx + 1);
                }
            }

            initExercise(ex, key);
        });
    }

    // Expose for course.js to call after dynamic renders
    window.initExerciseProgress = init;
    // Expose for dashboard to read progress data
    window.ExerciseProgress = {
        loadAll: loadAllProgress,
        get: getExerciseProgress,
        update: updateExerciseProgress,
        getModuleNum
    };

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Re-initialize when variant exercises are re-rendered
    window.addEventListener('moduleDataLoaded', () => {
        // Small delay to let course.js render first
        setTimeout(init, 100);
    });

    // SRS integration: when an exercise is rated, record the review
    window.addEventListener('exerciseRated', (e) => {
        if (!window.SRS) return;
        const { key, rating } = e.detail;
        const progress = getExerciseProgress(key);
        if (!progress) return;
        const quality = window.SRS.deriveQuality(progress);
        window.SRS.recordReview(key, quality);
    });
})();
