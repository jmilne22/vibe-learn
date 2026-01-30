// Streak tracker and activity heatmap for Go course
// Uses localStorage to persist streak and activity data

var STREAK_KEY = window.CourseConfigHelper ? window.CourseConfigHelper.storageKey('streaks') : 'go-course-streaks';
var ACTIVITY_KEY = window.CourseConfigHelper ? window.CourseConfigHelper.storageKey('activity') : 'go-course-activity';

function getToday() {
    return new Date().toISOString().split('T')[0];
}

function getYesterday() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
}

function loadStreaks() {
    try {
        const raw = localStorage.getItem(STREAK_KEY);
        if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    return { current: 0, longest: 0, lastActiveDate: null };
}

function saveStreaks(data) {
    localStorage.setItem(STREAK_KEY, JSON.stringify(data));
}

function loadActivity() {
    try {
        const raw = localStorage.getItem(ACTIVITY_KEY);
        if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    return {};
}

function saveActivity(data) {
    localStorage.setItem(ACTIVITY_KEY, JSON.stringify(data));
}

function recordActivity() {
    const today = getToday();
    const yesterday = getYesterday();

    // Update activity count
    const activity = loadActivity();
    if (!activity[today]) {
        activity[today] = { exercises: 0 };
    }
    activity[today].exercises++;
    saveActivity(activity);

    // Update streak
    const streaks = loadStreaks();
    if (streaks.lastActiveDate !== today) {
        if (streaks.lastActiveDate === yesterday) {
            streaks.current++;
        } else {
            streaks.current = 1;
        }
        streaks.lastActiveDate = today;
    }
    streaks.longest = Math.max(streaks.longest, streaks.current);
    saveStreaks(streaks);
}

function getCurrent() {
    const streaks = loadStreaks();
    const yesterday = getYesterday();
    const today = getToday();
    // If last active date is before yesterday, streak is broken
    if (streaks.lastActiveDate && streaks.lastActiveDate < yesterday) {
        return 0;
    }
    // Also return 0 if never active
    if (!streaks.lastActiveDate) return 0;
    return streaks.current;
}

function getLongest() {
    return loadStreaks().longest;
}

function getTodayCount() {
    const activity = loadActivity();
    const today = getToday();
    return activity[today] ? activity[today].exercises : 0;
}

function isActiveToday() {
    return getTodayCount() > 0;
}

function getActivityData() {
    return loadActivity();
}

function getLevel(count) {
    if (count === 0) return 0;
    if (count <= 2) return 1;
    if (count <= 5) return 2;
    return 3;
}

function formatDateLabel(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return months[d.getMonth()] + ' ' + d.getDate();
}

function renderHeatmap(container) {
    const activity = loadActivity();
    container.innerHTML = '';
    container.classList.add('activity-heatmap');

    const cellSize = 12;
    const gap = 2;
    const step = cellSize + gap;
    const dayLabelWidth = 28;
    const headerHeight = 16;
    const totalWeeks = 13;
    const dayLabels = { 1: 'Mon', 3: 'Wed', 5: 'Fri' };

    // Find the start of the grid: go back to the Sunday of 12 weeks ago
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=Sun
    const endDate = new Date(today);
    // Start from the Sunday of the current week, then go back 12 weeks
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - dayOfWeek - (12 * 7));

    const svgWidth = dayLabelWidth + totalWeeks * step;
    const svgHeight = headerHeight + 7 * step;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', svgWidth);
    svg.setAttribute('height', svgHeight);
    svg.style.display = 'block';

    // Month labels
    let lastMonth = -1;
    for (let week = 0; week < totalWeeks; week++) {
        const weekStart = new Date(startDate);
        weekStart.setDate(startDate.getDate() + week * 7);
        const month = weekStart.getMonth();
        if (month !== lastMonth) {
            lastMonth = month;
            const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', dayLabelWidth + week * step);
            text.setAttribute('y', 11);
            text.setAttribute('font-size', '10');
            text.setAttribute('fill', 'var(--text-dim)');
            text.setAttribute('font-family', 'inherit');
            text.textContent = months[month];
            svg.appendChild(text);
        }
    }

    // Day labels
    for (const [row, label] of Object.entries(dayLabels)) {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', 0);
        text.setAttribute('y', headerHeight + row * step + cellSize - 2);
        text.setAttribute('font-size', '10');
        text.setAttribute('fill', 'var(--text-dim)');
        text.setAttribute('font-family', 'inherit');
        text.textContent = label;
        svg.appendChild(text);
    }

    // Cells
    for (let week = 0; week < totalWeeks; week++) {
        for (let day = 0; day < 7; day++) {
            const cellDate = new Date(startDate);
            cellDate.setDate(startDate.getDate() + week * 7 + day);

            // Don't render future dates
            if (cellDate > today) continue;

            const dateStr = cellDate.toISOString().split('T')[0];
            const count = activity[dateStr] ? activity[dateStr].exercises : 0;
            const level = getLevel(count);

            const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect.setAttribute('x', dayLabelWidth + week * step);
            rect.setAttribute('y', headerHeight + day * step);
            rect.setAttribute('width', cellSize);
            rect.setAttribute('height', cellSize);
            rect.setAttribute('rx', 2);

            let fill;
            if (level === 0) fill = 'var(--bg-lighter)';
            else if (level === 1) fill = 'var(--green-dim)';
            else if (level === 2) fill = 'var(--green-bright)';
            else fill = 'var(--green-bright)';

            rect.setAttribute('fill', fill);
            if (level === 2) rect.setAttribute('opacity', '0.6');

            const label = formatDateLabel(dateStr);
            const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
            title.textContent = count > 0 ? label + ': ' + count + ' exercises' : label + ': No activity';
            rect.appendChild(title);

            svg.appendChild(rect);
        }
    }

    container.appendChild(svg);
}

// Listen for exercise completions
window.addEventListener('exerciseRated', function() {
    Streaks.recordActivity();
});

// Expose public API
window.Streaks = {
    recordActivity: recordActivity,
    getCurrent: getCurrent,
    getLongest: getLongest,
    getTodayCount: getTodayCount,
    isActiveToday: isActiveToday,
    getActivityData: getActivityData,
    renderHeatmap: renderHeatmap
};
