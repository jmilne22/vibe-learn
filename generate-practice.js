#!/usr/bin/env node
// generate-practice.js — emit a local Go practice workspace from exercise YAML.
//
//   node generate-practice.js [courseSlug] [--verify] [--force]
//
// Reads courses/<slug>/content/exercises/module{N}-variants.yaml and, for every
// challenge variant that has a `testGo:` field, writes:
//
//   practice/module{N}/{challengeId}_{variantId}/
//     exercise.go       stub (from stubGo: or generated from functionSignature)
//     exercise_test.go  the testGo block
//     README.md         title + description
//
// `testGo:` and `stubGo:` are Go file *bodies* — no package or import lines.
// Imports are inferred from package qualifiers against IMPORT_MAP below.
//
// --verify additionally writes practice/.verify/ with each variant's solution
// in place of the stub, then runs `go vet` on the stubs and
// `go test -race -count=1` on the solutions. Non-zero exit on any failure.
//
// Re-running never overwrites an exercise.go you have edited (your work is
// safe); tests and READMEs are always refreshed. Use --force to reset stubs.

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const yaml = require('js-yaml');

const ROOT = __dirname;
const PRACTICE_DIR = path.join(ROOT, 'practice');
const VERIFY_DIR = path.join(PRACTICE_DIR, '.verify');
const GO_VERSION = '1.26';
const YAML_DEP = 'gopkg.in/yaml.v3 v3.0.1';

// Package qualifier -> import path. Extend as exercises genuinely need.
const IMPORT_MAP = {
  fmt: 'fmt',
  strings: 'strings',
  strconv: 'strconv',
  bytes: 'bytes',
  os: 'os',
  io: 'io',
  bufio: 'bufio',
  errors: 'errors',
  sort: 'sort',
  time: 'time',
  math: 'math',
  json: 'encoding/json',
  binary: 'encoding/binary',
  hex: 'encoding/hex',
  csv: 'encoding/csv',
  context: 'context',
  sync: 'sync',
  atomic: 'sync/atomic',
  http: 'net/http',
  httptest: 'net/http/httptest',
  url: 'net/url',
  net: 'net',
  netip: 'net/netip',
  filepath: 'path/filepath',
  fs: 'io/fs',
  rand: 'math/rand',
  reflect: 'reflect',
  regexp: 'regexp',
  slices: 'slices',
  maps: 'maps',
  slog: 'log/slog',
  log: 'log',
  flag: 'flag',
  testing: 'testing',
  yaml: 'gopkg.in/yaml.v3',
};

function mkdirp(p) {
  fs.mkdirSync(p, { recursive: true });
}

// Strip string literals and comments so qualifiers inside them don't trigger
// imports ("_spf.local" in a fixture is not a package reference).
function stripLiterals(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
    } else if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
    } else if (c === '`') {
      i++;
      while (i < src.length && src[i] !== '`') i++;
      i++;
      out += ' "" ';
    } else if (c === '"') {
      i++;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === '\\') i++;
        i++;
      }
      i++;
      out += ' "" ';
    } else if (c === "'") {
      i++;
      while (i < src.length && src[i] !== "'") {
        if (src[i] === '\\') i++;
        i++;
      }
      i++;
      out += " '' ";
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

// Identifiers declared locally in the body: short var decls, var/const decls,
// func params and receivers, named results. These are not package qualifiers.
function localIdents(code) {
  const idents = new Set();
  let m;

  // a, b := ... / a := ...
  const shortDecl = /(^|[^=!<>:])((?:\w+\s*,\s*)*\w+)\s*:=/gm;
  while ((m = shortDecl.exec(code)) !== null) {
    m[2].split(',').forEach((id) => idents.add(id.trim()));
  }
  // var a / var a, b / const a
  const varDecl = /\b(?:var|const)\s+((?:\w+\s*,\s*)*\w+)/g;
  while ((m = varDecl.exec(code)) !== null) {
    m[1].split(',').forEach((id) => idents.add(id.trim()));
  }
  // func params, receivers, named results: every "name Type" pair inside
  // the parens of a func line (receiver, params, results), plus closures.
  const funcParens = /func\s*(?:\(([^)]*)\)\s*)?\w*\s*\(([^)]*)\)(?:\s*\(([^)]*)\))?/g;
  while ((m = funcParens.exec(code)) !== null) {
    for (const group of [m[1], m[2], m[3]]) {
      if (!group) continue;
      for (const part of group.split(',')) {
        const name = part.trim().split(/\s+/)[0];
        if (name && /^[a-z_]\w*$/.test(name)) idents.add(name);
      }
    }
  }
  // struct literal keys and label-ish "name:" at start of line are lowercase
  // only in map literals; those never get dotted, so no handling needed.
  return idents;
}

function inferImports(body, context) {
  const cleaned = stripLiterals(body);
  const locals = localIdents(cleaned);
  const qualifiers = new Set();
  const re = /(^|[^\w.])([a-z_]\w*)\s*\./g;
  let m;
  while ((m = re.exec(cleaned)) !== null) {
    const q = m[2];
    if (locals.has(q)) continue;
    if (q === '_') continue;
    qualifiers.add(q);
  }
  const imports = [];
  const unknown = [];
  for (const q of qualifiers) {
    if (IMPORT_MAP[q]) imports.push(IMPORT_MAP[q]);
    else unknown.push(q);
  }
  if (unknown.length > 0) {
    throw new Error(
      `${context}: unknown package qualifier(s): ${unknown.join(', ')}. ` +
        `Add to IMPORT_MAP or declare the identifier locally.`
    );
  }
  return imports.sort();
}

function assembleFile(body, context) {
  const imports = inferImports(body, context);
  let src = 'package exercise\n\n';
  if (imports.length === 1) {
    src += `import "${imports[0]}"\n\n`;
  } else if (imports.length > 1) {
    src += 'import (\n' + imports.map((p) => `    "${p}"\n`).join('') + ')\n\n';
  }
  return src + body.replace(/\s+$/, '') + '\n';
}

// Build a stub body from functionSignature when no stubGo is given.
// Lines starting with "func" get a panic body; type lines pass through.
function stubFromSignature(sig, context) {
  if (!sig) {
    throw new Error(`${context}: has testGo but no stubGo and no functionSignature`);
  }
  const lines = String(sig).split('\n');
  const out = [];
  for (const line of lines) {
    const t = line.trim();
    if (t === '') continue;
    if (t.startsWith('func ')) {
      out.push(`${t} {\n    panic("implement me")\n}`);
    } else {
      out.push(t);
    }
  }
  return out.join('\n\n') + '\n';
}

function stripHTML(s) {
  return String(s)
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function collectVariants(courseDir) {
  const exercisesDir = path.join(courseDir, 'content', 'exercises');
  const found = [];
  const moduleNums = fs.existsSync(exercisesDir)
    ? fs.readdirSync(exercisesDir)
        .map(f => (f.match(/^module(\d+)-variants\.yaml$/) || [])[1])
        .filter(Boolean)
        .map(Number)
        .sort((a, b) => a - b)
    : [];
  for (const modNum of moduleNums) {
    const file = path.join(exercisesDir, `module${modNum}-variants.yaml`);
    const parsed = yaml.load(fs.readFileSync(file, 'utf8'));
    const groups = [
      ...((parsed && parsed.variants && parsed.variants.challenges) || []),
      ...((parsed && parsed.variants && parsed.variants.warmups) || []),
    ];
    for (const challenge of groups) {
      for (const variant of challenge.variants || []) {
        if (!variant.testGo) continue;
        found.push({ modNum, challenge, variant });
      }
    }
  }
  return found;
}

function writeWorkspace(entries, { force }) {
  let written = 0;
  let kept = 0;
  for (const { modNum, challenge, variant } of entries) {
    const dirName = `${challenge.id}_${variant.id}`;
    const dir = path.join(PRACTICE_DIR, `module${modNum}`, dirName);
    const context = `module${modNum}/${dirName}`;
    mkdirp(dir);

    const stubBody = variant.stubGo || stubFromSignature(variant.functionSignature, context);
    const stubPath = path.join(dir, 'exercise.go');
    if (force || !fs.existsSync(stubPath)) {
      fs.writeFileSync(stubPath, assembleFile(stubBody, `${context} (stub)`));
      written++;
    } else {
      kept++;
    }
    fs.writeFileSync(
      path.join(dir, 'exercise_test.go'),
      assembleFile(variant.testGo, `${context} (test)`)
    );

    let readme = `# ${variant.title}\n\n${stripHTML(variant.description)}\n`;
    if (variant.functionSignature) {
      readme += `\n\`\`\`go\n${variant.functionSignature}\n\`\`\`\n`;
    }
    readme += '\nWrite your solution in `exercise.go`, then run `go test`';
    readme += [6, 7, 8, 9].includes(modNum) ? ' (and `go test -race`).\n' : '.\n';
    fs.writeFileSync(path.join(dir, 'README.md'), readme);
  }
  return { written, kept };
}

function writeVerifyTree(entries) {
  fs.rmSync(VERIFY_DIR, { recursive: true, force: true });
  for (const { modNum, challenge, variant } of entries) {
    const dirName = `${challenge.id}_${variant.id}`;
    const dir = path.join(VERIFY_DIR, `module${modNum}`, dirName);
    const context = `verify ${`module${modNum}/${dirName}`}`;
    mkdirp(dir);
    fs.writeFileSync(path.join(dir, 'exercise.go'), assembleFile(variant.solution, `${context} (solution)`));
    fs.writeFileSync(path.join(dir, 'exercise_test.go'), assembleFile(variant.testGo, `${context} (test)`));
  }
}

function ensureGoMod() {
  mkdirp(PRACTICE_DIR);
  // Always pin the yaml require: `go mod tidy` must never be run here — the
  // solution tree lives in a dot-dir the go tool can't see, and the stubs
  // alone don't import yaml, so tidy would drop the dependency.
  const goModPath = path.join(PRACTICE_DIR, 'go.mod');
  const wantGoMod = `module practice\n\ngo ${GO_VERSION}\n\nrequire ${YAML_DEP}\n`;
  if (!fs.existsSync(goModPath) || !fs.readFileSync(goModPath, 'utf8').includes('gopkg.in/yaml.v3')) {
    fs.writeFileSync(goModPath, wantGoMod);
  }
  if (!fs.existsSync(path.join(PRACTICE_DIR, 'go.sum'))) {
    const dl = spawnSync('go', ['mod', 'download', 'all'], { cwd: PRACTICE_DIR, encoding: 'utf8' });
    if (dl.status !== 0) {
      console.warn(
        'warning: `go mod download` failed (offline?). Run `go mod download all` in practice/ before using yaml-based exercises.\n' +
          (dl.stderr || '')
      );
    }
  }
}

function runGo(args, cwd, label) {
  console.log(`\n$ go ${args.join(' ')}   (${path.relative(ROOT, cwd)})`);
  const res = spawnSync('go', args, { cwd, encoding: 'utf8', stdio: 'inherit' });
  if (res.status !== 0) {
    console.error(`\nFAIL: ${label}`);
    return false;
  }
  return true;
}

function main() {
  const args = process.argv.slice(2);
  const verify = args.includes('--verify');
  const force = args.includes('--force');
  const slug = args.find((a) => !a.startsWith('--')) || 'infra-go';
  const courseDir = path.join(ROOT, 'courses', slug);
  if (!fs.existsSync(courseDir)) {
    console.error(`No such course: ${slug}`);
    process.exit(1);
  }

  const entries = collectVariants(courseDir);
  if (entries.length === 0) {
    console.log('No variants with testGo found — nothing to generate yet.');
    ensureGoMod();
    return;
  }

  ensureGoMod();
  const { written, kept } = writeWorkspace(entries, { force });
  const perModule = {};
  for (const e of entries) {
    perModule[e.modNum] = (perModule[e.modNum] || 0) + 1;
  }
  console.log(`practice/: ${entries.length} exercises across modules ${Object.keys(perModule).join(', ')}`);
  console.log(`  stubs written: ${written}, kept (already edited): ${kept}`);
  const first = entries[0];
  console.log(`\nTry one:\n  cd practice/module${first.modNum}/${first.challenge.id}_${first.variant.id} && go test`);

  if (verify) {
    writeVerifyTree(entries);
    let ok = runGo(['vet', './...'], PRACTICE_DIR, 'stubs must compile (go vet)');
    ok = runGo(['test', '-race', '-count=1', './...'], VERIFY_DIR, 'solutions must pass their tests') && ok;
    if (!ok) process.exit(1);
    console.log(`\nverify OK: ${entries.length} stubs compile, ${entries.length} solutions pass with -race`);
  }
}

main();
