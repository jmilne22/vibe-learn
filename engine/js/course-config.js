/**
 * Course Configuration Helper
 *
 * Reads window.CourseConfig (set by build-generated course-data.js)
 * and provides helper methods for accessing course metadata.
 */
(function() {
    'use strict';

    var cfg = window.CourseConfig || {};

    var CourseConfigHelper = {
        // Raw config data
        get course() { return cfg.course || {}; },
        get modules() { return cfg.modules || []; },
        get projects() { return cfg.projects || []; },
        get tracks() { return cfg.tracks || []; },
        get annotationTypes() { return cfg.annotationTypes || {}; },

        // Computed helpers (populated by build)
        get moduleNames() { return cfg.moduleNames || {}; },
        get modulesWithExercises() { return cfg.modulesWithExercises || []; },
        get modulesWithoutExercises() { return cfg.modulesWithoutExercises || new Set(); },
        get sidebarPages() { return cfg.sidebarPages || []; },
        get storagePrefix() { return (cfg.course || {}).storagePrefix || 'course'; },
        get slug() { return (cfg.course || {}).slug || 'course'; },
        get name() { return (cfg.course || {}).name || 'Course'; },

        /**
         * Build a localStorage key with the course prefix.
         * storageKey('srs') -> 'go-course-srs'
         */
        storageKey: function(suffix) {
            return this.storagePrefix + '-' + suffix;
        },

        /**
         * Get the display name for a module by ID.
         */
        getModuleName: function(id) {
            return this.moduleNames[id] || ('Module ' + id);
        },

        /**
         * Check whether a module has exercise variant data.
         */
        moduleHasExercises: function(id) {
            var mod = this.modules.find(function(m) { return m.id === id; });
            return mod ? !!mod.hasExercises : false;
        }
    };

    window.CourseConfigHelper = CourseConfigHelper;
})();
