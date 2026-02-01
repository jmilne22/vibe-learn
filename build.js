#!/usr/bin/env node
/**
 * Course Engine Build Script (Multi-Course)
 *
 * Reads course manifests from courses/<slug>/course.json + content files
 * (markdown lessons, YAML exercises, YAML flashcards) + shared engine
 * templates, and produces complete static sites in dist/<slug>/.
 *
 * Feature pages (flashcards, daily-practice, analytics, real-world-challenges,
 * etc.) are self-contained plugins in engine/plugins/<name>/.
 *
 * Dependencies: marked (markdown → HTML), js-yaml (YAML parsing)
 *
 * Usage:
 *   node build.js          # Build all courses + landing page
 *   node build.js go       # Build just the Go course
 *   node build.js rust     # Build just the Rust course
 */

const fs = require('fs');
const path = require('path');
const { marked } = require('marked');
const { markedHighlight } = require('marked-highlight');
const hljs = require('highlight.js');
const yaml = require('js-yaml');

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const ROOT = __dirname;
const COURSES_DIR = path.join(ROOT, 'courses');
const ENGINE_DIR = path.join(ROOT, 'engine');
const ROOT_DIST = path.join(ROOT, 'dist');

const TEMPLATES_DIR = path.join(ENGINE_DIR, 'templates');
const JS_DIR = path.join(ENGINE_DIR, 'js');
const CSS_DIR = path.join(ENGINE_DIR, 'css');
const THEMES_DIR = path.join(ENGINE_DIR, 'themes');
const PLUGINS_DIR = path.join(ENGINE_DIR, 'plugins');

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
function mkdirp(dir) {
    fs.mkdirSync(dir, { recursive: true });
}

function loadTemplate(name) {
    return fs.readFileSync(path.join(TEMPLATES_DIR, name), 'utf8');
}


function collectDistFiles(dir, base) {
    let files = [];
    fs.readdirSync(dir).forEach(entry => {
        const fullPath = path.join(dir, entry);
        const relPath = base ? base + '/' + entry : entry;
        if (fs.statSync(fullPath).isDirectory()) {
            files = files.concat(collectDistFiles(fullPath, relPath));
        } else if (entry !== 'sw.js') {
            files.push(relPath);
        }
    });
    return files;
}

// ---------------------------------------------------------------------------
// Discover available courses
// ---------------------------------------------------------------------------
function discoverCourses() {
    if (!fs.existsSync(COURSES_DIR)) return [];
    return fs.readdirSync(COURSES_DIR).filter(slug => {
        const manifest = path.join(COURSES_DIR, slug, 'course.json');
        return fs.statSync(path.join(COURSES_DIR, slug)).isDirectory() && fs.existsSync(manifest);
    });
}

// ---------------------------------------------------------------------------
// Plugin Discovery
// ---------------------------------------------------------------------------
function discoverPlugins() {
    if (!fs.existsSync(PLUGINS_DIR)) return [];
    return fs.readdirSync(PLUGINS_DIR)
        .filter(d => {
            const manifestPath = path.join(PLUGINS_DIR, d, 'manifest.json');
            return fs.existsSync(manifestPath);
        })
        .map(d => {
            const manifest = JSON.parse(fs.readFileSync(
                path.join(PLUGINS_DIR, d, 'manifest.json'), 'utf8'));
            manifest._dir = path.join(PLUGINS_DIR, d);
            return manifest;
        })
        .sort((a, b) => (a.sidebarOrder || 99) - (b.sidebarOrder || 99));
}

function getActivePlugins(plugins, contentDir) {
    return plugins.filter(p => {
        if (!p.contentPattern) return true;
        const contentPath = path.join(contentDir, p.contentPattern);
        // Support both file and directory patterns
        return fs.existsSync(contentPath);
    });
}

// ---------------------------------------------------------------------------
// Configure marked with syntax highlighting
// ---------------------------------------------------------------------------
marked.use(markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code, lang) {
        if (lang && hljs.getLanguage(lang)) {
            return hljs.highlight(code, { language: lang }).value;
        }
        return code;
    }
}));

marked.setOptions({
    gfm: true,
    breaks: false
});

// ---------------------------------------------------------------------------
// Theme links HTML (shared across all courses)
// ---------------------------------------------------------------------------
const themeFiles = fs.readdirSync(
    fs.existsSync(THEMES_DIR) ? THEMES_DIR : path.join(ROOT, 'themes')
).filter(f => f.endsWith('.css')).sort();

// Static <link> for the default theme (render-blocking so no flash).
// Inline script adjusts href if the user saved a different theme, sets
// data-theme + has-sidebar on <html>, and loads theme fonts async.
// Font URLs are mapped here so the @import is not inside render-blocking CSS.
const themeInitLink = `    <link id="theme-css" rel="stylesheet" href="themes/factorio-dark.css">`;
const themeInitScript = `    <script>(function(){var d=document.documentElement,l=document.getElementById('theme-css');var fonts={'factorio-dark':'https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Titillium+Web:wght@400;600;700&display=swap','persona5-dark':'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;900&family=Bebas+Neue&family=Archivo+Black&display=swap'};try{var t=localStorage.getItem('vibe-learn-theme')||'factorio-dark';if(t==='dark'){d.removeAttribute('data-theme');l.removeAttribute('href')}else{d.setAttribute('data-theme',t);if(t!=='factorio-dark')l.href='themes/'+t+'.css'}if(fonts[t]){var f=document.createElement('link');f.rel='stylesheet';f.href=fonts[t];document.head.appendChild(f)}}catch(e){}var p=location.pathname.split('/').pop()||'index.html';if(p!=='index.html')d.classList.add('has-sidebar')})()</script>`;

const themeLinksHtml = themeInitLink + '\n' + themeInitScript;

// ---------------------------------------------------------------------------
// Post-process: transform labeled code blocks into styled comparisons
// ---------------------------------------------------------------------------
/**
 * Detects markdown patterns like:
 *   *Python*
 *   ```python
 *   code...
 *   ```
 * and wraps them with language headers. Consecutive labeled blocks
 * get wrapped in a side-by-side code-compare div.
 */
function processCodeBlocks(html) {
    const pattern = /<p><em>([^<]+)<\/em><\/p>\s*(<pre><code[^>]*>[\s\S]*?<\/code><\/pre>)/g;

    const matches = [];
    let m;
    while ((m = pattern.exec(html)) !== null) {
        matches.push({
            start: m.index,
            end: m.index + m[0].length,
            label: m[1],
            code: m[2]
        });
    }

    if (matches.length === 0) return html;

    // Group consecutive matches (only whitespace between them)
    const groups = [];
    let currentGroup = [matches[0]];

    for (let i = 1; i < matches.length; i++) {
        const prev = matches[i - 1];
        const curr = matches[i];
        const between = html.substring(prev.end, curr.start).trim();

        if (between === '') {
            currentGroup.push(curr);
        } else {
            groups.push(currentGroup);
            currentGroup = [curr];
        }
    }
    groups.push(currentGroup);

    // Rebuild HTML with transformed code blocks
    let result = '';
    let lastEnd = 0;

    for (const group of groups) {
        const groupStart = group[0].start;
        const groupEnd = group[group.length - 1].end;

        result += html.substring(lastEnd, groupStart);

        if (group.length >= 2) {
            // Multiple consecutive labeled blocks → side-by-side comparison
            result += '<div class="code-compare">';
            group.forEach(block => {
                result += `<div class="code-labeled"><div class="code-header">${block.label}</div>${block.code}</div>`;
            });
            result += '</div>';
        } else {
            // Single labeled block → just add a header
            const block = group[0];
            result += `<div class="code-labeled"><div class="code-header">${block.label}</div>${block.code}</div>`;
        }

        lastEnd = groupEnd;
    }

    result += html.substring(lastEnd);
    return result;
}

// ---------------------------------------------------------------------------
// Shared templates (loaded once)
// ---------------------------------------------------------------------------
const moduleTemplate = loadTemplate('module.html');
const projectTemplate = loadTemplate('project.html');
const indexTemplate = loadTemplate('index.html');

// Discover all plugins once at startup
const allPlugins = discoverPlugins();
console.log(`Discovered plugins: ${allPlugins.map(p => p.name).join(', ') || '(none)'}`);

// ---------------------------------------------------------------------------
// buildCourse(slug) — builds a single course into dist/<slug>/
// ---------------------------------------------------------------------------
function buildCourse(slug) {
    console.log(`\n========== Building course: ${slug} ==========`);

    const COURSE_DIR = path.join(COURSES_DIR, slug);
    const CONTENT_DIR = path.join(COURSE_DIR, 'content');
    const COURSE_DIST = path.join(ROOT_DIST, slug);

    const LESSONS_DIR = path.join(CONTENT_DIR, 'lessons');
    const EXERCISES_DIR = path.join(CONTENT_DIR, 'exercises');
    const ASSETS_DIR = path.join(CONTENT_DIR, 'assets');

    // 1. Load & validate course.json
    console.log('Loading course.json...');
    const courseJson = JSON.parse(fs.readFileSync(path.join(COURSE_DIR, 'course.json'), 'utf8'));
    const { course, tracks, modules, projects, annotationTypes } = courseJson;

    if (!course || !course.name || !course.slug) {
        console.error('Error: course.json must have course.name and course.slug');
        process.exit(1);
    }

    // 2. Prepare dist/<slug> directory
    if (fs.existsSync(COURSE_DIST)) {
        fs.rmSync(COURSE_DIST, { recursive: true, force: true });
    }
    mkdirp(COURSE_DIST);
    mkdirp(path.join(COURSE_DIST, 'data'));
    mkdirp(path.join(COURSE_DIST, 'themes'));

    // 3. Determine active plugins for this course
    const activePlugins = getActivePlugins(allPlugins, CONTENT_DIR);
    console.log(`Active plugins for ${slug}: ${activePlugins.map(p => p.name).join(', ') || '(none)'}`);

    // 4. Compute derived data
    const moduleNames = {};
    modules.forEach(m => { moduleNames[m.id] = m.title; });

    const modulesWithExercises = modules.filter(m => m.hasExercises).map(m => m.id);
    const modulesWithoutExercises = modules.filter(m => !m.hasExercises).map(m => m.id);

    const sidebarPages = [];
    const projectsByAfterModule = {};
    projects.forEach(p => {
        if (!projectsByAfterModule[p.afterModule]) projectsByAfterModule[p.afterModule] = [];
        projectsByAfterModule[p.afterModule].push(p);
    });

    modules.forEach(m => {
        sidebarPages.push({
            file: m.file + '.html',
            label: `Module ${m.num}: ${m.title}`,
            num: m.num,
            title: m.title,
            type: 'module',
            id: m.id
        });
        if (projectsByAfterModule[m.id]) {
            projectsByAfterModule[m.id].forEach(p => {
                sidebarPages.push({
                    file: p.file + '.html',
                    label: `Project ${p.num}: ${p.title}`,
                    num: p.num,
                    title: p.title,
                    type: 'project',
                    isProject: true,
                    id: p.id
                });
            });
        }
    });

    // Add active plugin pages to sidebar
    activePlugins.forEach(p => {
        sidebarPages.push({
            file: p.name + '.html',
            label: p.label,
            num: p.shortLabel,
            title: p.label,
            type: 'feature',
            sidebarColor: p.sidebarColor
        });
    });

    // Build plugin info for runtime (CourseConfig.plugins)
    const pluginsConfig = activePlugins.map(p => ({
        name: p.name,
        label: p.label,
        shortLabel: p.shortLabel,
        sidebarColor: p.sidebarColor,
        sidebarOrder: p.sidebarOrder,
        backupKey: p.backupKey,
        file: p.name + '.html'
    }));

    // 5. Generate course-data.js
    console.log('Generating course-data.js...');
    const courseConfigData = {
        course: course,
        tracks: tracks,
        modules: modules,
        projects: projects,
        annotationTypes: annotationTypes,
        moduleNames: moduleNames,
        modulesWithExercises: modulesWithExercises,
        modulesWithoutExercises: modulesWithoutExercises,
        sidebarPages: sidebarPages,
        plugins: pluginsConfig
    };

    fs.writeFileSync(
        path.join(COURSE_DIST, 'course-data.js'),
        `// Auto-generated by build.js — do not edit\nwindow.CourseConfig = ${JSON.stringify(courseConfigData, null, 2)};\n`
    );

    // 6. Navigation helpers (scoped to this course's data)
    function buildNavLinks(currentFile) {
        return `            <a href="index.html" class="nav-btn prev-btn">&larr; Dashboard</a>`;
    }

    function buildNavButtons(currentFile) {
        const idx = sidebarPages.findIndex(p => p.file === currentFile);
        let html = '        <div class="nav-buttons">\n';

        if (idx > 0) {
            const prev = sidebarPages[idx - 1];
            html += `            <a href="${prev.file}" class="nav-btn prev-btn">&larr; ${prev.label}</a>\n`;
        } else {
            html += `            <a href="index.html" class="nav-btn prev-btn">&larr; Dashboard</a>\n`;
        }

        if (idx >= 0 && idx < sidebarPages.length - 1) {
            const next = sidebarPages[idx + 1];
            html += `            <a href="${next.file}" class="nav-btn next-btn">${next.label} &rarr;</a>\n`;
        }

        html += '        </div>';
        return html;
    }

    function buildExerciseScripts(moduleId) {
        const mod = modules.find(m => m.id === moduleId);
        if (!mod || !mod.hasExercises) return '';
        return `    <script src="exercise-core.js"></script>\n    <script src="course.js"></script>\n    <script src="exercise-renderer.js"></script>\n    <script src="module-loader.js"></script>`;
    }

    // 7. Generate module HTML pages
    console.log('Generating module pages...');
    modules.forEach(mod => {
        const mdFile = path.join(LESSONS_DIR, mod.file + '.md');
        if (!fs.existsSync(mdFile)) {
            console.warn(`  Warning: ${mod.file}.md not found, skipping`);
            return;
        }

        const mdContent = fs.readFileSync(mdFile, 'utf8');
        let htmlContent = processCodeBlocks(marked.parse(mdContent));

        // Inject jump-to-section box after the Exercises heading for modules with exercises
        if (mod.hasExercises) {
            const jumpBox = `<div class="exercise-jump-box"><div class="exercise-jump-label">Jump to section:</div><div class="exercise-jump-links"><a href="#warmups">🔥 Warmups</a><a href="#challenges">💪 Challenges</a></div></div>`;
            htmlContent = htmlContent.replace(
                /(<h2[^>]*>Exercises<\/h2>)/i,
                '$1\n' + jumpBox
            );
            // Add anchor IDs for jump links
            // Warmups: add id to the container or heading
            htmlContent = htmlContent.replace(
                /(<div id="warmups-container")/,
                '<div id="warmups"></div>$1'
            );
            htmlContent = htmlContent.replace(
                /(<h3[^>]*>)(🔥\s*Warmups)/,
                '<h3 id="warmups">$2'
            );
            // Challenges: add id to heading
            htmlContent = htmlContent.replace(
                /(<h3[^>]*>)(💪\s*Challenges)/,
                '<h3 id="challenges">$2'
            );
        }

        const currentFile = mod.file + '.html';

        let page = moduleTemplate
            .replace(/\{\{COURSE_NAME\}\}/g, course.name)
            .replace(/\{\{TITLE\}\}/g, mod.title)
            .replace(/\{\{MODULE_NUM\}\}/g, mod.num)
            .replace(/\{\{MODULE_ID\}\}/g, String(mod.id))
            .replace(/\{\{MODULE_DESC\}\}/g, mod.description)
            .replace('{{LESSON_CONTENT}}', htmlContent)
            .replace('{{THEME_LINKS}}', themeLinksHtml)
            .replace('{{NAV_LINKS}}', buildNavLinks(currentFile))
            .replace('{{NAV_BUTTONS}}', buildNavButtons(currentFile))
            .replace('{{SCRIPTS}}', buildExerciseScripts(mod.id));

        fs.writeFileSync(path.join(COURSE_DIST, currentFile), page);
        console.log(`  ${currentFile}`);
    });

    // 8. Generate project HTML pages
    console.log('Generating project pages...');
    projects.forEach(proj => {
        const mdFile = path.join(LESSONS_DIR, proj.file + '.md');
        if (!fs.existsSync(mdFile)) {
            console.warn(`  Warning: ${proj.file}.md not found, skipping`);
            return;
        }

        const mdContent = fs.readFileSync(mdFile, 'utf8');
        const htmlContent = processCodeBlocks(marked.parse(mdContent));
        const currentFile = proj.file + '.html';

        let page = projectTemplate
            .replace(/\{\{COURSE_NAME\}\}/g, course.name)
            .replace(/\{\{TITLE\}\}/g, proj.title)
            .replace(/\{\{MODULE_DESC\}\}/g, proj.description)
            .replace('{{LESSON_CONTENT}}', htmlContent)
            .replace('{{THEME_LINKS}}', themeLinksHtml)
            .replace('{{NAV_LINKS}}', buildNavLinks(currentFile))
            .replace('{{NAV_BUTTONS}}', buildNavButtons(currentFile));

        fs.writeFileSync(path.join(COURSE_DIST, currentFile), page);
        console.log(`  ${currentFile}`);
    });

    // 9. Generate index.html (dashboard)
    console.log('Generating index.html...');

    function buildModuleListHtml() {
        let html = '';

        tracks.forEach(track => {
            html += `            <!-- Track ${track.id} -->\n`;
            html += `            <div class="track-section">\n`;
            html += `                <div class="track-title">Track ${track.id} • ${track.title}</div>\n`;

            track.modules.forEach(modId => {
                const mod = modules.find(m => m.id === modId);
                if (!mod) return;
                html += `                <div class="module-item" data-module="${mod.id}">\n`;
                html += `                    <input type="checkbox" class="module-checkbox" id="m${mod.id}">\n`;
                html += `                    <a href="${mod.file}.html" class="module-link">\n`;
                html += `                        <span class="module-num">MODULE ${mod.num}</span>\n`;
                html += `                        <span class="module-name">${mod.title}</span>\n`;
                html += `                    </a>\n`;
                html += `                    <span class="exercise-progress-inline" id="ex-progress-${mod.id}"></span>\n`;
                html += `                    <span class="last-studied" id="last-${mod.id}"></span>\n`;
                html += `                </div>\n`;
            });

            html += `            </div>\n\n`;
        });

        html += `            <!-- Projects -->\n`;
        html += `            <div class="track-section">\n`;
        html += `                <div class="track-title">Projects • Capstone</div>\n`;

        projects.forEach(proj => {
            html += `                <div class="module-item" data-module="${proj.id}">\n`;
            html += `                    <input type="checkbox" class="module-checkbox" id="m${proj.id}">\n`;
            html += `                    <a href="${proj.file}.html" class="module-link">\n`;
            html += `                        <span class="module-num">PROJECT ${proj.num}</span>\n`;
            html += `                        <span class="module-name">${proj.title}</span>\n`;
            html += `                    </a>\n`;
            html += `                    <span class="last-studied" id="last-${proj.id}"></span>\n`;
            html += `                </div>\n`;
        });

        html += `            </div>\n`;
        return html;
    }

    function buildModuleFilterButtons() {
        let html = '                    <button class="dp-option active" data-module="all">All</button>\n';
        modules.forEach(mod => {
            if (mod.id === 0) return;
            html += `                    <button class="dp-option" data-module="${mod.id}">M${mod.id}</button>\n`;
        });
        return html;
    }

    // Build plugin nav pills for the dashboard
    function buildPluginNavPills() {
        let html = '';
        activePlugins.forEach(p => {
            html += `                <a href="${p.name}.html" class="nav-pill">${p.label}</a>\n`;
        });
        return html;
    }

    const moduleCount = modules.filter(m => m.id > 0).length;

    let indexPage = indexTemplate
        .replace(/\{\{COURSE_NAME\}\}/g, course.name)
        .replace(/\{\{COURSE_DESCRIPTION\}\}/g, course.description)
        .replace(/\{\{MODULE_COUNT\}\}/g, String(moduleCount))
        .replace('{{THEME_LINKS}}', themeLinksHtml)
        .replace('{{MODULE_LIST}}', buildModuleListHtml())
        .replace('{{PLUGIN_NAV_PILLS}}', buildPluginNavPills());

    fs.writeFileSync(path.join(COURSE_DIST, 'index.html'), indexPage);
    console.log('  index.html');

    // 10. Build plugins (generic loop)
    console.log('Building plugins...');
    activePlugins.forEach(plugin => {
        console.log(`  Plugin: ${plugin.name}`);

        // 10a. Load and generate data file if configured
        if (plugin.dataFile && plugin.contentPattern) {
            const contentPath = path.join(CONTENT_DIR, plugin.contentPattern);
            if (fs.existsSync(contentPath) && fs.statSync(contentPath).isFile()) {
                const raw = fs.readFileSync(contentPath, 'utf8');
                let parsed;
                try {
                    parsed = yaml.load(raw) || {};
                } catch (e) {
                    console.error(`  Invalid YAML in ${plugin.contentPattern}:`, e.message);
                    process.exit(1);
                }

                // Run custom build transform if plugin has build.js
                const customBuildPath = path.join(plugin._dir, 'build.js');
                if (fs.existsSync(customBuildPath)) {
                    const customBuild = require(customBuildPath);
                    if (typeof customBuild.transform === 'function') {
                        parsed = customBuild.transform(parsed, { marked, yaml, course, modules });
                    }
                }

                // Check for empty data (e.g., empty challenges array)
                const dataKeys = Object.keys(parsed);
                const isEmpty = dataKeys.length === 0 ||
                    (dataKeys.length === 1 && Array.isArray(parsed[dataKeys[0]]) && parsed[dataKeys[0]].length === 0);

                fs.writeFileSync(
                    path.join(COURSE_DIST, plugin.dataFile),
                    `// Auto-generated from ${plugin.contentPattern} - do not edit directly\nwindow.${plugin.dataGlobal} = ${JSON.stringify(parsed)};\n`
                );
                console.log(`    ${plugin.dataFile}${isEmpty ? ' (empty)' : ''}`);
            }
        }

        // 10b. Process and output HTML template
        const templatePath = path.join(plugin._dir, plugin.template);
        if (fs.existsSync(templatePath)) {
            let templateContent = fs.readFileSync(templatePath, 'utf8');
            templateContent = templateContent
                .replace(/\{\{COURSE_NAME\}\}/g, course.name)
                .replace(/\{\{THEME_LINKS\}\}/g, themeLinksHtml)
                .replace(/\{\{MODULE_FILTER_BUTTONS\}\}/g, buildModuleFilterButtons());

            fs.writeFileSync(path.join(COURSE_DIST, plugin.name + '.html'), templateContent);
            console.log(`    ${plugin.name}.html`);
        }

        // 10c. Copy plugin JS files to dist
        plugin.scripts.forEach(script => {
            const scriptSrc = path.join(plugin._dir, script);
            if (fs.existsSync(scriptSrc)) {
                fs.copyFileSync(scriptSrc, path.join(COURSE_DIST, script));
                console.log(`    ${script}`);
            }
        });

        // 10d. Copy dashboard scripts if any
        if (plugin.dashboardScripts) {
            plugin.dashboardScripts.forEach(script => {
                const scriptSrc = path.join(plugin._dir, script);
                if (fs.existsSync(scriptSrc)) {
                    fs.copyFileSync(scriptSrc, path.join(COURSE_DIST, script));
                    console.log(`    ${script} (dashboard)`);
                }
            });
        }
    });

    // 11. Compile exercise YAML → JS
    console.log('Compiling exercise data...');
    const exerciseFiles = fs.existsSync(EXERCISES_DIR)
        ? fs.readdirSync(EXERCISES_DIR).filter(f => f.match(/^module\d+-variants\.yaml$/))
        : [];

    const conceptIndex = {}; // m{N}_{exerciseId} -> concept name

    exerciseFiles.forEach(yamlFile => {
        const yamlPath = path.join(EXERCISES_DIR, yamlFile);
        const raw = fs.readFileSync(yamlPath, 'utf8');
        const moduleNum = yamlFile.match(/module(\d+)/)[1];
        const jsFile = `module${moduleNum}-variants.js`;

        let parsed;
        try {
            parsed = yaml.load(raw) || {};
        } catch (e) {
            console.error(`  Invalid YAML in ${yamlFile}:`, e.message);
            process.exit(1);
        }

        // Accumulate concept index from all exercise types
        const variants = parsed.variants || {};
        ['warmups', 'challenges', 'advanced'].forEach(type => {
            if (!Array.isArray(variants[type])) return;
            variants[type].forEach(exercise => {
                if (exercise.id && exercise.concept) {
                    conceptIndex[`m${moduleNum}_${exercise.id}`] = exercise.concept;
                }
            });
        });

        const jsonStr = JSON.stringify(parsed);
        const js = `// Auto-generated from ${yamlFile} - do not edit directly\nwindow.moduleData = ${jsonStr};\nwindow.moduleDataRegistry = window.moduleDataRegistry || {};\nwindow.moduleDataRegistry[${moduleNum}] = window.moduleData;\n`;

        fs.writeFileSync(path.join(COURSE_DIST, 'data', jsFile), js);
        console.log(`  data/${jsFile}`);
    });

    // Write concept-index.js
    const conceptCount = Object.keys(conceptIndex).length;
    fs.writeFileSync(
        path.join(COURSE_DIST, 'concept-index.js'),
        `// Auto-generated by build.js — do not edit\nwindow.ConceptIndex = ${JSON.stringify(conceptIndex)};\n`
    );
    console.log(`  concept-index.js (${conceptCount} entries)`);

    // 12. Copy engine JS files
    console.log('Copying engine JS files...');
    if (fs.existsSync(JS_DIR)) {
        fs.readdirSync(JS_DIR).filter(f => f.endsWith('.js')).forEach(file => {
            fs.copyFileSync(path.join(JS_DIR, file), path.join(COURSE_DIST, file));
            console.log(`  ${file}`);
        });
    }

    // 13. Copy engine CSS files
    console.log('Copying CSS files...');
    const cssSource = fs.existsSync(CSS_DIR) ? CSS_DIR : ROOT;
    const styleCss = path.join(cssSource, 'style.css');
    if (fs.existsSync(styleCss)) {
        fs.copyFileSync(styleCss, path.join(COURSE_DIST, 'style.css'));
        console.log('  style.css');
    } else if (fs.existsSync(path.join(ROOT, 'style.css'))) {
        fs.copyFileSync(path.join(ROOT, 'style.css'), path.join(COURSE_DIST, 'style.css'));
        console.log('  style.css (from root)');
    }

    // 14. Copy theme CSS files
    console.log('Copying theme files...');
    const themesSource = fs.existsSync(THEMES_DIR) ? THEMES_DIR : path.join(ROOT, 'themes');
    if (fs.existsSync(themesSource)) {
        fs.readdirSync(themesSource).filter(f => f.endsWith('.css')).forEach(file => {
            fs.copyFileSync(path.join(themesSource, file), path.join(COURSE_DIST, 'themes', file));
            console.log(`  themes/${file}`);
        });
    }

    // 15. Copy assets (favicon, etc.)
    console.log('Copying assets...');
    if (fs.existsSync(ASSETS_DIR)) {
        fs.readdirSync(ASSETS_DIR).forEach(file => {
            fs.copyFileSync(path.join(ASSETS_DIR, file), path.join(COURSE_DIST, file));
            console.log(`  ${file}`);
        });
    }

    // 16. Generate sw.js (service worker)
    console.log('Generating sw.js...');

    const distFiles = collectDistFiles(COURSE_DIST, '');
    const cacheVersion = Date.now();

    const swContent = `// Service Worker for ${course.name} — offline support
// Auto-generated by build.js
// Cache-first strategy: instant loads from cache, fresh on new deploy

var CACHE_NAME = '${course.slug}-v${cacheVersion}';

var ASSETS = ${JSON.stringify(distFiles, null, 4)};

// Install: cache all assets, activate immediately
self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            return cache.addAll(ASSETS);
        })
    );
    self.skipWaiting();
});

// Fetch: cache-first for same-origin, network for external (fonts etc.)
self.addEventListener('fetch', function(event) {
    if (event.request.url.startsWith(self.location.origin)) {
        event.respondWith(
            caches.match(event.request).then(function(cached) {
                return cached || fetch(event.request);
            })
        );
    }
});

// Activate: clean old caches, take control of all pages immediately
self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(names) {
            return Promise.all(
                names.filter(function(name) {
                    return name !== CACHE_NAME;
                }).map(function(name) {
                    return caches.delete(name);
                })
            );
        }).then(function() {
            return self.clients.claim();
        })
    );
});
`;

    fs.writeFileSync(path.join(COURSE_DIST, 'sw.js'), swContent);
    console.log('  sw.js');

    // Done
    const totalFiles = collectDistFiles(COURSE_DIST, '').length + 1; // +1 for sw.js
    console.log(`\nCourse "${course.name}" built! ${totalFiles} files in dist/${slug}/`);

    return { slug, name: course.name, description: course.description, status: course.status || null, hidden: !!course.hidden, moduleCount: modules.filter(m => m.id > 0).length };
}

// ---------------------------------------------------------------------------
// buildLandingPage(courseInfos) — generates dist/index.html course picker
// ---------------------------------------------------------------------------
function buildLandingPage(courseInfos) {
    console.log('\n========== Building landing page ==========');

    const landingTemplate = loadTemplate('landing.html');

    // Build course cards HTML (skip hidden courses)
    let cardsHtml = '';
    courseInfos.filter(info => !info.hidden).forEach(info => {
        cardsHtml += `            <a href="${info.slug}/index.html" class="course-card">\n`;
        cardsHtml += `                <div class="course-name">${info.name}</div>\n`;
        cardsHtml += `                <div class="course-desc">${info.description}</div>\n`;
        if (info.status) {
            cardsHtml += `                <div class="course-status">${info.status}</div>\n`;
        }
        cardsHtml += `                <div class="course-meta">${info.moduleCount} modules</div>\n`;
        cardsHtml += `            </a>\n`;
    });

    // Copy shared assets for landing page
    const cssSource = fs.existsSync(CSS_DIR) ? CSS_DIR : ROOT;
    const styleCss = path.join(cssSource, 'style.css');
    if (fs.existsSync(styleCss)) {
        fs.copyFileSync(styleCss, path.join(ROOT_DIST, 'style.css'));
    }

    // Copy theme.js for landing page
    const themeJs = path.join(JS_DIR, 'theme.js');
    if (fs.existsSync(themeJs)) {
        fs.copyFileSync(themeJs, path.join(ROOT_DIST, 'theme.js'));
    }

    mkdirp(path.join(ROOT_DIST, 'themes'));
    const themesSource = fs.existsSync(THEMES_DIR) ? THEMES_DIR : path.join(ROOT, 'themes');
    if (fs.existsSync(themesSource)) {
        fs.readdirSync(themesSource).filter(f => f.endsWith('.css')).forEach(file => {
            fs.copyFileSync(path.join(themesSource, file), path.join(ROOT_DIST, 'themes', file));
        });
    }

    // Copy landing page favicon (generic platform icon)
    const engineFavicon = path.join(ENGINE_DIR, 'assets', 'favicon.svg');
    if (fs.existsSync(engineFavicon)) {
        fs.copyFileSync(engineFavicon, path.join(ROOT_DIST, 'favicon.svg'));
    }

    let page = landingTemplate
        .replace('{{THEME_LINKS}}', themeLinksHtml)
        .replace('{{COURSE_CARDS}}', cardsHtml);

    fs.writeFileSync(path.join(ROOT_DIST, 'index.html'), page);
    console.log('  dist/index.html');
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const requestedSlug = args[0]; // undefined means "build all"

const availableCourses = discoverCourses();
console.log(`Discovered courses: ${availableCourses.join(', ') || '(none)'}`);

if (requestedSlug) {
    // Build a single course
    if (!availableCourses.includes(requestedSlug)) {
        console.error(`Error: course "${requestedSlug}" not found in courses/`);
        console.error(`Available: ${availableCourses.join(', ')}`);
        process.exit(1);
    }

    // Clean only this course's dist
    mkdirp(ROOT_DIST);
    buildCourse(requestedSlug);
} else {
    // Build all courses + landing page
    // Clean entire dist/
    if (fs.existsSync(ROOT_DIST)) {
        fs.rmSync(ROOT_DIST, { recursive: true, force: true });
    }
    mkdirp(ROOT_DIST);

    const courseInfos = availableCourses.map(slug => buildCourse(slug));
    buildLandingPage(courseInfos);

    console.log(`\n========== All done! ==========`);
    console.log(`Built ${courseInfos.length} course(s) + landing page in dist/`);
}
