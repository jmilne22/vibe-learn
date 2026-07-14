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
        get flashcardModules() { return cfg.flashcardModules || []; },
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
        },

        /**
         * First page of a module — split modules start at moduleN-1.html,
         * single-file modules at moduleN.html. Always use this instead of
         * hardcoding 'moduleN.html'.
         */
        pageForModule: function(id) {
            var page = this.sidebarPages.find(function(p) {
                return (p.type === 'module' && String(p.id) === String(id)) ||
                       (p.type === 'section' && String(p.moduleId) === String(id) && p.sectionIndex === 0);
            });
            return page ? page.file : ('module' + id + '.html');
        }
    };

    window.CourseConfigHelper = CourseConfigHelper;
})();
