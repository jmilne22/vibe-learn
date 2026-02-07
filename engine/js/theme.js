// Theme toggle and focus mode
(function() {
    const memoryStore = {};

    function safeGet(key) {
        try {
            return localStorage.getItem(key);
        } catch (error) {
            return Object.prototype.hasOwnProperty.call(memoryStore, key)
                ? memoryStore[key]
                : null;
        }
    }

    function safeSet(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (error) {
            memoryStore[key] = value;
        }
    }

    function safeRemove(key) {
        try {
            localStorage.removeItem(key);
        } catch (error) {
            delete memoryStore[key];
        }
    }

    const themeGroups = [
        {
            label: 'Factorio',
            options: [
                { value: 'factorio-dark', label: 'Dark' }
            ]
        },
        {
            label: 'Persona 5',
            options: [
                { value: 'persona5-dark', label: 'Dark' }
            ]
        },
        {
            label: 'Classic',
            options: [
                { value: 'dark', label: 'Dark' },
                { value: 'oled-dark', label: 'OLED' },
                { value: 'light', label: 'Light' }
            ]
        },
        {
            label: 'Gruvbox',
            options: [
                { value: 'gruvbox-dark', label: 'Dark' },
                { value: 'gruvbox-light', label: 'Light' }
            ]
        },
        {
            label: 'Solarized',
            options: [
                { value: 'solarized-dark', label: 'Dark' },
                { value: 'solarized-light', label: 'Light' }
            ]
        },
        {
            label: 'Everforest',
            options: [
                { value: 'everforest-dark', label: 'Dark' },
                { value: 'everforest-light', label: 'Light' }
            ]
        }
    ];

    // All valid theme values
    const validThemes = new Set(themeGroups.flatMap(g => g.options.map(o => o.value)));

    function _sk(suffix) {
        return window.CourseConfigHelper ? window.CourseConfigHelper.storageKey(suffix) : 'vibe-learn-' + suffix;
    }

    // Theme uses a platform-wide key so it's consistent across courses
    function _themeKey() {
        return 'vibe-learn-theme';
    }

    // Check for saved theme preference or default to dark
    function getPreferredTheme() {
        // Try platform-wide key first, then fall back to per-course key
        const saved = safeGet(_themeKey()) || safeGet(_sk('theme'));
        if (saved && validThemes.has(saved)) {
            return saved;
        }
        // Default to Factorio
        return 'factorio-dark';
    }

    // Theme-specific Google Fonts URLs (loaded async, not via @import)
    var themeFonts = {
        'factorio-dark': 'https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Titillium+Web:wght@400;600;700&display=swap',
        'persona5-dark': 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;900&family=Bebas+Neue&family=Archivo+Black&display=swap'
    };

    // Apply theme to document and swap the theme CSS + fonts
    function setTheme(theme) {
        if (theme === 'dark') {
            document.documentElement.removeAttribute('data-theme');
            var removeLink = document.getElementById('theme-css');
            if (removeLink) removeLink.remove();
        } else {
            document.documentElement.setAttribute('data-theme', theme);
            var link = document.getElementById('theme-css');
            if (!link) {
                link = document.createElement('link');
                link.rel = 'stylesheet';
                link.id = 'theme-css';
                document.head.appendChild(link);
            }
            link.href = 'themes/' + theme + '.css';
        }

        // Swap theme font
        var oldFont = document.getElementById('theme-font');
        if (oldFont) oldFont.remove();
        if (themeFonts[theme]) {
            var fontLink = document.createElement('link');
            fontLink.rel = 'stylesheet';
            fontLink.id = 'theme-font';
            fontLink.href = themeFonts[theme];
            document.head.appendChild(fontLink);
        }

        safeSet(_themeKey(), theme);
    }

    // Initialize theme immediately to prevent flash
    setTheme(getPreferredTheme());

    const focusStorageKey = _sk('focus-mode');

    function isFocusModeEnabled() {
        return safeGet(focusStorageKey) === 'on';
    }

    function setFocusMode(enabled) {
        document.body.classList.toggle('focus-mode', enabled);
        safeSet(focusStorageKey, enabled ? 'on' : 'off');
    }

    window.goCourseFocus = {
        isEnabled: isFocusModeEnabled,
        set: setFocusMode
    };

    function createFocusToggle(target) {
        if (!target || document.querySelector('.focus-toggle')) {
            return;
        }
        const button = document.createElement('button');
        button.className = 'focus-toggle';
        button.type = 'button';
        button.setAttribute('aria-label', 'Toggle focus mode');

        const updateLabel = () => {
            const enabled = isFocusModeEnabled();
            button.textContent = enabled ? 'Focus Off' : 'Focus On';
            button.classList.toggle('active', enabled);
        };

        updateLabel();

        button.addEventListener('click', () => {
            setFocusMode(!isFocusModeEnabled());
            updateLabel();
        });

        target.appendChild(button);
    }

    function createShowTimerToggle(target) {
        if (!target || document.querySelector('.show-timer-toggle')) {
            return;
        }
        const button = document.createElement('button');
        button.className = 'show-timer-toggle';
        button.type = 'button';
        button.textContent = 'Show timer';
        button.setAttribute('aria-label', 'Show session timer');
        button.addEventListener('click', () => {
            if (window.sessionShow) {
                window.sessionShow();
            }
        });
        target.appendChild(button);
    }

    function createFocusToggleFallback() {
        if (document.querySelector('.focus-toggle')) {
            return;
        }
        const wrapper = document.querySelector('.theme-actions');
        if (!wrapper) return;
        createFocusToggle(wrapper);
    }

    // Create and inject theme picker when DOM is ready
    function createThemePicker() {
        const wrapper = document.createElement('div');
        wrapper.className = 'theme-picker';

        const label = document.createElement('div');
        label.className = 'theme-picker-label';
        label.textContent = 'Theme';

        const select = document.createElement('select');
        select.className = 'theme-select';
        select.setAttribute('aria-label', 'Select color theme');

        themeGroups.forEach(group => {
            const optgroup = document.createElement('optgroup');
            optgroup.label = group.label;
            group.options.forEach(theme => {
                const option = document.createElement('option');
                option.value = theme.value;
                option.textContent = theme.label;
                optgroup.appendChild(option);
            });
            select.appendChild(optgroup);
        });

        select.value = getPreferredTheme();
        updateThemeLabel(select.value, label);
        select.addEventListener('change', () => {
            setTheme(select.value);
            updateThemeLabel(select.value, label);
        });

        const isLandingPage = !!document.querySelector('.landing');
        const actions = document.createElement('div');
        actions.className = 'theme-actions';

        if (!isLandingPage) {
            createShowTimerToggle(actions);
        }

        wrapper.appendChild(label);
        wrapper.appendChild(select);
        if (actions.childNodes.length > 0) {
            wrapper.appendChild(actions);
        }
        document.body.appendChild(wrapper);
        if (!isLandingPage) {
            createFocusToggleFallback();
        }
    }

    function updateThemeLabel(value, labelEl) {
        for (const group of themeGroups) {
            const match = group.options.find(option => option.value === value);
            if (match) {
                labelEl.textContent = `${group.label} • ${match.label}`;
                return;
            }
        }
        labelEl.textContent = 'Theme';
    }

    // Wait for DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            createThemePicker();
            createFocusToggle(document.getElementById('focus-toggle-slot'));
            setFocusMode(isFocusModeEnabled());
        });
    } else {
        createThemePicker();
        createFocusToggle(document.getElementById('focus-toggle-slot'));
        setFocusMode(isFocusModeEnabled());
    }

    // Listen for system theme changes (only if no saved preference)
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', function(e) {
        if (!safeGet(_sk('theme'))) {
            setTheme(e.matches ? 'light' : 'dark');
        }
    });
})();
