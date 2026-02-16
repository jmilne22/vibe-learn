## Overview

This project walks you through creating your own course from scratch on the vibe-learn platform.

By the end, you'll have a working course with lessons, exercises, and flashcards that you can deploy anywhere.

## Step 1: Create the Directory

```bash
mkdir -p courses/my-course/content/{lessons,exercises,flashcards,assets}
```

Your course needs this structure:

```
courses/my-course/
├── course.json              # Course manifest
└── content/
    ├── lessons/             # Markdown files (one per module)
    ├── exercises/           # Exercise variant YAML files
    ├── flashcards/          # flashcards.yaml
    └── assets/              # favicon, images, etc.
```

## Step 2: Write course.json

This is the manifest that defines your course structure:

```json
{
  "course": {
    "name": "My Course",
    "slug": "my-course",
    "description": "What your course covers.",
    "storagePrefix": "my-course"
  },
  "tracks": [
    { "id": 1, "title": "Basics", "modules": [1, 2] }
  ],
  "modules": [
    {
      "id": 1, "num": "01", "title": "Getting Started",
      "description": "First steps.",
      "file": "module1", "hasExercises": false
    },
    {
      "id": 2, "num": "02", "title": "Next Steps",
      "description": "Going deeper.",
      "file": "module2", "hasExercises": true
    }
  ],
  "projects": [],
  "annotationTypes": {}
}
```

> **Tip:** The `storagePrefix` must be unique per course. It namespaces all localStorage keys so multiple courses don't collide.

## Step 3: Write Lessons

Create a markdown file for each module:

```bash
echo "## Hello World" > courses/my-course/content/lessons/module1.md
```

The file name must match the `file` field in course.json. The build script converts markdown to HTML and injects it into the page template.

## Step 4: Add Exercises

Create `content/exercises/moduleN-variants.yaml` for each module that has exercises. Set `hasExercises: true` in course.json for those modules.

Don't forget to add the exercise containers to your lesson markdown:

```markdown
## Exercises

<div id="warmups-container">
<noscript><p>JavaScript required.</p></noscript>
</div>

### Challenges

<div id="challenges-container">
<noscript><p>JavaScript required.</p></noscript>
</div>
```

## Step 5: Add Flashcards

Create `content/flashcards/flashcards.yaml`:

```yaml
"1":
  - topic: Basics
    q: What is X?
    a: X is Y.
```

Keys are module IDs as strings.

## Step 6: Build & Test

```bash
npm run build           # Build all courses
# or
node build.js my-course # Build just your course

cd dist && python3 -m http.server 8000
```

Open `http://localhost:8000/my-course/` to see your course.

## Step 7: Deploy

Push to GitHub and enable GitHub Pages with Actions, or serve the `dist/` directory from any static host (Netlify, Vercel, Cloudflare Pages, S3, etc.).

## Project Summary

- Create the directory structure under `courses/`
- Define your course in `course.json`
- Write lessons in markdown
- Add exercises as YAML variant files
- Add flashcards as a single YAML file
- Build with `npm run build` and deploy the `dist/` directory
