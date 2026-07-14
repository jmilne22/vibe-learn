/**
 * Bounded session allocation.
 *
 * Course content can grow without growing Today's workload. This allocator
 * reserves time for retrieval, learning and building, then uses the remaining
 * budget for reviews. The full practice bank remains available separately.
 */
(function() {
    'use strict';

    var DEFAULT_BUDGET = 15;
    var COST = {
        pretest: 1,
        learn: 7,
        review: 1.25,
        decision: 1.5,
        build: 3
    };

    function allocate(opts) {
        opts = opts || {};
        var budget = Math.max(5, opts.budget || DEFAULT_BUDGET);
        var hasLearn = !!opts.hasLearn;
        var hasBuild = !!opts.hasBuild;
        var hasDecision = !!opts.hasDecision;
        var dueCount = Math.max(0, opts.dueCount || 0);

        var allocation = {
            budget: budget,
            pretestCount: hasLearn ? 1 : 0,
            learnCount: hasLearn ? 1 : 0,
            decisionCount: hasDecision ? 1 : 0,
            buildCount: hasBuild ? 1 : 0,
            reviewCount: 0
        };

        var reserved = allocation.pretestCount * COST.pretest +
            allocation.learnCount * COST.learn +
            allocation.decisionCount * COST.decision +
            allocation.buildCount * COST.build;

        // If the full spine does not fit, keep build + retrieval and drop the
        // optional decision card before shrinking the learning step.
        if (reserved > budget && allocation.decisionCount) {
            allocation.decisionCount = 0;
            reserved -= COST.decision;
        }
        if (reserved > budget && allocation.pretestCount) {
            allocation.pretestCount = 0;
            reserved -= COST.pretest;
        }

        var slots = Math.floor(Math.max(0, budget - reserved) / COST.review);
        // A learning session gets at least one retrieval item when one exists;
        // a review-only session can spend its whole budget on the queue.
        if (dueCount > 0 && slots === 0 && reserved + COST.review <= budget + 1) slots = 1;
        allocation.reviewCount = dueCount > 0 ? Math.min(dueCount, slots) : 0;

        // When nothing is due, mix up to two previously tracked items without
        // letting padding turn a dense content bank into a long session.
        if (dueCount === 0 && opts.trackedCount > 0) {
            allocation.reviewCount = Math.min(2, slots);
        }

        allocation.estimatedMinutes = Math.ceil(
            allocation.pretestCount * COST.pretest +
            allocation.learnCount * COST.learn +
            allocation.reviewCount * COST.review +
            allocation.decisionCount * COST.decision +
            allocation.buildCount * COST.build
        );
        return allocation;
    }

    window.SessionComposer = {
        DEFAULT_BUDGET: DEFAULT_BUDGET,
        COST: COST,
        allocate: allocate
    };
})();
