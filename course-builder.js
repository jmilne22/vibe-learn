#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const PORT = parseInt(process.argv[2], 10) || 3456;
const ROOT = __dirname;
const COURSES_DIR = path.join(ROOT, 'courses');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function discoverCourses() {
  if (!fs.existsSync(COURSES_DIR)) return [];
  return fs.readdirSync(COURSES_DIR).filter(d => {
    const yamlPath = path.join(COURSES_DIR, d, 'course.yaml');
    return fs.statSync(path.join(COURSES_DIR, d)).isDirectory() && fs.existsSync(yamlPath);
  });
}

function readYaml(filePath) {
  const yaml = require('js-yaml');
  return yaml.load(fs.readFileSync(filePath, 'utf8'));
}

function writeYaml(filePath, data) {
  const yaml = require('js-yaml');
  const out = yaml.dump(data, { lineWidth: -1, noRefs: true, quotingType: '"' });
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, out, 'utf8');
}

function sendJSON(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function send404(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
}

function send500(res, err) {
  res.writeHead(500, { 'Content-Type': 'text/plain' });
  res.end(err.message || 'Internal server error');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function courseDir(slug) { return path.join(COURSES_DIR, slug); }

function ensureExerciseContainers(lessonContent, moduleId, courseManifest) {
  const mod = (courseManifest.modules || []).find((m, i) => (m.id !== undefined ? m.id : i) === moduleId);
  const hasExercises = mod ? (mod.hasExercises !== false) : true;
  if (!hasExercises) return lessonContent;

  let content = lessonContent;
  if (!content.includes('warmups-container')) {
    content += '\n\n<div id="warmups-container"></div>\n';
  }
  if (!content.includes('challenges-container')) {
    content += '<div id="challenges-container"></div>\n';
  }
  return content;
}

// ---------------------------------------------------------------------------
// Static file serving
// ---------------------------------------------------------------------------

const STATIC_ROUTES = {
  '/': { file: path.join(ROOT, 'engine', 'builder', 'index.html'), type: 'text/html' },
  '/lib/marked.umd.js': { file: path.join(ROOT, 'node_modules', 'marked', 'lib', 'marked.umd.js'), type: 'application/javascript' },
  '/lib/js-yaml.min.js': { file: path.join(ROOT, 'node_modules', 'js-yaml', 'dist', 'js-yaml.min.js'), type: 'application/javascript' },
};

function serveStatic(pathname, res) {
  const route = STATIC_ROUTES[pathname];
  if (!route) return false;
  try {
    const content = fs.readFileSync(route.file);
    res.writeHead(200, { 'Content-Type': route.type, 'Content-Length': content.length });
    res.end(content);
  } catch (e) {
    send404(res);
  }
  return true;
}

// ---------------------------------------------------------------------------
// API route handlers
// ---------------------------------------------------------------------------

async function handleAPI(method, segments, req, res) {
  // segments is the pathname split by '/' after removing 'api' prefix
  // e.g. /api/courses/go/lessons/1 => ['courses', 'go', 'lessons', '1']

  // GET /api/courses
  if (method === 'GET' && segments.length === 1 && segments[0] === 'courses') {
    const slugs = discoverCourses();
    const courses = slugs.map(slug => {
      try {
        const data = readYaml(path.join(COURSES_DIR, slug, 'course.yaml'));
        const c = data.course || data;
        return { slug, name: c.name || slug, description: c.description || '' };
      } catch {
        return { slug, name: slug, description: '' };
      }
    });
    return sendJSON(res, 200, courses);
  }

  // POST /api/courses  — create new course
  if (method === 'POST' && segments.length === 1 && segments[0] === 'courses') {
    const body = await readBody(req);
    const slug = body.slug;
    if (!slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
      return sendJSON(res, 400, { error: 'Invalid slug. Use lowercase alphanumeric with hyphens.' });
    }
    const dir = courseDir(slug);
    if (fs.existsSync(dir)) {
      return sendJSON(res, 409, { error: `Course "${slug}" already exists.` });
    }

    // Replicate create-course.js logic
    const dirs = [
      path.join(dir, 'content', 'lessons'),
      path.join(dir, 'content', 'exercises'),
      path.join(dir, 'content', 'flashcards'),
      path.join(dir, 'content', 'assets'),
    ];
    for (const d of dirs) fs.mkdirSync(d, { recursive: true });

    const name = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') + ' Course';
    const courseYaml = `course:\n  name: "${name}"\n  slug: ${slug}\n  description: "TODO: Add a course description."\n  storagePrefix: ${slug}\n\ntracks:\n  - title: Getting Started\n    modules: [0]\n\nmodules:\n  - title: Introduction\n    description: "Getting started and quick reference."\n    hasExercises: false\n\nprojects: []\nannotationTypes: {}\n`;
    fs.writeFileSync(path.join(dir, 'course.yaml'), courseYaml);

    const module0 = `## Welcome\n\nWelcome to the course! This is the introduction module.\n\n## What You'll Learn\n\n- Topic 1\n- Topic 2\n- Topic 3\n\n## Getting Started\n\nStart by reading through each module in order.\n`;
    fs.writeFileSync(path.join(dir, 'content', 'lessons', 'module0.md'), module0);

    return sendJSON(res, 201, { slug, name });
  }

  // GET /api/courses/:slug  — load all course data
  if (method === 'GET' && segments.length === 2 && segments[0] === 'courses') {
    const slug = segments[1];
    const dir = courseDir(slug);
    const yamlPath = path.join(dir, 'course.yaml');
    if (!fs.existsSync(yamlPath)) return send404(res);

    const manifest = readYaml(yamlPath);
    const modules = manifest.modules || [];

    // Load lessons
    const lessons = {};
    const lessonsDir = path.join(dir, 'content', 'lessons');
    if (fs.existsSync(lessonsDir)) {
      for (let i = 0; i < modules.length; i++) {
        const id = modules[i].id !== undefined ? modules[i].id : i;
        const file = path.join(lessonsDir, `module${id}.md`);
        if (fs.existsSync(file)) lessons[id] = fs.readFileSync(file, 'utf8');
      }
      // Also load project lessons
      if (manifest.projects) {
        for (const p of manifest.projects) {
          if (p.file) {
            const file = path.join(lessonsDir, `${p.file}.md`);
            if (fs.existsSync(file)) lessons[`project-${p.id}`] = fs.readFileSync(file, 'utf8');
          }
        }
      }
    }

    // Load exercises
    const exercises = {};
    const exDir = path.join(dir, 'content', 'exercises');
    if (fs.existsSync(exDir)) {
      for (let i = 0; i < modules.length; i++) {
        const id = modules[i].id !== undefined ? modules[i].id : i;
        const file = path.join(exDir, `module${id}-variants.yaml`);
        if (fs.existsSync(file)) exercises[id] = readYaml(file);
      }
    }

    // Load flashcards
    let flashcards = null;
    const fcPath = path.join(dir, 'content', 'flashcards', 'flashcards.yaml');
    if (fs.existsSync(fcPath)) flashcards = readYaml(fcPath);

    // Load algorithms
    let algorithms = null;
    const algoPath = path.join(dir, 'content', 'algorithms', 'algorithms.yaml');
    if (fs.existsSync(algoPath)) algorithms = readYaml(algoPath);

    // Load real-world challenges
    let challenges = null;
    const challPath = path.join(dir, 'content', 'real-world-challenges', 'real-world-challenges.yaml');
    if (fs.existsSync(challPath)) challenges = readYaml(challPath);

    return sendJSON(res, 200, { manifest, lessons, exercises, flashcards, algorithms, challenges });
  }

  // PUT /api/courses/:slug/course-yaml  — save course.yaml
  if (method === 'PUT' && segments.length === 3 && segments[0] === 'courses' && segments[2] === 'course-yaml') {
    const slug = segments[1];
    const dir = courseDir(slug);
    if (!fs.existsSync(dir)) return send404(res);
    const body = await readBody(req);
    if (body.raw) {
      // Raw YAML string
      fs.writeFileSync(path.join(dir, 'course.yaml'), body.raw, 'utf8');
    } else {
      writeYaml(path.join(dir, 'course.yaml'), body.data);
    }
    return sendJSON(res, 200, { ok: true });
  }

  // GET/PUT /api/courses/:slug/lessons/:moduleId
  if (segments.length === 4 && segments[0] === 'courses' && segments[2] === 'lessons') {
    const slug = segments[1];
    const moduleId = segments[3];
    const dir = courseDir(slug);
    const lessonsDir = path.join(dir, 'content', 'lessons');

    if (method === 'GET') {
      const file = path.join(lessonsDir, `module${moduleId}.md`);
      if (!fs.existsSync(file)) return sendJSON(res, 200, { content: '' });
      return sendJSON(res, 200, { content: fs.readFileSync(file, 'utf8') });
    }
    if (method === 'PUT') {
      fs.mkdirSync(lessonsDir, { recursive: true });
      const body = await readBody(req);
      let content = body.content || '';

      // Auto-inject exercise containers if needed
      try {
        const yamlPath = path.join(dir, 'course.yaml');
        if (fs.existsSync(yamlPath)) {
          const manifest = readYaml(yamlPath);
          content = ensureExerciseContainers(content, parseInt(moduleId, 10), manifest);
        }
      } catch { /* ignore */ }

      fs.writeFileSync(path.join(lessonsDir, `module${moduleId}.md`), content, 'utf8');
      return sendJSON(res, 200, { ok: true });
    }
  }

  // GET/PUT /api/courses/:slug/exercises/:moduleId
  if (segments.length === 4 && segments[0] === 'courses' && segments[2] === 'exercises') {
    const slug = segments[1];
    const moduleId = segments[3];
    const dir = courseDir(slug);
    const exDir = path.join(dir, 'content', 'exercises');
    const file = path.join(exDir, `module${moduleId}-variants.yaml`);

    if (method === 'GET') {
      if (!fs.existsSync(file)) return sendJSON(res, 200, { data: null });
      return sendJSON(res, 200, { data: readYaml(file) });
    }
    if (method === 'PUT') {
      fs.mkdirSync(exDir, { recursive: true });
      const body = await readBody(req);
      if (body.raw) {
        fs.writeFileSync(file, body.raw, 'utf8');
      } else {
        writeYaml(file, body.data);
      }
      return sendJSON(res, 200, { ok: true });
    }
  }

  // GET/PUT /api/courses/:slug/flashcards
  if (segments.length === 3 && segments[0] === 'courses' && segments[2] === 'flashcards') {
    const slug = segments[1];
    const dir = courseDir(slug);
    const fcDir = path.join(dir, 'content', 'flashcards');
    const file = path.join(fcDir, 'flashcards.yaml');

    if (method === 'GET') {
      if (!fs.existsSync(file)) return sendJSON(res, 200, { data: null });
      return sendJSON(res, 200, { data: readYaml(file) });
    }
    if (method === 'PUT') {
      fs.mkdirSync(fcDir, { recursive: true });
      const body = await readBody(req);
      if (body.raw) {
        fs.writeFileSync(file, body.raw, 'utf8');
      } else {
        // Ensure keys are strings (module IDs)
        const data = {};
        for (const [k, v] of Object.entries(body.data || {})) {
          data[String(k)] = v;
        }
        writeYaml(file, data);
      }
      return sendJSON(res, 200, { ok: true });
    }
  }

  // GET/PUT /api/courses/:slug/algorithms
  if (segments.length === 3 && segments[0] === 'courses' && segments[2] === 'algorithms') {
    const slug = segments[1];
    const dir = courseDir(slug);
    const algoDir = path.join(dir, 'content', 'algorithms');
    const file = path.join(algoDir, 'algorithms.yaml');

    if (method === 'GET') {
      if (!fs.existsSync(file)) return sendJSON(res, 200, { data: null });
      return sendJSON(res, 200, { data: readYaml(file) });
    }
    if (method === 'PUT') {
      fs.mkdirSync(algoDir, { recursive: true });
      const body = await readBody(req);
      if (body.raw) {
        fs.writeFileSync(file, body.raw, 'utf8');
      } else {
        writeYaml(file, body.data);
      }
      return sendJSON(res, 200, { ok: true });
    }
  }

  // GET/PUT /api/courses/:slug/challenges
  if (segments.length === 3 && segments[0] === 'courses' && segments[2] === 'challenges') {
    const slug = segments[1];
    const dir = courseDir(slug);
    const challDir = path.join(dir, 'content', 'real-world-challenges');
    const file = path.join(challDir, 'real-world-challenges.yaml');

    if (method === 'GET') {
      if (!fs.existsSync(file)) return sendJSON(res, 200, { data: null });
      return sendJSON(res, 200, { data: readYaml(file) });
    }
    if (method === 'PUT') {
      fs.mkdirSync(challDir, { recursive: true });
      const body = await readBody(req);
      if (body.raw) {
        fs.writeFileSync(file, body.raw, 'utf8');
      } else {
        writeYaml(file, body.data);
      }
      return sendJSON(res, 200, { ok: true });
    }
  }

  // POST /api/build/:slug  — build single course
  if (method === 'POST' && segments.length === 2 && segments[0] === 'build') {
    const slug = segments[1];
    return new Promise((resolve) => {
      execFile('node', [path.join(ROOT, 'build.js'), slug], { cwd: ROOT, timeout: 60000 }, (err, stdout, stderr) => {
        if (err) {
          sendJSON(res, 500, { ok: false, output: stderr || err.message });
        } else {
          sendJSON(res, 200, { ok: true, output: stdout + (stderr || '') });
        }
        resolve();
      });
    });
  }

  // POST /api/build  — build all courses
  if (method === 'POST' && segments.length === 1 && segments[0] === 'build') {
    return new Promise((resolve) => {
      execFile('node', [path.join(ROOT, 'build.js')], { cwd: ROOT, timeout: 120000 }, (err, stdout, stderr) => {
        if (err) {
          sendJSON(res, 500, { ok: false, output: stderr || err.message });
        } else {
          sendJSON(res, 200, { ok: true, output: stdout + (stderr || '') });
        }
        resolve();
      });
    });
  }

  return send404(res);
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;
  const method = req.method;

  // CORS for local dev
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  // Static files
  if (method === 'GET' && serveStatic(pathname, res)) return;

  // API routes
  if (pathname.startsWith('/api/')) {
    const segments = pathname.replace(/^\/api\//, '').replace(/\/$/, '').split('/');
    try {
      await handleAPI(method, segments, req, res);
    } catch (e) {
      console.error('API error:', e);
      send500(res, e);
    }
    return;
  }

  send404(res);
});

server.listen(PORT, () => {
  console.log(`\n  Course Builder running at http://localhost:${PORT}\n`);
  console.log('  Press Ctrl+C to stop.\n');
});
