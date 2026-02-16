/**
 * SVG Icon Registry
 *
 * Central registry of inline SVG icons used across the course platform.
 * All icons are 16x16, use currentColor for theming, and include
 * inline styles for consistent vertical alignment.
 *
 * Usage: Icons.hammer, Icons.bell, Icons.stars(3), etc.
 * Exposed as window.Icons
 */
(function() {
    'use strict';

    var S = 'display:inline-block;vertical-align:-0.15em;';
    var V = '0 0 16 16';

    function svg(inner) {
        return '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="' + V + '" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="' + S + '">' + inner + '</svg>';
    }

    var Icons = {
        hammer: svg(
            '<path d="M10 2l3 3-7.5 7.5L2 13l.5-3.5z"/>' +
            '<path d="M8.5 3.5l4-2 2 2-2 4"/>'
        ),

        menu: svg(
            '<line x1="2" y1="4" x2="14" y2="4"/>' +
            '<line x1="2" y1="8" x2="14" y2="8"/>' +
            '<line x1="2" y1="12" x2="14" y2="12"/>'
        ),

        bell: svg(
            '<path d="M6 13a2 2 0 004 0"/>' +
            '<path d="M4 7a4 4 0 018 0c0 2 1 3.5 2 4.5H2c1-1 2-2.5 2-4.5z"/>'
        ),

        bellMuted: svg(
            '<path d="M6 13a2 2 0 004 0"/>' +
            '<path d="M4 7a4 4 0 018 0c0 2 1 3.5 2 4.5H2c1-1 2-2.5 2-4.5z"/>' +
            '<line x1="3" y1="3" x2="13" y2="13"/>'
        ),

        brain: svg(
            '<path d="M8 14V8"/>' +
            '<path d="M5.5 8C3.5 8 2 6.5 2 5s1-3 3-3c.5 0 1 .1 1.5.3"/>' +
            '<path d="M10.5 8c2 0 3.5-1.5 3.5-3s-1-3-3-3c-.5 0-1 .1-1.5.3"/>' +
            '<path d="M5 8c0 2-1.5 3.5-1.5 5 0 .5.5 1 1.5 1h6c1 0 1.5-.5 1.5-1 0-1.5-1.5-3-1.5-5"/>'
        ),

        checkCircle: svg(
            '<circle cx="8" cy="8" r="6"/>' +
            '<path d="M5.5 8l2 2 3.5-4"/>'
        ),

        star: svg(
            '<path d="M8 1.5l2 4 4.5.5-3.3 3 1 4.5L8 11l-4.2 2.5 1-4.5L1.5 6l4.5-.5z" fill="currentColor" stroke="currentColor"/>'
        ),

        sliders: svg(
            '<line x1="3" y1="4" x2="13" y2="4"/>' +
            '<circle cx="10" cy="4" r="1.5" fill="currentColor"/>' +
            '<line x1="3" y1="8" x2="13" y2="8"/>' +
            '<circle cx="5" cy="8" r="1.5" fill="currentColor"/>' +
            '<line x1="3" y1="12" x2="13" y2="12"/>' +
            '<circle cx="9" cy="12" r="1.5" fill="currentColor"/>'
        ),

        dice: svg(
            '<rect x="2" y="2" width="12" height="12" rx="2"/>' +
            '<circle cx="5.5" cy="5.5" r="1" fill="currentColor" stroke="none"/>' +
            '<circle cx="10.5" cy="5.5" r="1" fill="currentColor" stroke="none"/>' +
            '<circle cx="8" cy="8" r="1" fill="currentColor" stroke="none"/>' +
            '<circle cx="5.5" cy="10.5" r="1" fill="currentColor" stroke="none"/>' +
            '<circle cx="10.5" cy="10.5" r="1" fill="currentColor" stroke="none"/>'
        ),

        scales: svg(
            '<line x1="8" y1="1" x2="8" y2="14"/>' +
            '<line x1="2" y1="4" x2="14" y2="4"/>' +
            '<path d="M2 4l2 5h0a2 2 0 004 0h0l2-5"/>' +
            '<path d="M8 4l2 5h0a2 2 0 004 0h0l2-5"/>' +
            '<line x1="5" y1="14" x2="11" y2="14"/>'
        ),

        chartUp: svg(
            '<polyline points="2 12 6 7 10 9 14 3"/>' +
            '<polyline points="10 3 14 3 14 7"/>'
        ),

        chartDown: svg(
            '<polyline points="2 3 6 8 10 6 14 12"/>' +
            '<polyline points="10 12 14 12 14 8"/>'
        ),

        target: svg(
            '<circle cx="8" cy="8" r="6"/>' +
            '<circle cx="8" cy="8" r="3"/>' +
            '<circle cx="8" cy="8" r="0.5" fill="currentColor"/>'
        ),

        lightbulb: svg(
            '<path d="M6 14h4"/>' +
            '<path d="M6 12.5c-1.5-1-2.5-2.5-2.5-4.5a4.5 4.5 0 019 0c0 2-1 3.5-2.5 4.5"/>' +
            '<line x1="6.5" y1="12.5" x2="9.5" y2="12.5"/>'
        ),

        books: svg(
            '<path d="M2 2h3v12H2z"/>' +
            '<path d="M6 2h3v12H6z"/>' +
            '<path d="M10.5 2l3.5 1-3 11-3.5-1z"/>'
        ),

        pencil: svg(
            '<path d="M11.5 1.5l3 3L5 14H2v-3z"/>' +
            '<line x1="9.5" y1="3.5" x2="12.5" y2="6.5"/>'
        ),

        lock: svg(
            '<rect x="3" y="7" width="10" height="7" rx="1.5"/>' +
            '<path d="M5 7V5a3 3 0 016 0v2"/>'
        ),

        fire: svg(
            '<path d="M8 1C8 1 3 6 3 9.5a5 5 0 0010 0C13 6 8 1 8 1z"/>' +
            '<path d="M8 14c-1.5 0-2.5-1-2.5-2.5S8 8 8 8s2.5 1 2.5 3.5S9.5 14 8 14z" fill="currentColor"/>'
        ),

        check: svg(
            '<polyline points="3 8 6.5 12 13 4"/>'
        )
    };

    Icons.stars = function(n) {
        var s = '';
        for (var i = 0; i < Math.min(Math.max(n || 1, 1), 5); i++) {
            s += Icons.star;
        }
        return s;
    };

    window.Icons = Icons;
})();
