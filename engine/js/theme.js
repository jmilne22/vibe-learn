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

    // Migrate old theme values to dark or light
    function migrateTheme(saved) {
        if (!saved) return null;
        var lightThemes = { 'light': 1, 'gruvbox-light': 1, 'solarized-light': 1, 'everforest-light': 1, 'terminal-light': 1 };
        if (saved === 'dark' || saved === 'light') return saved;
        if (lightThemes[saved]) return 'light';
        return 'dark'; // factorio-dark, oled-dark, gruvbox-dark, solarized-dark, everforest-dark, terminal, etc.
    }

    function _sk(suffix) {
        return window.CourseConfigHelper ? window.CourseConfigHelper.storageKey(suffix) : 'vibe-learn-' + suffix;
    }

    // Theme uses a platform-wide key so it's consistent across courses
    function _themeKey() {
        return 'vibe-learn-theme';
    }

    // Check for saved theme preference with prefers-color-scheme fallback
    function getPreferredTheme() {
        var saved = safeGet(_themeKey()) || safeGet(_sk('theme'));
        var migrated = migrateTheme(saved);
        if (migrated) {
            // Persist the migrated value
            if (migrated !== saved) safeSet(_themeKey(), migrated);
            return migrated;
        }
        // Default: honor system preference
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
            return 'light';
        }
        return 'dark';
    }

    // Apply theme to document
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

        // Sun/moon toggle button
        const toggle = document.createElement('button');
        toggle.className = 'theme-toggle';
        toggle.type = 'button';
        toggle.setAttribute('aria-label', 'Toggle dark/light theme');
        toggle.innerHTML = '<span class="icon-sun">&#9788;</span><span class="icon-moon">&#9790;</span>';
        toggle.addEventListener('click', function() {
            var current = getPreferredTheme();
            setTheme(current === 'light' ? 'dark' : 'light');
        });

        const isLandingPage = !!document.querySelector('.landing');
        const actions = document.createElement('div');
        actions.className = 'theme-actions';

        if (!isLandingPage) {
            createShowTimerToggle(actions);
        }

        wrapper.appendChild(toggle);
        if (actions.childNodes.length > 0) {
            wrapper.appendChild(actions);
        }
        document.body.appendChild(wrapper);
        if (!isLandingPage) {
            createFocusToggleFallback();
        }
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
        if (!safeGet(_themeKey())) {
            setTheme(e.matches ? 'light' : 'dark');
        }
    });
})();
