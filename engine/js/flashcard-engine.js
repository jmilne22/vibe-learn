/**
 * Flashcard Engine
 *
 * Session management with SRS integration for spaced repetition.
 * Reads card data from window.FlashcardData and module names from CourseConfigHelper.
 */
(function() {
    'use strict';

    var FLASHCARD_DATA = window.FlashcardData || {};
    function getModuleNames() {
        return window.CourseConfigHelper ? window.CourseConfigHelper.moduleNames : {};
    }

    // =========================================================================
    // SESSION STATE
    // =========================================================================
    var config = { moduleFilter: 'all', count: 20, mode: 'random' };
    var deck = [];
    var currentIndex = 0;
    var isFlipped = false;
    var results = { knew: 0, partial: 0, didnt: 0 };
    var cardResults = [];

    // =========================================================================
    // INITIALIZATION
    // =========================================================================
    function initConfig() {
        var params = new URLSearchParams(window.location.search);
        var urlModule = params.get('module');
        if (urlModule) {
            config.moduleFilter = parseInt(urlModule, 10);
            history.replaceState(null, '', window.location.pathname);
        }

        buildModuleButtons();
        buildCountButtons();
        buildModeButtons();
    }

    function buildModuleButtons() {
        var container = document.getElementById('fc-module-options');
        if (!container) return;
        var MODULE_NAMES = getModuleNames();

        var allBtn = document.createElement('button');
        allBtn.className = 'dp-option' + (config.moduleFilter === 'all' ? ' active' : '');
        allBtn.textContent = 'All';
        allBtn.onclick = function() {
            setActiveInContainer(container, allBtn);
            config.moduleFilter = 'all';
        };
        container.appendChild(allBtn);

        var moduleIds = Object.keys(FLASHCARD_DATA).map(Number).sort(function(a, b) { return a - b; });
        for (var i = 0; i < moduleIds.length; i++) {
            var m = moduleIds[i];
            var btn = document.createElement('button');
            btn.className = 'dp-option' + (config.moduleFilter === m ? ' active' : '');
            btn.textContent = 'M' + m;
            btn.title = MODULE_NAMES[m] || ('Module ' + m);
            btn.onclick = (function(moduleNum, button) {
                return function() {
                    setActiveInContainer(container, button);
                    config.moduleFilter = moduleNum;
                };
            })(m, btn);
            container.appendChild(btn);
        }
    }

    function buildCountButtons() {
        var container = document.getElementById('fc-count-options');
        if (!container) return;

        var counts = [10, 20, 30];
        counts.forEach(function(count) {
            var btn = document.createElement('button');
            btn.className = 'dp-option' + (count === 20 ? ' active' : '');
            btn.textContent = count;
            btn.onclick = function() {
                setActiveInContainer(container, btn);
                config.count = count;
            };
            container.appendChild(btn);
        });
    }

    function buildModeButtons() {
        var container = document.getElementById('fc-mode-options');
        if (!container) return;

        var modes = [
            { value: 'random', label: 'Random' },
            { value: 'due', label: 'Due for Review' },
            { value: 'weak', label: 'Weakest' }
        ];
        modes.forEach(function(mode) {
            var btn = document.createElement('button');
            btn.className = 'dp-option' + (mode.value === 'random' ? ' active' : '');
            btn.textContent = mode.label;
            btn.onclick = function() {
                setActiveInContainer(container, btn);
                config.mode = mode.value;
            };
            container.appendChild(btn);
        });
    }

    function setActiveInContainer(container, activeBtn) {
        var btns = container.querySelectorAll('.dp-option');
        for (var i = 0; i < btns.length; i++) {
            btns[i].classList.remove('active');
        }
        activeBtn.classList.add('active');
    }

    // =========================================================================
    // SESSION MANAGEMENT
    // =========================================================================
    function getOrCreateHint() {
        var el = document.getElementById('fc-start-hint');
        if (!el) {
            el = document.createElement('p');
            el.id = 'fc-start-hint';
            el.style.cssText = 'color: var(--orange); font-size: 0.85rem; margin-top: 0.5rem;';
            var configEl = document.getElementById('fc-config');
            if (configEl) configEl.appendChild(el);
        }
        return el;
    }

    window.startFlashcardSession = function() {
        deck = buildDeck();
        var hintEl = getOrCreateHint();
        if (deck.length === 0) {
            if (hintEl) {
                var modeLabel = config.mode === 'due' ? 'due for review'
                    : config.mode === 'weak' ? 'weak enough'
                    : 'matching';
                hintEl.textContent = 'Not enough cards ' + modeLabel + ' yet \u2014 try Random mode, or review some cards first.';
                hintEl.style.display = 'block';
            }
            return;
        }
        if (hintEl) hintEl.style.display = 'none';
        currentIndex = 0;
        isFlipped = false;
        results = { knew: 0, partial: 0, didnt: 0 };
        cardResults = [];

        document.getElementById('fc-config').style.display = 'none';
        document.getElementById('fc-session').style.display = 'block';
        document.getElementById('fc-results').style.display = 'none';

        renderCard();
    };

    function buildDeck() {
        var cards = [];

        if (config.moduleFilter === 'all') {
            for (var m in FLASHCARD_DATA) {
                if (FLASHCARD_DATA.hasOwnProperty(m)) {
                    var moduleCards = FLASHCARD_DATA[m];
                    for (var i = 0; i < moduleCards.length; i++) {
                        cards.push({ module: parseInt(m), index: i, q: moduleCards[i].q, a: moduleCards[i].a, topic: moduleCards[i].topic });
                    }
                }
            }
        } else {
            var mod = parseInt(config.moduleFilter);
            if (FLASHCARD_DATA[mod]) {
                var moduleCards = FLASHCARD_DATA[mod];
                for (var i = 0; i < moduleCards.length; i++) {
                    cards.push({ module: mod, index: i, q: moduleCards[i].q, a: moduleCards[i].a, topic: moduleCards[i].topic });
                }
            }
        }

        if (config.mode === 'due') {
            cards = sortByDue(cards);
        } else if (config.mode === 'weak') {
            cards = sortByWeak(cards);
        } else {
            for (var j = cards.length - 1; j > 0; j--) {
                var k = Math.floor(Math.random() * (j + 1));
                var temp = cards[j];
                cards[j] = cards[k];
                cards[k] = temp;
            }
        }

        return cards.slice(0, config.count);
    }

    function srsKey(card) {
        return 'fc_m' + card.module + '_' + card.index;
    }

    function sortByDue(cards) {
        if (!window.SRS) return [];
        var srsData = window.SRS.getAll();
        var now = new Date();
        var due = [];

        for (var i = 0; i < cards.length; i++) {
            var key = srsKey(cards[i]);
            var entry = srsData[key];
            if (entry && new Date(entry.nextReview) <= now) {
                cards[i]._overdue = now - new Date(entry.nextReview);
                due.push(cards[i]);
            }
        }

        due.sort(function(a, b) { return b._overdue - a._overdue; });
        return due;
    }

    function sortByWeak(cards) {
        if (!window.SRS) return [];
        var srsData = window.SRS.getAll();
        var reviewed = [];

        for (var i = 0; i < cards.length; i++) {
            var key = srsKey(cards[i]);
            var entry = srsData[key];
            if (entry) {
                cards[i]._ease = entry.easeFactor;
                reviewed.push(cards[i]);
            }
        }

        reviewed.sort(function(a, b) { return a._ease - b._ease; });
        return reviewed;
    }

    // =========================================================================
    // CARD RENDERING
    // =========================================================================
    function renderCard() {
        var card = deck[currentIndex];
        if (!card) return;
        var MODULE_NAMES = getModuleNames();

        var label = document.getElementById('fc-progress-label');
        if (label) label.textContent = 'Card ' + (currentIndex + 1) + ' of ' + deck.length;

        var modLabel = document.getElementById('fc-module-label');
        if (modLabel) modLabel.textContent = 'Module ' + card.module + ': ' + (MODULE_NAMES[card.module] || '');

        var bar = document.getElementById('fc-progress-bar');
        if (bar) bar.style.width = ((currentIndex / deck.length) * 100) + '%';

        var qEl = document.getElementById('fc-question');
        if (qEl) qEl.innerHTML = formatContent(card.q);

        var aEl = document.getElementById('fc-answer');
        if (aEl) aEl.innerHTML = formatContent(card.a);

        isFlipped = false;
        var cardEl = document.getElementById('fc-card');
        if (cardEl) cardEl.classList.remove('flipped');

        var flipBtn = document.getElementById('fc-flip-btn');
        if (flipBtn) flipBtn.style.display = '';

        var actions = document.getElementById('fc-actions');
        if (actions) actions.style.display = 'flex';

        var rating = document.getElementById('fc-rating');
        if (rating) rating.style.display = 'none';
    }

    function formatContent(text) {
        var escaped = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');
        escaped = escaped.replace(/\n/g, '<br>');
        return escaped;
    }

    // =========================================================================
    // CARD INTERACTION
    // =========================================================================
    window.flipCard = function() {
        var cardEl = document.getElementById('fc-card');
        if (!cardEl) return;

        isFlipped = !isFlipped;
        if (isFlipped) {
            cardEl.classList.add('flipped');
            var flipBtn = document.getElementById('fc-flip-btn');
            if (flipBtn) flipBtn.style.display = 'none';
            var actions = document.getElementById('fc-actions');
            if (actions) actions.style.display = 'none';
            var rating = document.getElementById('fc-rating');
            if (rating) rating.style.display = 'flex';
        } else {
            cardEl.classList.remove('flipped');
            var flipBtn = document.getElementById('fc-flip-btn');
            if (flipBtn) flipBtn.style.display = '';
            var actions = document.getElementById('fc-actions');
            if (actions) actions.style.display = 'flex';
            var rating = document.getElementById('fc-rating');
            if (rating) rating.style.display = 'none';
        }
    };

    window.rateCard = function(quality) {
        var card = deck[currentIndex];

        if (quality === 5) {
            results.knew++;
        } else if (quality === 3) {
            results.partial++;
        } else {
            results.didnt++;
        }

        if (card) {
            cardResults.push({ module: card.module, quality: quality });
        }

        if (window.SRS && card) {
            var label = 'M' + card.module + ' Flashcard: ' + (card.topic || 'Card ' + (card.index + 1));
            window.SRS.recordReview(srsKey(card), quality, label);
        }

        currentIndex++;
        if (currentIndex >= deck.length) {
            showResults();
        } else {
            renderCard();
        }
    };

    // =========================================================================
    // RESULTS
    // =========================================================================
    function showResults() {
        document.getElementById('fc-session').style.display = 'none';
        document.getElementById('fc-results').style.display = 'block';

        var statsEl = document.getElementById('fc-results-stats');
        if (statsEl) {
            var total = results.knew + results.partial + results.didnt;
            var pctKnew = total > 0 ? Math.round((results.knew / total) * 100) : 0;
            var pctPartial = total > 0 ? Math.round((results.partial / total) * 100) : 0;
            var pctDidnt = total > 0 ? Math.round((results.didnt / total) * 100) : 0;

            statsEl.innerHTML =
                '<div style="text-align: center; padding: 1rem;">' +
                    '<div style="font-size: 2rem; font-weight: 700; font-family: JetBrains Mono, monospace; color: var(--cyan);">' + total + '</div>' +
                    '<div style="color: var(--text-dim); font-size: 0.85rem; margin-top: 0.25rem;">Total Cards</div>' +
                '</div>' +
                '<div style="text-align: center; padding: 1rem;">' +
                    '<div style="font-size: 2rem; font-weight: 700; font-family: JetBrains Mono, monospace; color: var(--green-bright);">' + results.knew + '</div>' +
                    '<div style="color: var(--text-dim); font-size: 0.85rem; margin-top: 0.25rem;">Knew It (' + pctKnew + '%)</div>' +
                '</div>' +
                '<div style="text-align: center; padding: 1rem;">' +
                    '<div style="font-size: 2rem; font-weight: 700; font-family: JetBrains Mono, monospace; color: var(--orange);">' + results.partial + '</div>' +
                    '<div style="color: var(--text-dim); font-size: 0.85rem; margin-top: 0.25rem;">Partially (' + pctPartial + '%)</div>' +
                '</div>' +
                '<div style="text-align: center; padding: 1rem;">' +
                    '<div style="font-size: 2rem; font-weight: 700; font-family: JetBrains Mono, monospace; color: var(--red);">' + results.didnt + '</div>' +
                    '<div style="color: var(--text-dim); font-size: 0.85rem; margin-top: 0.25rem;">Didn\'t Know (' + pctDidnt + '%)</div>' +
                '</div>';
        }
    }

    // =========================================================================
    // RESET
    // =========================================================================
    window.resetFlashcards = function() {
        config = { moduleFilter: 'all', count: 20, mode: 'random' };
        deck = [];
        currentIndex = 0;
        isFlipped = false;
        results = { knew: 0, partial: 0, didnt: 0 };
        cardResults = [];

        document.getElementById('fc-config').style.display = '';
        document.getElementById('fc-session').style.display = 'none';
        document.getElementById('fc-results').style.display = 'none';

        var containers = ['fc-module-options', 'fc-count-options', 'fc-mode-options'];
        containers.forEach(function(id) {
            var el = document.getElementById(id);
            if (el) {
                var btns = el.querySelectorAll('.dp-option');
                btns.forEach(function(btn) { btn.classList.remove('active'); });
                if (btns[0]) btns[0].classList.add('active');
            }
        });

        var countEl = document.getElementById('fc-count-options');
        if (countEl) {
            var countBtns = countEl.querySelectorAll('.dp-option');
            countBtns.forEach(function(btn) { btn.classList.remove('active'); });
            if (countBtns[1]) countBtns[1].classList.add('active');
        }
    };

    // =========================================================================
    // KEYBOARD SUPPORT
    // =========================================================================
    document.addEventListener('keydown', function(e) {
        if (document.getElementById('fc-session').style.display === 'none') return;

        if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            if (!isFlipped) {
                window.flipCard();
            }
        } else if (e.key === 'ArrowRight' || e.key === 'j') {
            if (isFlipped) {
                e.preventDefault();
                window.rateCard(5);
            }
        } else if (e.key === 'ArrowDown' || e.key === 'h') {
            if (isFlipped) {
                e.preventDefault();
                window.rateCard(3);
            }
        } else if (e.key === 'ArrowLeft' || e.key === 'k') {
            if (isFlipped) {
                e.preventDefault();
                window.rateCard(1);
            }
        }
    });

    // =========================================================================
    // INIT
    // =========================================================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initConfig);
    } else {
        initConfig();
    }
})();
