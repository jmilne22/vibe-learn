#!/usr/bin/env node
/**
 * Split single-file modules into section directories.
 * Usage: node split-modules.js <course-slug> [moduleIds...]
 * Example: node split-modules.js infra-go 1 2 3
 *          node split-modules.js infra-go        (all except module0)
 */
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const slug = process.argv[2];
if (!slug) { console.error('Usage: node split-modules.js <slug> [moduleIds...]'); process.exit(1); }

const requestedIds = process.argv.slice(3).map(Number);

const COURSE_DIR = path.join(__dirname, 'courses', slug);
const LESSONS_DIR = path.join(COURSE_DIR, 'content', 'lessons');
const EXERCISES_DIR = path.join(COURSE_DIR, 'content', 'exercises');

// Load course manifest to know which modules exist
const courseYaml = yaml.load(fs.readFileSync(path.join(COURSE_DIR, 'course.yaml'), 'utf8'));
const modules = courseYaml.modules;

function slugify(title) {
    return title
        .toLowerCase()
        .replace(/`([^`]+)`/g, '$1')   // strip backticks
        .replace(/['']/g, '')           // strip curly quotes
        .replace(/&/g, 'and')
        .replace(/[^a-z0-9]+/g, '-')   // non-alphanumeric → hyphen
        .replace(/^-+|-+$/g, '');       // trim leading/trailing hyphens
}

// Concept mapping: for each module, map section title keywords → exercise concepts
function loadExerciseConcepts(moduleId) {
    const yamlFile = path.join(EXERCISES_DIR, `module${moduleId}-variants.yaml`);
    if (!fs.existsSync(yamlFile)) return [];
    const raw = yaml.load(fs.readFileSync(yamlFile, 'utf8'));
    const concepts = new Set();
    const variants = raw.variants || {};
    ['warmups', 'challenges', 'advanced', 'scaffolds'].forEach(type => {
        if (!Array.isArray(variants[type])) return;
        variants[type].forEach(ex => {
            if (ex.concept) concepts.add(ex.concept);
        });
    });
    return [...concepts];
}

// Simple heuristic: match concepts to sections based on keyword overlap
function matchConcepts(sectionTitle, concepts) {
    const titleWords = new Set(sectionTitle.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/));
    const matches = [];
    for (const concept of concepts) {
        const conceptWords = concept.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/);
        const overlap = conceptWords.filter(w => titleWords.has(w) && w.length > 2).length;
        // Match if at least half the concept words appear in title, or if concept is substring of title
        if (overlap >= Math.ceil(conceptWords.length / 2) || sectionTitle.toLowerCase().includes(concept.toLowerCase())) {
            matches.push(concept);
        }
    }
    return matches;
}

modules.forEach((mod, idx) => {
    if (idx === 0) return; // Skip module 0 (reference/setup)
    if (requestedIds.length > 0 && !requestedIds.includes(idx)) return;

    const mdFile = path.join(LESSONS_DIR, `module${idx}.md`);
    const mdDir = path.join(LESSONS_DIR, `module${idx}`);

    if (!fs.existsSync(mdFile)) { console.log(`  Skip module${idx}: no .md file`); return; }
    if (fs.existsSync(mdDir)) { console.log(`  Skip module${idx}: already a directory`); return; }

    const content = fs.readFileSync(mdFile, 'utf8');
    const lines = content.split('\n');

    // Find H2 boundaries
    const h2s = [];
    lines.forEach((line, i) => {
        if (line.match(/^## /)) {
            h2s.push({ index: i, title: line.replace(/^## /, '').trim() });
        }
    });

    if (h2s.length === 0) { console.log(`  Skip module${idx}: no H2 headings`); return; }

    // Split into sections, excluding "Exercises" and "Module N Summary"
    const sections = [];
    let summaryContent = null;

    for (let i = 0; i < h2s.length; i++) {
        const title = h2s[i].title;
        const start = h2s[i].index;
        const end = i + 1 < h2s.length ? h2s[i + 1].index : lines.length;
        const sectionLines = lines.slice(start, end);

        if (title.match(/^exercises$/i)) {
            // Skip the exercises section entirely
            continue;
        }
        if (title.match(/^module\s+\d+\s+summary$/i)) {
            // Save summary to append to last content section
            // Convert H2 to H3 when appending
            sectionLines[0] = sectionLines[0].replace(/^## /, '### ');
            summaryContent = sectionLines.join('\n');
            continue;
        }
        sections.push({ title, lines: sectionLines });
    }

    if (sections.length === 0) { console.log(`  Skip module${idx}: no content sections`); return; }

    // Append summary to last section
    if (summaryContent) {
        sections[sections.length - 1].lines.push('', summaryContent);
    }

    // Load exercise concepts for this module
    const concepts = loadExerciseConcepts(idx);
    const usedConcepts = new Set();

    // Check which concepts are already referenced by inline-exercises in the content
    const fullContent = content;
    const existingConceptPattern = /data-concept="([^"]+)"/g;
    let m;
    while ((m = existingConceptPattern.exec(fullContent)) !== null) {
        usedConcepts.add(m[1]);
    }

    // Create directory
    fs.mkdirSync(mdDir, { recursive: true });

    console.log(`\n  module${idx} → ${sections.length} sections:`);

    sections.forEach((section, sIdx) => {
        const num = String(sIdx + 1).padStart(2, '0');
        const fileSlug = slugify(section.title);
        const fileName = `${num}-${fileSlug}.md`;

        let sectionContent = section.lines.join('\n').trimEnd() + '\n';

        // Check if section already has inline-exercises
        const hasInline = sectionContent.includes('inline-exercises');

        // Try to match exercise concepts to this section
        if (!hasInline && concepts.length > 0) {
            const matched = matchConcepts(section.title, concepts).filter(c => !usedConcepts.has(c));
            if (matched.length > 0) {
                sectionContent += '\n';
                matched.forEach(c => {
                    sectionContent += `<div class="inline-exercises" data-concept="${c}"></div>\n`;
                    usedConcepts.add(c);
                });
            }
        }

        fs.writeFileSync(path.join(mdDir, fileName), sectionContent);
        const matchedNote = '';
        console.log(`    ${fileName} — "${section.title}"${matchedNote}`);
    });

    // Remove original .md file
    fs.unlinkSync(mdFile);
    console.log(`    ✓ Removed module${idx}.md`);
});

console.log('\nDone!');
