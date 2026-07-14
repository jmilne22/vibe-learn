/**
 * Local learning-outcome metrics.
 *
 * This deliberately records learning events rather than page views. The
 * primary signals are first-attempt objective results, delayed retrieval,
 * decision-set accuracy, assist use, and project verification. Everything
 * stays in the course's localStorage namespace and is included in backups.
 */
(function() {
    'use strict';

    var KEY = window.CourseConfigHelper
        ? window.CourseConfigHelper.storageKey('learning-metrics')
        : 'go-course-learning-metrics';
    var MAX_EVENTS = 2500;
    var DAY_MS = 24 * 60 * 60 * 1000;
    var activeAttempts = {};

    function load() {
        try {
            var parsed = JSON.parse(localStorage.getItem(KEY) || '[]');
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            return [];
        }
    }

    function save(events) {
        try {
            localStorage.setItem(KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
        } catch (e) {
            console.warn('Failed to save learning metrics:', e);
        }
    }

    function compact(data) {
        var out = {};
        Object.keys(data || {}).forEach(function(key) {
            var value = data[key];
            if (value !== undefined && value !== null && value !== '') out[key] = value;
        });
        return out;
    }

    function record(type, data) {
        var events = load();
        events.push(Object.assign({ type: type, at: Date.now() }, compact(data || {})));
        save(events);
        return events[events.length - 1];
    }

    function startAttempt(info) {
        info = info || {};
        var id = info.variantKey || info.key;
        if (!id) return;
        activeAttempts[id] = {
            at: Date.now(),
            key: info.key || id,
            variantKey: info.variantKey || id,
            source: info.source || 'practice'
        };
    }

    function previousObjective(events, predicate) {
        for (var i = events.length - 1; i >= 0; i--) {
            if (events[i].type === 'objective_run' && predicate(events[i])) return events[i];
        }
        return null;
    }

    function recordObjective(result, context) {
        context = context || {};
        var events = load();
        var variantKey = result.variantKey || result.key;
        var firstForVariant = !previousObjective(events, function(e) { return e.variantKey === variantKey; });
        var previousForSkill = previousObjective(events, function(e) { return e.key === result.key; });
        var delayDays = previousForSkill ? (result.at - previousForSkill.at) / DAY_MS : 0;
        var active = activeAttempts[variantKey] || activeAttempts[result.key];
        var timeToResultMs = active ? Math.max(0, result.at - active.at) : null;
        delete activeAttempts[variantKey];
        delete activeAttempts[result.key];

        var assist = context.assist || null;
        var event = {
            key: result.key,
            variantKey: variantKey,
            module: result.module,
            pass: !!result.pass,
            firstVariantAttempt: firstForVariant,
            coldPass: !!result.pass && firstForVariant && !assist && !(context.sessionFailures > 0),
            delayDays: Math.round(delayDays * 10) / 10,
            delayed: delayDays >= 1,
            assist: assist,
            sessionFailures: context.sessionFailures || 0,
            timeToResultMs: timeToResultMs,
            testElapsedMs: result.elapsedMs,
            source: context.source || 'local-runner'
        };
        events.push(Object.assign({ type: 'objective_run', at: result.at || Date.now() }, compact(event)));
        save(events);
        return events[events.length - 1];
    }

    function recordDecision(decision, selected, correct) {
        return record('decision_result', {
            decisionId: decision.id,
            family: decision.family,
            module: decision.moduleId,
            selected: selected,
            answer: decision.answer,
            correct: !!correct
        });
    }

    function recordProjectCheck(result) {
        return record('project_check', {
            projectId: result.projectId,
            pass: !!result.pass,
            vetOk: result.vetOk,
            testOk: result.testOk,
            elapsedMs: result.elapsedMs
        });
    }

    function rate(items, predicate) {
        if (!items.length) return null;
        var hits = items.filter(predicate).length;
        return { hits: hits, total: items.length, rate: hits / items.length };
    }

    function median(values) {
        if (!values.length) return null;
        values.sort(function(a, b) { return a - b; });
        var mid = Math.floor(values.length / 2);
        return values.length % 2 ? values[mid] : Math.round((values[mid - 1] + values[mid]) / 2);
    }

    function summary() {
        var events = load();
        var runs = events.filter(function(e) { return e.type === 'objective_run'; });
        var first = runs.filter(function(e) { return e.firstVariantAttempt; });
        var delayed = runs.filter(function(e) { return e.delayed; });
        var decisions = events.filter(function(e) { return e.type === 'decision_result'; });
        var projects = events.filter(function(e) { return e.type === 'project_check'; });
        var greenTimes = runs.filter(function(e) {
            return e.pass && typeof e.timeToResultMs === 'number';
        }).map(function(e) { return e.timeToResultMs; });

        return {
            events: events.length,
            objectiveRuns: runs.length,
            objectivePass: rate(runs, function(e) { return e.pass; }),
            firstAttemptPass: rate(first, function(e) { return e.pass; }),
            coldPass: rate(first, function(e) { return e.coldPass; }),
            delayedPass: rate(delayed, function(e) { return e.pass; }),
            decisionAccuracy: rate(decisions, function(e) { return e.correct; }),
            projectPass: rate(projects, function(e) { return e.pass; }),
            assistedRuns: runs.filter(function(e) { return !!e.assist; }).length,
            medianTimeToGreenMs: median(greenTimes)
        };
    }

    function lastDecisionAt(decisionId) {
        var events = load();
        for (var i = events.length - 1; i >= 0; i--) {
            if (events[i].type === 'decision_result' && events[i].decisionId === decisionId) return events[i].at;
        }
        return 0;
    }

    function exportDiagnostic() {
        var payload = {
            schema: 1,
            course: window.CourseConfigHelper ? window.CourseConfigHelper.slug : 'course',
            exportedAt: new Date().toISOString(),
            summary: summary(),
            events: load()
        };
        var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = payload.course + '-learning-diagnostic-' + new Date().toISOString().slice(0, 10) + '.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    window.LearningMetrics = {
        load: load,
        record: record,
        startAttempt: startAttempt,
        recordObjective: recordObjective,
        recordDecision: recordDecision,
        recordProjectCheck: recordProjectCheck,
        summary: summary,
        lastDecisionAt: lastDecisionAt,
        exportDiagnostic: exportDiagnostic
    };
})();
