#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const slug = process.argv[2];

if (!slug) {
    console.error('Usage: npm run new-course -- <slug>');
    console.error('Example: npm run new-course -- python-ds');
    process.exit(1);
}

if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    console.error(`Invalid slug: "${slug}"`);
    console.error('Slug must be lowercase alphanumeric with hyphens (e.g., "python-ds", "rust", "web-security")');
    process.exit(1);
}

const courseDir = path.join(__dirname, 'courses', slug);

if (fs.existsSync(courseDir)) {
    console.error(`Directory already exists: courses/${slug}/`);
    process.exit(1);
}

// Create directory structure
const dirs = [
    path.join(courseDir, 'content', 'lessons'),
    path.join(courseDir, 'content', 'exercises'),
    path.join(courseDir, 'content', 'flashcards'),
    path.join(courseDir, 'content', 'assets'),
];

for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
}

// Write minimal course.yaml
const courseYaml = `course:
  name: "${slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} Course"
  slug: ${slug}
  description: "TODO: Add a course description."
  storagePrefix: ${slug}

tracks:
  - title: Getting Started
    modules: [0]

modules:
  - title: Introduction
    description: "Getting started and quick reference."
    hasExercises: false

projects: []
annotationTypes: {}
`;

fs.writeFileSync(path.join(courseDir, 'course.yaml'), courseYaml);

// Write minimal module0.md
const module0 = `## Welcome

Welcome to the course! This is the introduction module.

## What You'll Learn

- Topic 1
- Topic 2
- Topic 3

## Getting Started

Start by reading through each module in order. Modules with exercises will have interactive warmups and challenges at the bottom of the page.

> **Tip:** Use the sidebar to navigate between modules, and check the dashboard for your progress.
`;

fs.writeFileSync(path.join(courseDir, 'content', 'lessons', 'module0.md'), module0);

console.log(`\nCreated course scaffold: courses/${slug}/\n`);
console.log('  courses/' + slug + '/');
console.log('  ├── course.yaml');
console.log('  └── content/');
console.log('      ├── lessons/');
console.log('      │   └── module0.md');
console.log('      ├── exercises/');
console.log('      ├── flashcards/');
console.log('      └── assets/');
console.log('');
console.log('Next steps:');
console.log('  1. Paste STARTER_PROMPT.md into your AI tool (Claude Code, Cursor, Copilot)');
console.log('     and tell it what topic you want to teach');
console.log('  2. Or edit the files manually — see STARTER_PROMPT.md for the full schema');
console.log('  3. Run: npm run build');
