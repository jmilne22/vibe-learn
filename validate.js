/**
 * Build-time validation for course data.
 *
 * Exports validateCourse(courseJson, courseDir, storagePrefixes)
 * which returns { warnings: string[], errors: string[] }.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

/**
 * Validate a parsed course manifest and its associated content files.
 *
 * @param {Object} courseJson - Parsed and normalized course manifest
 * @param {string} courseDir - Absolute path to the course directory (courses/<slug>/)
 * @param {Set<string>} storagePrefixes - Shared set of seen storage prefixes (mutated)
 * @returns {{ warnings: string[], errors: string[] }}
 */
function validateCourse(courseJson, courseDir, storagePrefixes) {
    const warnings = [];
    const errors = [];
    const { course, modules, tracks, projects } = courseJson;
    const slug = course && course.slug || path.basename(courseDir);

    function warn(msg) { warnings.push(`⚠ [${slug}] ${msg}`); }
    function fail(msg) { errors.push(`✗ [${slug}] ${msg}`); }

    // -----------------------------------------------------------------------
    // Course manifest
    // -----------------------------------------------------------------------
    if (!course) {
        fail('Missing "course" object in manifest');
        return { warnings, errors };
    }
    if (!course.name) fail('course.name is required');
    if (!course.slug) fail('course.slug is required');
    if (!course.storagePrefix) {
        fail('course.storagePrefix is required');
    } else if (storagePrefixes.has(course.storagePrefix)) {
        fail(`Duplicate storagePrefix "${course.storagePrefix}" — must be unique across all courses`);
    } else {
        storagePrefixes.add(course.storagePrefix);
    }

    if (!Array.isArray(modules) || modules.length === 0) {
        fail('modules array is required and must not be empty');
        return { warnings, errors };
    }

    // Build a set of valid module IDs for cross-referencing
    const moduleIds = new Set(modules.map(m => m.id));

    modules.forEach((mod, idx) => {
        if (!mod.title) fail(`modules[${idx}] is missing "title"`);
    });

    // -----------------------------------------------------------------------
    // Tracks
    // -----------------------------------------------------------------------
    if (Array.isArray(tracks)) {
        tracks.forEach((track, tIdx) => {
            if (!track.title) fail(`tracks[${tIdx}] is missing "title"`);
            if (!Array.isArray(track.modules)) {
                fail(`tracks[${tIdx}] is missing "modules" array`);
            } else {
                track.modules.forEach(modId => {
                    if (!moduleIds.has(modId)) {
                        fail(`tracks[${tIdx}] references non-existent module ID ${modId}`);
                    }
                });
            }
        });
    }

    // -----------------------------------------------------------------------
    // Projects
    // -----------------------------------------------------------------------
    if (Array.isArray(projects)) {
        projects.forEach((proj, pIdx) => {
            if (!proj.id) fail(`projects[${pIdx}] is missing "id"`);
            if (proj.num === undefined) fail(`projects[${pIdx}] is missing "num"`);
            if (!proj.title) fail(`projects[${pIdx}] is missing "title"`);
            if (!proj.file) fail(`projects[${pIdx}] is missing "file"`);
            if (proj.afterModule === undefined) {
                fail(`projects[${pIdx}] is missing "afterModule"`);
            } else if (!moduleIds.has(proj.afterModule)) {
                fail(`projects[${pIdx}] afterModule references non-existent module ID ${proj.afterModule}`);
            }
        });
    }

    // -----------------------------------------------------------------------
    // Exercise variant files
    // -----------------------------------------------------------------------
    const exercisesDir = path.join(courseDir, 'content', 'exercises');

    modules.forEach(mod => {
        if (mod.hasExercises === false) return;

        const variantsFile = path.join(exercisesDir, `module${mod.id}-variants.yaml`);
        if (!fs.existsSync(variantsFile)) {
            warn(`Module ${mod.id} ("${mod.title}") has exercises enabled but no variants file: module${mod.id}-variants.yaml`);
            return;
        }

        let parsed;
        try {
            parsed = yaml.load(fs.readFileSync(variantsFile, 'utf8')) || {};
        } catch (e) {
            fail(`Invalid YAML in module${mod.id}-variants.yaml: ${e.message}`);
            return;
        }

        const variants = parsed.variants;
        if (!variants || typeof variants !== 'object') {
            fail(`module${mod.id}-variants.yaml: missing "variants" object`);
            return;
        }

        const conceptLinks = parsed.conceptLinks || null;
        const seenIds = {};

        // Validate each exercise type (warmups, challenges, advanced, core, stretch, etc.)
        Object.keys(variants).forEach(type => {
            const exercises = variants[type];
            if (!Array.isArray(exercises)) return;

            exercises.forEach((exercise, eIdx) => {
                const label = `module${mod.id} ${type}[${eIdx}]`;

                if (!exercise.id) {
                    fail(`${label}: missing "id"`);
                } else {
                    const fullId = `${type}:${exercise.id}`;
                    if (seenIds[fullId]) {
                        fail(`${label}: duplicate exercise ID "${exercise.id}" within ${type}`);
                    }
                    seenIds[fullId] = true;
                }

                if (!exercise.concept) {
                    warn(`${label}: missing "concept"`);
                } else if (conceptLinks && !conceptLinks[exercise.concept]) {
                    warn(`${label}: concept "${exercise.concept}" not found in conceptLinks`);
                }

                // Scaffolds can use template + params instead of variants[]
                if (type === 'scaffolds' && exercise.template && Array.isArray(exercise.params)) {
                    const tmpl = exercise.template;
                    if (!tmpl.title) fail(`${label}: template missing "title"`);
                    if (!tmpl.description) fail(`${label}: template missing "description"`);
                    if (!tmpl.solution) fail(`${label}: template missing "solution"`);
                    if (exercise.params.length === 0) fail(`${label}: "params" array is empty`);
                } else if (!Array.isArray(exercise.variants) || exercise.variants.length === 0) {
                    fail(`${label}: missing or empty "variants" array`);
                } else {
                    const seenVariantIds = {};
                    exercise.variants.forEach((v, vIdx) => {
                        const vLabel = `${label} variant[${vIdx}]`;
                        if (!v.id) fail(`${vLabel}: missing "id"`);
                        else if (seenVariantIds[v.id]) {
                            fail(`${vLabel}: duplicate variant ID "${v.id}"`);
                        } else {
                            seenVariantIds[v.id] = true;
                        }
                        if (!v.title) fail(`${vLabel}: missing "title"`);
                        if (!v.description) fail(`${vLabel}: missing "description"`);
                        if (!v.solution) fail(`${vLabel}: missing "solution"`);
                    });
                }
            });
        });
    });

    // -----------------------------------------------------------------------
    // Flashcards
    // -----------------------------------------------------------------------
    const flashcardsFile = path.join(courseDir, 'content', 'flashcards', 'flashcards.yaml');
    if (fs.existsSync(flashcardsFile)) {
        let flashcards;
        try {
            flashcards = yaml.load(fs.readFileSync(flashcardsFile, 'utf8')) || {};
        } catch (e) {
            fail(`Invalid YAML in flashcards.yaml: ${e.message}`);
            flashcards = null;
        }

        if (flashcards && typeof flashcards === 'object') {
            Object.keys(flashcards).forEach(key => {
                const modId = parseInt(key, 10);
                if (!isNaN(modId) && !moduleIds.has(modId)) {
                    warn(`flashcards.yaml: key "${key}" does not match any module ID`);
                }

                const cards = flashcards[key];
                if (!Array.isArray(cards)) {
                    fail(`flashcards.yaml: key "${key}" should be an array`);
                    return;
                }

                cards.forEach((card, cIdx) => {
                    if (!card.q) fail(`flashcards.yaml[${key}][${cIdx}]: missing "q" (question)`);
                    if (!card.a) fail(`flashcards.yaml[${key}][${cIdx}]: missing "a" (answer)`);
                });
            });
        }
    }

    return { warnings, errors };
}

module.exports = { validateCourse };
