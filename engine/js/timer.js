// Pomodoro timer — session timing, break cycles, and floating timer UI
(function() {
    // Don't run timer on pages without a course context (e.g., landing page)
    if (!window.CourseConfig) return;

    function _sk2(suffix) {
        return window.CourseConfigHelper ? window.CourseConfigHelper.storageKey(suffix) : 'vibe-learn-' + suffix;
    }
    const SESSION_KEY = _sk2('session');
    const SOUND_ENABLED_KEY = _sk2('timer-sound');
    const memoryStore = {};
    let sessionInterval = null;

    // Sound notification system
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();

    function playSound(type) {
        try {
            const soundEnabled = localStorage.getItem(SOUND_ENABLED_KEY) !== 'false';
            if (!soundEnabled) return;

            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            if (type === 'break') {
                // Break start: gentle chime (C major chord)
                oscillator.frequency.value = 523.25; // C5
                gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.8);
                oscillator.start(audioContext.currentTime);
                oscillator.stop(audioContext.currentTime + 0.8);
            } else {
                // Work start: upbeat ding (higher pitch)
                oscillator.frequency.value = 659.25; // E5
                gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
                oscillator.start(audioContext.currentTime);
                oscillator.stop(audioContext.currentTime + 0.5);
            }
        } catch (error) {
            console.log('Sound playback failed:', error);
        }
    }

    function formatCountdown(ms) {
        const totalSeconds = Math.max(0, Math.floor(ms / 1000));
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    function getSession() {
        try {
            const raw = localStorage.getItem(SESSION_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (error) {
            return memoryStore[SESSION_KEY] || null;
        }
    }

    function setSession(session) {
        if (!session) {
            try {
                localStorage.removeItem(SESSION_KEY);
            } catch (error) {
                delete memoryStore[SESSION_KEY];
            }
            return;
        }
        try {
            localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        } catch (error) {
            memoryStore[SESSION_KEY] = session;
        }
    }

    function migrateSessionFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const startParam = params.get('sessionStart');
        const minutesParam = params.get('sessionMinutes');
        const pausedParam = params.get('sessionPaused');
        const remainingParam = params.get('sessionRemaining');

        if (!startParam && !minutesParam && !pausedParam && !remainingParam) return;

        const minutes = Number(minutesParam || 25);
        const startAt = Number(startParam || Date.now());
        const paused = pausedParam === '1';
        const remainingSeconds = remainingParam ? Number(remainingParam) : null;

        if (Number.isFinite(minutes) && minutes > 0) {
            if (paused) {
                setSession({
                    status: 'paused',
                    minutes,
                    remainingSeconds: Number.isFinite(remainingSeconds)
                        ? remainingSeconds
                        : minutes * 60
                });
            } else if (Number.isFinite(startAt)) {
                setSession({
                    status: 'running',
                    minutes,
                    startAt
                });
            }
        }

        ['sessionStart', 'sessionMinutes', 'sessionPaused', 'sessionRemaining']
            .forEach(key => params.delete(key));
        const url = new URL(window.location.href);
        url.search = params.toString();
        history.replaceState({}, '', url.toString());
    }

    function normalizeSession(session) {
        if (!session) return null;

        if (typeof session.focusMinutes !== 'number' && typeof session.minutes === 'number') {
            session.focusMinutes = session.minutes;
        }

        if (typeof session.breakMinutes !== 'number') {
            session.breakMinutes = 0;
        }

        if (typeof session.longBreakMinutes !== 'number') {
            session.longBreakMinutes = 15;
        }

        if (typeof session.completedCycles !== 'number') {
            session.completedCycles = 0;
        }

        if (typeof session.cyclesBeforeLongBreak !== 'number') {
            session.cyclesBeforeLongBreak = 4;
        }

        if (!session.phase) {
            session.phase = 'focus';
        }

        return session;
    }

    function getPhaseDurationSeconds(session) {
        if (session.phase === 'prep') {
            return 5 * 60;
        }
        if (session.phase === 'break') {
            return (session.breakMinutes || 0) * 60;
        }
        if (session.phase === 'longBreak') {
            return (session.longBreakMinutes || 15) * 60;
        }
        return (session.focusMinutes || 0) * 60;
    }

    function getRemainingSeconds(session) {
        if (session.status === 'paused') {
            return Math.max(0, Math.floor(session.remainingSeconds || 0));
        }
        const elapsedSeconds = Math.floor((Date.now() - session.startAt) / 1000);
        return Math.max(0, getPhaseDurationSeconds(session) - elapsedSeconds);
    }

    function parseDurationValue(value) {
        if (typeof value === 'number') {
            return { focusMinutes: value, breakMinutes: 0, longBreakMinutes: 15 };
        }

        const raw = String(value || '').trim();
        if (raw.includes('-')) {
            const parts = raw.split('-').map(Number);
            const focus = Number.isFinite(parts[0]) ? parts[0] : 25;
            const shortBreak = Number.isFinite(parts[1]) ? parts[1] : 5;
            const longBreak = Number.isFinite(parts[2]) ? parts[2] : 15;
            return {
                focusMinutes: focus,
                breakMinutes: shortBreak,
                longBreakMinutes: longBreak
            };
        }

        const minutes = Number(raw);
        return {
            focusMinutes: Number.isFinite(minutes) ? minutes : 25,
            breakMinutes: 0,
            longBreakMinutes: 15
        };
    }

    function pickRandom(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    const phaseMessages = {
        prepStart: [
            'Get set up — you have 5 minutes',
            'Open your notes, grab a drink',
            'Pick your task and settle in',
            'Clear your desk, get comfortable',
        ],
        focusStart: [
            'Prep done — let\'s go',
            'Alright, focus time',
            'Time to lock in',
            'Let\'s get to work',
        ],
        breakStart: [
            'Step away from the screen',
            'Grab a drink, stretch your legs',
            'Take a breather',
            'Good work — take a break',
        ],
        backToWork: [
            'Break\'s over — back to it',
            'Ready for another round',
            'Recharged? Let\'s continue',
            'Back at it',
        ],
    };

    function showTimerCompletion(message) {
        // Flash visual feedback
        const timers = [
            document.getElementById('session-timer'),
            document.getElementById('floating-session-timer')
        ].filter(Boolean);

        timers.forEach(timer => {
            timer.classList.add('timer-complete');
            setTimeout(() => {
                timer.classList.remove('timer-complete');
            }, 1000);
        });

        // Show browser notification if supported
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('Go Course Timer', {
                body: message,
                icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="75" font-size="75">⏱️</text></svg>'
            });
        }
    }

    function ensureFloatingTimer() {
        let timer = document.getElementById('floating-session-timer');
        if (timer) return timer;

        timer = document.createElement('div');
        timer.id = 'floating-session-timer';
        timer.className = 'floating-session-timer';
        timer.innerHTML = `
            <div class="session-timer-header">
                <span class="session-title">Session</span>
                <span class="session-countdown" id="floating-session-countdown">25:00</span>
            </div>
            <div class="session-progress">
                <div class="session-progress-bar" id="floating-session-progress"></div>
            </div>
            <div class="session-meta" id="floating-session-label">Focus block</div>
            <div class="session-message" id="floating-session-message"></div>
            <div class="session-controls">
                <button class="session-control-btn" type="button" data-session-action="toggle">Pause</button>
                <button class="session-control-btn" type="button" data-session-action="reset">Reset</button>
                <button class="session-control-btn" type="button" data-session-action="sound">${(window.Icons ? Icons.bell : '')} Sound</button>
                <button class="session-control-btn danger" type="button" data-session-action="hide">Hide</button>
            </div>
            <div class="session-duration-row">
                <label for="floating-session-duration">Duration</label>
                <select id="floating-session-duration" class="session-duration-select">
                    <option value="25-5-15">25/5/15</option>
                    <option value="50-10-15">50/10/15</option>
                    <option value="90-20-30">90/20/30</option>
                </select>
            </div>
        `;

        document.body.appendChild(timer);
        bindTimerControls(timer);
        return timer;
    }

    function renderTimer({
        countdownText,
        progressWidth,
        labelText,
        messageText,
        toggleLabel,
        showToggle
    }) {
        const dashboardTimer = document.getElementById('session-timer');

        if (dashboardTimer) {
            const countdown = document.getElementById('session-countdown');
            const progress = document.getElementById('session-progress');
            const label = document.getElementById('session-label');
            const message = document.getElementById('session-message');
            const toggleBtn = dashboardTimer.querySelector('[data-session-action="toggle"]');

            dashboardTimer.hidden = false;
            if (countdown) countdown.textContent = countdownText;
            if (progress) progress.style.width = progressWidth;
            if (label) label.textContent = labelText;
            if (message) message.textContent = messageText || '';
            if (toggleBtn && toggleLabel) toggleBtn.textContent = toggleLabel;
            if (toggleBtn) toggleBtn.hidden = !showToggle;

            bindTimerControls(dashboardTimer);
            return;
        }

        const floating = ensureFloatingTimer();
        const countdown = floating.querySelector('#floating-session-countdown');
        const progress = floating.querySelector('#floating-session-progress');
        const label = floating.querySelector('#floating-session-label');
        const message = floating.querySelector('#floating-session-message');
        const toggleBtn = floating.querySelector('[data-session-action="toggle"]');

        if (countdown) countdown.textContent = countdownText;
        if (progress) progress.style.width = progressWidth;
        if (label) label.textContent = labelText;
        if (message) message.textContent = messageText || '';
        if (toggleBtn && toggleLabel) toggleBtn.textContent = toggleLabel;
        if (toggleBtn) toggleBtn.hidden = !showToggle;
    }

    function bindTimerControls(root) {
        const toggle = root.querySelector('[data-session-action="toggle"]');
        const reset = root.querySelector('[data-session-action="reset"]');
        const hide = root.querySelector('[data-session-action="hide"]');
        const sound = root.querySelector('[data-session-action="sound"]');
        const duration = root.querySelector('.session-duration-select');

        if (toggle) {
            toggle.onclick = () => togglePauseSession();
        }

        if (reset) {
            reset.onclick = () => resetSession();
        }

        if (hide) {
            hide.onclick = () => hideFloatingTimer();
        }

        if (sound) {
            sound.onclick = () => {
                toggleTimerSound();
                // Update this button's text
                const soundEnabled = localStorage.getItem(SOUND_ENABLED_KEY) !== 'false';
                sound.innerHTML = (soundEnabled ? Icons.bell : Icons.bellMuted) + ' Sound';
            };
            // Set initial state
            const soundEnabled = localStorage.getItem(SOUND_ENABLED_KEY) !== 'false';
            sound.innerHTML = (soundEnabled ? Icons.bell : Icons.bellMuted) + ' Sound';
        }

        if (duration) {
            duration.onchange = () => {
                if (window.updateSessionDuration) {
                    window.updateSessionDuration(duration.value);
                }
            };
        }

    }

    function seedPausedSession(minutes) {
        const { focusMinutes, breakMinutes, longBreakMinutes } = parseDurationValue(minutes);
        setSession({
            status: 'paused',
            phase: 'focus',
            focusMinutes,
            breakMinutes,
            longBreakMinutes,
            completedCycles: 0,
            cyclesBeforeLongBreak: 4,
            remainingSeconds: focusMinutes * 60,
            hidden: false
        });
    }

    function resetSession() {
        const session = normalizeSession(getSession());
        const focusMinutes = session?.focusMinutes || session?.minutes || 25;
        const breakMinutes = session?.breakMinutes || 0;
        const longBreakMinutes = session?.longBreakMinutes || 15;
        seedPausedSession(`${focusMinutes}-${breakMinutes}-${longBreakMinutes}`);
        updateSessionTimer();
    }

    function togglePauseSession() {
        const session = normalizeSession(getSession());
        if (!session) return;

        if (session.status === 'paused') {
            const totalSeconds = getPhaseDurationSeconds(session);
            const remainingSeconds = Math.max(0, session.remainingSeconds || totalSeconds);

            // Detect fresh start: seeded focus session with no elapsed time
            const isFreshStart = session.phase === 'focus'
                && (session.completedCycles || 0) === 0
                && remainingSeconds === (session.focusMinutes || 0) * 60;

            if (isFreshStart) {
                setSession({
                    status: 'running',
                    phase: 'prep',
                    focusMinutes: session.focusMinutes || session.minutes,
                    breakMinutes: session.breakMinutes || 0,
                    longBreakMinutes: session.longBreakMinutes || 15,
                    completedCycles: 0,
                    cyclesBeforeLongBreak: session.cyclesBeforeLongBreak || 4,
                    startAt: Date.now(),
                    message: pickRandom(phaseMessages.prepStart),
                    hidden: false
                });
            } else {
                const elapsedSeconds = totalSeconds - remainingSeconds;
                setSession({
                    status: 'running',
                    phase: session.phase || 'focus',
                    focusMinutes: session.focusMinutes || session.minutes,
                    breakMinutes: session.breakMinutes || 0,
                    longBreakMinutes: session.longBreakMinutes || 15,
                    completedCycles: session.completedCycles || 0,
                    cyclesBeforeLongBreak: session.cyclesBeforeLongBreak || 4,
                    startAt: Date.now() - elapsedSeconds * 1000,
                    message: session.message || '',
                    hidden: false
                });
            }
        } else {
            const remainingSeconds = getRemainingSeconds(session);
            setSession({
                status: 'paused',
                phase: session.phase || 'focus',
                focusMinutes: session.focusMinutes || session.minutes,
                breakMinutes: session.breakMinutes || 0,
                longBreakMinutes: session.longBreakMinutes || 15,
                completedCycles: session.completedCycles || 0,
                cyclesBeforeLongBreak: session.cyclesBeforeLongBreak || 4,
                remainingSeconds,
                message: session.message || '',
                hidden: false
            });
        }

        updateSessionTimer();
    }

    function hideFloatingTimer() {
        const session = getSession();
        if (!session) return;
        session.hidden = true;
        setSession(session);
        const floating = document.getElementById('floating-session-timer');
        if (floating) floating.remove();
        updateSessionTimer();
    }

    function showFloatingTimer() {
        const session = getSession();
        if (!session) return;
        session.hidden = false;
        setSession(session);
        updateSessionTimer();
    }

    function updateSessionTimer() {
        migrateSessionFromUrl();
        const session = getSession();
        const dashboardTimer = document.getElementById('session-timer');
        const floatingTimer = document.getElementById('floating-session-timer');
        const showTimerToggle = document.querySelector('.show-timer-toggle');

        if (!session) {
            if (dashboardTimer) {
                const durationSelect = document.getElementById('session-duration');
                const minutes = durationSelect ? durationSelect.value : '25-5';
                seedPausedSession(minutes);
                updateSessionTimer();
                return;
            }
            if (dashboardTimer) dashboardTimer.hidden = true;
            if (floatingTimer) floatingTimer.remove();
            if (sessionInterval) {
                clearInterval(sessionInterval);
                sessionInterval = null;
            }
            if (showTimerToggle) {
                showTimerToggle.hidden = true;
            }
            return;
        }

        if (showTimerToggle) {
            const shouldShowToggle = session.hidden && !dashboardTimer;
            showTimerToggle.hidden = !shouldShowToggle;
            showTimerToggle.style.display = shouldShowToggle ? 'inline-flex' : 'none';
        }

        const remainingSeconds = getRemainingSeconds(session);
        const totalSeconds = getPhaseDurationSeconds(session);

        if (!dashboardTimer && session.hidden) {
            if (session.status === 'running') {
                if (remainingSeconds <= 0) {
                    setSession(null);
                }
                if (!sessionInterval) {
                    sessionInterval = setInterval(updateSessionTimer, 1000);
                }
            } else if (sessionInterval) {
                clearInterval(sessionInterval);
                sessionInterval = null;
            }
            return;
        }

        if (session.hidden) {
            session.hidden = false;
            setSession(session);
        }

        const countdownText = formatCountdown(remainingSeconds * 1000);
        const pct = Math.min(1, Math.max(0, 1 - remainingSeconds / totalSeconds));
        const progressWidth = `${Math.round(pct * 100)}%`;

        let statusLabel = 'Stopped';
        let labelMinutes = session.focusMinutes || 0;

        if (session.status !== 'paused') {
            if (session.phase === 'prep') {
                statusLabel = 'Prep';
                labelMinutes = 5;
            } else if (session.phase === 'longBreak') {
                statusLabel = 'Long break';
                labelMinutes = session.longBreakMinutes || 15;
            } else if (session.phase === 'break') {
                statusLabel = 'Break';
                labelMinutes = session.breakMinutes || 0;
            } else {
                statusLabel = 'Focus block';
                labelMinutes = session.focusMinutes || 0;
            }
        }

        const cycleInfo = ` • ${session.completedCycles || 0}/${session.cyclesBeforeLongBreak || 4}`;
        const labelText = `${statusLabel} • ${labelMinutes} min${cycleInfo}`;
        const toggleLabel = session.status === 'paused' ? 'Start' : 'Pause';
        const showToggle = !(dashboardTimer && session.status === 'paused');

        renderTimer({
            countdownText,
            progressWidth,
            labelText,
            messageText: session.message || '',
            toggleLabel,
            showToggle
        });

        if (floatingTimer) {
            const duration = floatingTimer.querySelector('.session-duration-select');
            if (duration) {
                const longBreak = session.longBreakMinutes || 15;
                duration.value = `${session.focusMinutes || 25}-${session.breakMinutes || 0}-${longBreak}`;
            }
        }

        if (session.status === 'running' && remainingSeconds <= 0) {
            // Prep phase completed - transition to focus
            if (session.phase === 'prep') {
                const msg = pickRandom(phaseMessages.focusStart);
                playSound('work');
                showTimerCompletion(msg);
                setSession({
                    status: 'running',
                    phase: 'focus',
                    focusMinutes: session.focusMinutes,
                    breakMinutes: session.breakMinutes,
                    longBreakMinutes: session.longBreakMinutes || 15,
                    completedCycles: session.completedCycles || 0,
                    cyclesBeforeLongBreak: session.cyclesBeforeLongBreak || 4,
                    startAt: Date.now(),
                    message: msg,
                    hidden: false
                });
                updateSessionTimer();
                return;
            }

            // Focus session completed - increment cycle and start break
            if (session.phase === 'focus' && session.breakMinutes > 0) {
                const newCompletedCycles = (session.completedCycles || 0) + 1;
                const needsLongBreak = newCompletedCycles % (session.cyclesBeforeLongBreak || 4) === 0;

                const msg = pickRandom(phaseMessages.breakStart);
                playSound('break');
                showTimerCompletion(msg);

                setSession({
                    status: 'running',
                    phase: needsLongBreak ? 'longBreak' : 'break',
                    focusMinutes: session.focusMinutes,
                    breakMinutes: session.breakMinutes,
                    longBreakMinutes: session.longBreakMinutes || 15,
                    completedCycles: newCompletedCycles,
                    cyclesBeforeLongBreak: session.cyclesBeforeLongBreak || 4,
                    startAt: Date.now(),
                    message: msg,
                    hidden: false
                });
                updateSessionTimer();
                return;
            }

            // Break completed - automatically start next focus session
            if ((session.phase === 'break' || session.phase === 'longBreak') && session.focusMinutes > 0) {
                const msg = pickRandom(phaseMessages.backToWork);
                playSound('work');
                showTimerCompletion(msg);

                setSession({
                    status: 'running',
                    phase: 'focus',
                    focusMinutes: session.focusMinutes,
                    breakMinutes: session.breakMinutes,
                    longBreakMinutes: session.longBreakMinutes || 15,
                    completedCycles: session.completedCycles || 0,
                    cyclesBeforeLongBreak: session.cyclesBeforeLongBreak || 4,
                    startAt: Date.now(),
                    message: msg,
                    hidden: false
                });
                updateSessionTimer();
                return;
            }

            // Fallback: if no break configured, pause at focus
            setSession({
                status: 'paused',
                phase: 'focus',
                focusMinutes: session.focusMinutes,
                breakMinutes: session.breakMinutes,
                longBreakMinutes: session.longBreakMinutes || 15,
                completedCycles: session.completedCycles || 0,
                cyclesBeforeLongBreak: session.cyclesBeforeLongBreak || 4,
                remainingSeconds: session.focusMinutes * 60,
                hidden: false
            });
            updateSessionTimer();
            return;
        }

        if (session.status === 'running') {
            if (!sessionInterval) {
                sessionInterval = setInterval(updateSessionTimer, 1000);
            }
        } else if (sessionInterval) {
            clearInterval(sessionInterval);
            sessionInterval = null;
        }
    }

    function startSession(minutes) {
        // Request notification permission
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }

        const { focusMinutes, breakMinutes, longBreakMinutes } = parseDurationValue(minutes);
        setSession({
            status: 'running',
            phase: 'prep',
            focusMinutes,
            breakMinutes,
            longBreakMinutes,
            completedCycles: 0,
            cyclesBeforeLongBreak: 4,
            startAt: Date.now(),
            message: pickRandom(phaseMessages.prepStart),
            hidden: false
        });
        updateSessionTimer();

        const lastModule = localStorage.getItem(_sk2('last-module'));
        const target = lastModule ? `module${lastModule}.html` : 'module0.html';
        window.open(target, '_blank');
    }

    function updateSessionDuration(minutes) {
        const { focusMinutes, breakMinutes, longBreakMinutes } = parseDurationValue(minutes);
        if (!Number.isFinite(focusMinutes) || focusMinutes <= 0) return;
        seedPausedSession(`${focusMinutes}-${breakMinutes}-${longBreakMinutes}`);
        updateSessionTimer();
    }

    function toggleTimerSound() {
        const currentState = localStorage.getItem(SOUND_ENABLED_KEY) !== 'false';
        const newState = !currentState;
        localStorage.setItem(SOUND_ENABLED_KEY, String(newState));

        // Update button text
        const btn = document.getElementById('sound-toggle');
        if (btn) {
            btn.innerHTML = (newState ? Icons.bell : Icons.bellMuted) + ' Sound';
        }
    }

    function updateSoundButtonState() {
        const soundEnabled = localStorage.getItem(SOUND_ENABLED_KEY) !== 'false';
        const btn = document.getElementById('sound-toggle');
        if (btn) {
            btn.innerHTML = (soundEnabled ? Icons.bell : Icons.bellMuted) + ' Sound';
        }
    }

    window.startTimerSession = startSession;
    window.updateSessionTimer = updateSessionTimer;
    window.updateSessionDuration = updateSessionDuration;
    window.sessionReset = resetSession;
    window.sessionToggle = togglePauseSession;
    window.sessionShow = showFloatingTimer;
    window.toggleTimerSound = toggleTimerSound;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            updateSessionTimer();
            updateSoundButtonState();
        });
    } else {
        updateSessionTimer();
        updateSoundButtonState();
    }
})();
