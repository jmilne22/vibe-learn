/**
 * Real-World Challenges — Build Transform
 *
 * Renders markdown in the `requirements` field of each challenge
 * at build time using the shared marked instance.
 */
module.exports = {
    transform: function(data, context) {
        var marked = context.marked;

        if (data.challenges && Array.isArray(data.challenges)) {
            data.challenges.forEach(function(challenge) {
                if (challenge.requirements && typeof challenge.requirements === 'string') {
                    challenge.requirementsHtml = marked.parse(challenge.requirements);
                }
                // Also render hint content as markdown
                if (challenge.hints && Array.isArray(challenge.hints)) {
                    challenge.hints.forEach(function(hint) {
                        if (hint.content && typeof hint.content === 'string') {
                            hint.contentHtml = marked.parse(hint.content);
                        }
                    });
                }
            });
        }

        return data;
    }
};
