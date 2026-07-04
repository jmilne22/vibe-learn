/**
 * Gaps blocks — completion problems (faded scaffolding, design-1d step 3).
 *
 * Build emits .gaps-block with inline .gap-input fields carrying
 * data-answer. Check compares each input (whitespace-normalized) to its
 * answer; Reveal appears after a failed check. Solved state persists so
 * a revisited section shows the completed scaffold.
 *
 * This is cloze completion checked by string comparison — not a code
 * runner; real code runs in the practice workspace via vibe.
 */
(function() {
    'use strict';

    function storageKey() {
        if (window.CourseConfigHelper) return window.CourseConfigHelper.storageKey('gaps');
        return 'course-gaps';
    }

    function loadAll() {
        try { return JSON.parse(localStorage.getItem(storageKey()) || '{}'); }
        catch (e) { return {}; }
    }

    function saveAll(data) {
        try { localStorage.setItem(storageKey(), JSON.stringify(data)); } catch (e) {}
    }

    function normalize(s) {
        return String(s || '').replace(/\s+/g, ' ').trim();
    }

    function initBlock(block) {
        if (block.dataset.gapsInit === '1') return;
        block.dataset.gapsInit = '1';

        var id = block.dataset.gapsId || '';
        var inputs = Array.prototype.slice.call(block.querySelectorAll('.gap-input'));
        var checkBtn = block.querySelector('.gaps-check-btn');
        var revealBtn = block.querySelector('.gaps-reveal-btn');
        var status = block.querySelector('.gaps-status');
        if (!checkBtn || inputs.length === 0) return;

        function markSolved(persist) {
            inputs.forEach(function(input) {
                input.value = input.dataset.answer;
                input.classList.remove('gap-wrong');
                input.classList.add('gap-right');
                input.disabled = true;
            });
            checkBtn.disabled = true;
            if (revealBtn) revealBtn.hidden = true;
            block.classList.add('gaps-solved');
            if (persist) {
                var all = loadAll();
                all[id] = { solved: true, at: new Date().toISOString() };
                saveAll(all);
            }
        }

        var saved = loadAll()[id];
        if (saved && saved.solved) {
            markSolved(false);
            if (status) status.textContent = 'solved';
            return;
        }

        var fails = 0;

        function check() {
            var wrong = 0;
            inputs.forEach(function(input) {
                var ok = normalize(input.value) === normalize(input.dataset.answer);
                input.classList.toggle('gap-wrong', !ok && input.value.trim() !== '');
                input.classList.toggle('gap-right', ok);
                if (!ok) wrong++;
            });
            if (wrong === 0) {
                markSolved(true);
                if (status) status.textContent = 'solved ✓';
            } else {
                fails++;
                if (status) status.textContent = wrong + ' blank' + (wrong === 1 ? '' : 's') + ' to go';
                if (revealBtn && fails >= 2) revealBtn.hidden = false;
            }
        }

        checkBtn.addEventListener('click', check);
        inputs.forEach(function(input) {
            input.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') { e.preventDefault(); check(); }
            });
        });
        if (revealBtn) {
            revealBtn.addEventListener('click', function() {
                markSolved(true);
                if (status) status.textContent = 'revealed — it comes back for review';
            });
        }
    }

    function init() {
        document.querySelectorAll('.gaps-block').forEach(initBlock);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.Gaps = { initBlock: initBlock };
})();
