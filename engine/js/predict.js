// Predict-the-output prompts.
//
// Build emits <div class="predict-block" data-predict-id data-predict-prompt>
// wrapping a .predict-code (rendered code) and .predict-output (canonical
// output, hidden until reveal). This script wraps each block with a prompt
// + textarea + Reveal/Skip controls, then on reveal shows the user's
// prediction next to the canonical output. No grading.
(function() {
    'use strict';

    function storageKey() {
        if (window.CourseConfigHelper) return window.CourseConfigHelper.storageKey('predictions');
        return 'course-predictions';
    }

    function loadAll() {
        try { return JSON.parse(localStorage.getItem(storageKey()) || '{}'); }
        catch (e) { return {}; }
    }

    function saveAll(data) {
        try { localStorage.setItem(storageKey(), JSON.stringify(data)); }
        catch (e) {}
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function(c) {
            return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
        });
    }

    function initBlock(block) {
        if (block.dataset.predictInit === '1') return;
        block.dataset.predictInit = '1';

        var id = block.dataset.predictId || '';
        var prompt = block.dataset.predictPrompt || 'What does this print?';
        var codeEl = block.querySelector('.predict-code');
        var outputEl = block.querySelector('.predict-output');
        if (!codeEl || !outputEl) return;

        var promptDiv = document.createElement('div');
        promptDiv.className = 'predict-prompt-row';
        promptDiv.innerHTML =
            '<span class="predict-tag">Predict</span>' +
            '<span class="predict-prompt-text">' + escapeHtml(prompt) + '</span>';

        var inputWrap = document.createElement('div');
        inputWrap.className = 'predict-input-wrap';

        var input = document.createElement('textarea');
        input.className = 'predict-input';
        input.rows = 2;
        input.placeholder = 'What do you think it prints? (no judgment — predicting is the point)';
        input.spellcheck = false;

        var actions = document.createElement('div');
        actions.className = 'predict-actions';

        var revealBtn = document.createElement('button');
        revealBtn.type = 'button';
        revealBtn.className = 'predict-reveal-btn';
        revealBtn.textContent = 'Reveal';

        var skipBtn = document.createElement('button');
        skipBtn.type = 'button';
        skipBtn.className = 'predict-skip-btn';
        skipBtn.textContent = 'Skip';

        actions.appendChild(revealBtn);
        actions.appendChild(skipBtn);
        inputWrap.appendChild(input);
        inputWrap.appendChild(actions);

        block.insertBefore(promptDiv, codeEl);
        block.insertBefore(inputWrap, outputEl);

        // Restore prior state
        var all = loadAll();
        var saved = all[id];
        if (saved) {
            input.value = saved.prediction || '';
            if (saved.revealed) {
                doReveal(false);
            }
        }

        function doReveal(persist) {
            inputWrap.style.display = 'none';

            if (!block.querySelector('.predict-yours')) {
                var yours = document.createElement('div');
                yours.className = 'predict-yours';
                var yLabel = document.createElement('div');
                yLabel.className = 'predict-yours-label';
                yLabel.textContent = 'Your prediction';
                var yText = document.createElement('div');
                yText.className = 'predict-yours-text';
                var v = (input.value || '').trim();
                if (v) {
                    yText.textContent = v;
                } else {
                    yText.textContent = 'skipped';
                    yText.classList.add('predict-yours-text--skipped');
                }
                yours.appendChild(yLabel);
                yours.appendChild(yText);
                block.insertBefore(yours, outputEl);

                var aLabel = document.createElement('div');
                aLabel.className = 'predict-actual-label';
                aLabel.textContent = 'Actual output';
                block.insertBefore(aLabel, outputEl);
            }

            outputEl.hidden = false;
            block.classList.add('predict-revealed');

            // "Try again" — wipe state and restore the input UI
            if (!promptDiv.querySelector('.predict-retry-btn')) {
                var retry = document.createElement('button');
                retry.type = 'button';
                retry.className = 'predict-retry-btn';
                retry.textContent = 'Try again';
                retry.addEventListener('click', function() { resetBlock(); });
                promptDiv.appendChild(retry);
            }

            if (persist) {
                var data = loadAll();
                data[id] = {
                    prediction: input.value || '',
                    revealed: true,
                    revealedAt: new Date().toISOString()
                };
                saveAll(data);

                var savedNote = block.querySelector('.predict-saved-note');
                if (!savedNote) {
                    savedNote = document.createElement('div');
                    savedNote.className = 'predict-saved-note';
                    savedNote.textContent = 'Saved to your predictions log';
                    block.appendChild(savedNote);
                }
                savedNote.classList.remove('predict-saved-note--fade');
                setTimeout(function() {
                    savedNote.classList.add('predict-saved-note--fade');
                }, 1800);
            }
        }

        function resetBlock() {
            var data = loadAll();
            delete data[id];
            saveAll(data);

            input.value = '';
            inputWrap.style.display = '';

            var yours = block.querySelector('.predict-yours');
            if (yours) yours.remove();
            var aLabel = block.querySelector('.predict-actual-label');
            if (aLabel) aLabel.remove();
            var note = block.querySelector('.predict-saved-note');
            if (note) note.remove();
            var retry = promptDiv.querySelector('.predict-retry-btn');
            if (retry) retry.remove();

            outputEl.hidden = true;
            block.classList.remove('predict-revealed');
            input.focus();
        }

        revealBtn.addEventListener('click', function() { doReveal(true); });
        skipBtn.addEventListener('click', function() {
            input.value = '';
            doReveal(true);
        });

        // Cmd/Ctrl+Enter to reveal
        input.addEventListener('keydown', function(e) {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                doReveal(true);
            }
        });
    }

    function init() {
        document.querySelectorAll('.predict-block').forEach(initBlock);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
