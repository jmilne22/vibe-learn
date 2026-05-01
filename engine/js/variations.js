// "What-if?" code variation tabber.
//
// Build emits <div class="variations-block"> containing a single
// <script type="application/json"> data island with pre-rendered code+output
// for each case. This script reads the data, builds tabs + code/output
// panes, and swaps content on tab click. All output is pre-computed at
// build time — no runtime, no async, no judgment.
(function() {
    'use strict';

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function(c) {
            return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
        });
    }

    // Wrap each line of the rendered <pre><code> block in a <span class="variations-line">,
    // adding "variations-line--changed" to indices in changedLines. The hljs highlighter
    // doesn't span newlines for typical code, so splitting the inner content on '\n'
    // produces clean per-line slices.
    function wrapLines(codeHtml, changedLines) {
        var changed = {};
        (changedLines || []).forEach(function(i) { changed[i] = true; });
        var m = codeHtml.match(/^(<pre><code[^>]*>)([\s\S]*?)(<\/code><\/pre>)$/);
        if (!m) return codeHtml;
        var pre = m[1], inner = m[2], post = m[3];
        var trailing = inner.endsWith('\n');
        if (trailing) inner = inner.slice(0, -1);
        var lines = inner.split('\n');
        var wrapped = lines.map(function(line, i) {
            var cls = 'variations-line' + (changed[i] ? ' variations-line--changed' : '');
            // Empty lines need a non-breaking space so the highlight bar still has height.
            var content = line === '' ? '&#8203;' : line;
            return '<span class="' + cls + '">' + content + '</span>';
        }).join('');
        // Don't re-append a trailing newline — display:block on each line span
        // already separates lines; an extra \n inside <pre> would render as a blank line.
        return pre + wrapped + post;
    }

    function initBlock(block) {
        if (block.dataset.variationsInit === '1') return;
        block.dataset.variationsInit = '1';

        var dataEl = block.querySelector('script.variations-data');
        if (!dataEl) return;

        var data;
        try { data = JSON.parse(dataEl.textContent); }
        catch (e) { return; }

        var cases = data.cases || [];
        if (cases.length === 0) return;

        // Pre-wrap each case's code so changed lines are highlighted on tab switch.
        cases.forEach(function(c) {
            c.codeHtml = wrapLines(c.codeHtml || '', c.changedLines);
        });

        // Header
        if (data.title) {
            var header = document.createElement('div');
            header.className = 'variations-header';
            header.innerHTML =
                '<span class="variations-tag">What if?</span>' +
                '<span class="variations-title">' + escapeHtml(data.title) + '</span>';
            block.appendChild(header);
        }

        // Tab strip
        var tabStrip = document.createElement('div');
        tabStrip.className = 'variations-tabs';
        tabStrip.setAttribute('role', 'tablist');

        var tabs = cases.map(function(c, idx) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'variations-tab';
            btn.setAttribute('role', 'tab');
            btn.setAttribute('data-case', String(idx));
            btn.textContent = c.name;
            if (idx === 0) {
                btn.classList.add('variations-tab--active');
                btn.setAttribute('aria-selected', 'true');
            } else {
                btn.setAttribute('aria-selected', 'false');
                btn.tabIndex = -1;
            }
            tabStrip.appendChild(btn);
            return btn;
        });

        block.appendChild(tabStrip);

        // Body — code + output panes
        var body = document.createElement('div');
        body.className = 'variations-body';

        var codePane = document.createElement('div');
        codePane.className = 'variations-code';
        codePane.innerHTML = cases[0].codeHtml || '';

        var outLabel = document.createElement('div');
        outLabel.className = 'variations-output-label';
        outLabel.textContent = 'Output';

        var outPane = document.createElement('pre');
        outPane.className = 'variations-output';
        outPane.textContent = cases[0].output || '';
        if (cases[0].exitCode !== 0) outPane.classList.add('variations-output--nonzero');

        body.appendChild(codePane);
        body.appendChild(outLabel);
        body.appendChild(outPane);
        block.appendChild(body);

        // Footer — pre-rendered tag
        var footer = document.createElement('div');
        footer.className = 'variations-footer';
        footer.innerHTML = '<span class="variations-runner-tag">pre-rendered · ' +
            escapeHtml(data.runner || 'go') + '</span>';
        block.appendChild(footer);

        function activate(idx) {
            if (idx < 0 || idx >= cases.length) return;
            tabs.forEach(function(t, i) {
                var active = i === idx;
                t.classList.toggle('variations-tab--active', active);
                t.setAttribute('aria-selected', active ? 'true' : 'false');
                t.tabIndex = active ? 0 : -1;
            });
            codePane.innerHTML = cases[idx].codeHtml || '';
            outPane.textContent = cases[idx].output || '';
            outPane.classList.toggle('variations-output--nonzero', cases[idx].exitCode !== 0);
        }

        tabs.forEach(function(t, i) {
            t.addEventListener('click', function() { activate(i); });
        });

        // Arrow-key navigation within the tab strip
        tabStrip.addEventListener('keydown', function(e) {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            var current = tabs.findIndex(function(t) {
                return t.classList.contains('variations-tab--active');
            });
            if (current < 0) return;
            var next = e.key === 'ArrowLeft'
                ? (current - 1 + tabs.length) % tabs.length
                : (current + 1) % tabs.length;
            activate(next);
            tabs[next].focus();
            e.preventDefault();
        });
    }

    function init() {
        document.querySelectorAll('.variations-block').forEach(initBlock);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
