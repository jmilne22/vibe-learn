#!/usr/bin/env node
// generate-practice.js — emit a local Go practice workspace from exercise YAML.
//
//   node generate-practice.js [courseSlug] [--verify] [--force]
//
// Set VIBE_PRACTICE_DIR and VIBE_MANIFEST_FILE to generate a clean workspace
// seed outside the repository (used by desktop packaging).
//
// Reads courses/<slug>/content/exercises/module{N}-variants.yaml and, for every
// warmup/challenge/scaffold variant it can grade, writes:
//
//   practice/module{N}/{groupId}_{variantId}/
//     exercise.go       stub (from stubGo:, functionSignature, or generated)
//     exercise_test.go  hand-written testGo: or an auto-generated harness
//     README.md         title + description
//
// Auto-generation paths (see the sections below): warmups from solution
// output (optionally driverGo:), challenges from functionSignature +
// testCases, scaffolds (trace/fix/complete/produce) from codeGo:/solutionGo:,
// and test-writing exercises via mutation grading (implGo: + mutantsGo:,
// learner owns learner_test.go instead of exercise.go).
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
const PRACTICE_DIR = path.resolve(process.env.VIBE_PRACTICE_DIR || path.join(ROOT, 'practice'));
const VERIFY_DIR = path.join(PRACTICE_DIR, '.verify');
const MANIFEST_FILE = path.resolve(process.env.VIBE_MANIFEST_FILE || path.join(ROOT, 'practice-manifest.json'));
const GO_BINARY = process.env.VIBE_GO_BINARY || 'go';
const GO_VERSION = '1.26';

// Module dependencies for practice/go.mod. Each is anchored from
// internal/deps/deps.go so `go mod tidy` never drops it and
// `go mod vendor` ships its source with the desktop app.
const GO_DEPS = {
  'gopkg.in/yaml.v3': { version: 'v3.0.1', anchor: 'gopkg.in/yaml.v3' },
  'k8s.io/api': { version: 'v0.36.2', anchor: 'k8s.io/api/core/v1' },
  'k8s.io/apimachinery': { version: 'v0.36.2', anchor: 'k8s.io/apimachinery/pkg/apis/meta/v1' },
  'k8s.io/client-go': { version: 'v0.36.2', anchor: 'k8s.io/client-go/kubernetes/fake' },
};

// Package qualifier -> import path. Extend as exercises genuinely need.
// A value may be { path, alias } for packages imported under an alias
// (the k8s convention: metav1, corev1, ...).
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
  exec: 'os/exec',
  syscall: 'syscall',
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
  kubernetes: 'k8s.io/client-go/kubernetes',
  fake: 'k8s.io/client-go/kubernetes/fake',
  rest: 'k8s.io/client-go/rest',
  metav1: { path: 'k8s.io/apimachinery/pkg/apis/meta/v1', alias: 'metav1' },
  corev1: { path: 'k8s.io/api/core/v1', alias: 'corev1' },
  appsv1: { path: 'k8s.io/api/apps/v1', alias: 'appsv1' },
  apierrors: { path: 'k8s.io/apimachinery/pkg/api/errors', alias: 'apierrors' },
  watch: 'k8s.io/apimachinery/pkg/watch',
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
    if (IMPORT_MAP[q]) {
      const spec = IMPORT_MAP[q];
      imports.push(typeof spec === 'string' ? { path: spec, alias: '' } : spec);
    } else {
      unknown.push(q);
    }
  }
  if (unknown.length > 0) {
    throw new Error(
      `${context}: unknown package qualifier(s): ${unknown.join(', ')}. ` +
        `Add to IMPORT_MAP or declare the identifier locally.`
    );
  }
  return imports.sort((a, b) => (a.path < b.path ? -1 : 1));
}

function importLine(spec) {
  return (spec.alias ? spec.alias + ' ' : '') + `"${spec.path}"`;
}

function assembleFile(body, context, pkg) {
  const imports = inferImports(body, context);
  let src = `package ${pkg || 'exercise'}\n\n`;
  if (imports.length === 1) {
    src += `import ${importLine(imports[0])}\n\n`;
  } else if (imports.length > 1) {
    src += 'import (\n' + imports.map((p) => `    ${importLine(p)}\n`).join('') + ')\n\n';
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

// --- Auto-generated tests (golden output from the canonical solution) ---
//
// Variants without a hand-written `testGo:` get one generated here:
//   warmups    — the learner fills in run(); the test compares its stdout
//                against the solution's captured output ("Expected output"
//                in the README, rustlings-style).
//   challenges — each testCases input expression is evaluated against the
//                solution at generate time; the test replays the same calls
//                on the learner's code and compares printed results.
// Solutions that don't compile standalone, print nothing, or are
// non-deterministic are skipped (they stay browser-rated) and reported.

const AUTOGEN_DIR = path.join(PRACTICE_DIR, 'autogen-tmp');
const CASE_SENTINEL = '--vibe-case--';

// Probe results are pure functions of the variant content, so cache them:
// re-running `npm run practice` only compiles solutions that changed.
const AUTOGEN_CACHE_FILE = path.join(ROOT, '.autogen-cache.json');
const AUTOGEN_VERSION = 5; // bump to invalidate all cached probes
let autogenCache = {};
let autogenCacheDirty = false;

function loadAutogenCache() {
  try { autogenCache = JSON.parse(fs.readFileSync(AUTOGEN_CACHE_FILE, 'utf8')); }
  catch { autogenCache = {}; }
}

function saveAutogenCache() {
  if (!autogenCacheDirty) return;
  fs.writeFileSync(AUTOGEN_CACHE_FILE, JSON.stringify(autogenCache));
}

function autogenKey(kind, variant, group) {
  const crypto = require('crypto');
  const material = JSON.stringify([
    AUTOGEN_VERSION, kind,
    variant.solution || '',
    variant.stubGo || '',
    variant.driverGo || '',
    variant.functionSignature || '',
    variant.setupGo || (group && group.setupGo) || '',
    (variant.testCases || []).map((tc) => tc.input),
    variant.type || '',
    variant.codeGo || '',
    variant.solutionGo || '',
  ]);
  return crypto.createHash('sha256').update(material).digest('hex');
}

// Wrap an autogen function with the cache. Cached fields are re-applied to
// the variant object; errors are cached too (failed probes are the slow ones).
function cachedAutoGen(kind, variant, group, context, fn) {
  const key = autogenKey(kind, variant, group);
  const hit = autogenCache[key];
  if (hit) {
    if (hit.error) return { error: hit.error };
    variant.testGo = hit.testGo;
    if (hit.stubGo) variant.stubGo = hit.stubGo;
    if (hit.verifySolution) variant._verifySolution = hit.verifySolution;
    if (hit.expectedOutput) variant._expectedOutput = hit.expectedOutput;
    if (hit.taskLine) variant._taskLine = hit.taskLine;
    return {};
  }
  const res = fn();
  autogenCacheDirty = true;
  autogenCache[key] = res.error ? { error: res.error } : {
    testGo: variant.testGo,
    stubGo: variant.stubGo,
    verifySolution: variant._verifySolution,
    expectedOutput: variant._expectedOutput,
    taskLine: variant._taskLine,
  };
  return res;
}

function goStr(s) {
  return JSON.stringify(String(s));
}

function braceDelta(line) {
  const clean = stripLiterals(line);
  let d = 0;
  for (const c of clean) {
    if (c === '{') d++;
    else if (c === '}') d--;
  }
  return d;
}

// Top-level decl blocks with names: [{ kind: 'func'|'type'|'var'|'const', name, text }]
function declBlocks(src) {
  const lines = String(src).split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const m = line.match(/^(func|type)\s+(?:\([^)]*\)\s*)?(\w+)/);
    const vm = line.match(/^(var|const)\b\s*(\(|(\w+))/);
    if (m) {
      const block = [line];
      let depth = braceDelta(line);
      i++;
      while (i < lines.length && depth > 0) {
        block.push(lines[i]);
        depth += braceDelta(lines[i]);
        i++;
      }
      blocks.push({ kind: m[1], name: m[2], text: block.join('\n') });
    } else if (vm) {
      const block = [line];
      i++;
      if (vm[2] === '(') {
        // var ( ... ) block: consume until the closing paren line
        while (i < lines.length && lines[i].trim() !== ')') {
          block.push(lines[i]);
          i++;
        }
        if (i < lines.length) { block.push(lines[i]); i++; }
      }
      blocks.push({ kind: vm[1], name: vm[3] || '', text: block.join('\n') });
    } else {
      i++;
    }
  }
  return blocks;
}

// Split a solution snippet into top-level declarations (func/type blocks
// starting at column 0) and loose statements (everything else).
function splitTopLevel(src) {
  const lines = String(src).split('\n');
  const decls = [];
  const stmts = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^(func|type)\b/.test(line)) {
      const block = [line];
      let depth = braceDelta(line);
      i++;
      while (i < lines.length && depth > 0) {
        block.push(lines[i]);
        depth += braceDelta(lines[i]);
        i++;
      }
      decls.push(block.join('\n'));
    } else {
      stmts.push(line);
      i++;
    }
  }
  return { decls: decls.join('\n\n').trim(), stmts: stmts.join('\n').trim() };
}

function indent(src, pad) {
  return String(src)
    .split('\n')
    .map((l) => (l.trim() === '' ? '' : pad + l))
    .join('\n');
}

// Run a package-main probe twice; return { output } or { error }.
function runProbe(body, context) {
  let src;
  try {
    src = assembleFile(body, context, 'main');
  } catch (e) {
    return { error: e.message };
  }
  fs.rmSync(AUTOGEN_DIR, { recursive: true, force: true });
  mkdirp(AUTOGEN_DIR);
  fs.writeFileSync(path.join(AUTOGEN_DIR, 'main.go'), src);
  const opts = { cwd: PRACTICE_DIR, encoding: 'utf8', input: '', timeout: 30000 };
  const bin = path.join(AUTOGEN_DIR, 'probe.bin');
  const build = spawnSync(GO_BINARY, ['build', '-o', bin, './autogen-tmp'], opts);
  if (build.status !== 0) {
    return { error: (build.stderr || 'probe build failed').trim().split('\n').slice(0, 3).join(' | ') };
  }
  // Map iteration and goroutine scheduling randomize output; require six
  // runs to agree (after order-insensitive line canonicalization).
  const canon = (s) => String(s).trim().split('\n').map((l) => l.trimEnd()).sort().join('\n');
  let first = null;
  for (let i = 0; i < 6; i++) {
    const run = spawnSync(bin, [], opts);
    if (run.status !== 0) {
      return { error: (run.stderr || 'probe run failed').trim().split('\n').slice(0, 2).join(' | ') };
    }
    if (first === null) first = run.stdout;
    else if (canon(run.stdout) !== canon(first)) return { error: 'non-deterministic output' };
  }
  return { output: first };
}

// Lines may print in any order when they come from map iteration or
// goroutines, so equality falls back to a sorted-lines comparison.
const WARMUP_TEST_HARNESS = `func vibeCanon(s string) string {
    lines := strings.Split(strings.TrimSpace(s), "\\n")
    for i := range lines {
        lines[i] = strings.TrimRight(lines[i], " \\t")
    }
    sort.Strings(lines)
    return strings.Join(lines, "\\n")
}

func TestOutput(t *testing.T) {
    oldStdout := os.Stdout
    r, w, err := os.Pipe()
    if err != nil {
        t.Fatal(err)
    }
    os.Stdout = w
    run()
    w.Close()
    os.Stdout = oldStdout
    data, _ := io.ReadAll(r)
    got := strings.TrimSpace(string(data))
    want := strings.TrimSpace(expectedOutput)
    if got != want && vibeCanon(got) != vibeCanon(want) {
        t.Errorf("output mismatch\\n--- your output ---\\n%s\\n--- expected (see README.md) ---\\n%s", got, want)
    }
}`;

// Replace every top-level func body with panic("implement me"), keeping
// types/vars/consts verbatim — the stub for "write this function" warmups.
function panicStubFromDecls(src) {
  return declBlocks(src).map((b) => {
    if (b.kind !== 'func') return b.text;
    const sigEnd = b.text.indexOf('{');
    if (sigEnd === -1) return b.text;
    return b.text.slice(0, sigEnd).trimEnd() + ' {\n    panic("implement me")\n}';
  }).join('\n\n');
}

function autoGenWarmup(variant, context) {
  if (!variant.solution) return { error: 'no solution' };

  // Declaration-only warmups ("write NewService...") carry a driverGo:
  // fixed statements that call the learner's code and print results. The
  // canonical solution produces the golden output; the stub gives the
  // driver in run() and panic-bodies for every func the learner writes.
  if (variant.driverGo) {
    const driver = String(variant.driverGo).trim();
    const { decls } = splitTopLevel(variant.solution);
    const probeBody =
      (decls ? decls + '\n\n' : '') + 'func main() {\n' + indent(driver, '    ') + '\n}\n';
    const probe = runProbe(probeBody, context);
    if (probe.error) return { error: probe.error };
    const golden = probe.output.replace(/\s+$/, '');
    if (!golden.trim()) return { error: 'driver prints nothing' };

    if (!variant.stubGo) {
      variant.stubGo =
        panicStubFromDecls(variant.solution) +
        '\n\n// Driver — already wired up; make it print the expected output.\nfunc run() {\n' +
        indent(driver, '    ') + '\n}\n';
    }
    variant.testGo =
      'const expectedOutput = ' + goStr(golden) + '\n\n' + WARMUP_TEST_HARNESS + '\n';
    variant._verifySolution =
      (decls ? decls + '\n\n' : '') + 'func run() {\n' + indent(driver, '    ') + '\n}\n';
    variant._expectedOutput = golden;
    return {};
  }

  const { decls, stmts } = splitTopLevel(variant.solution);
  if (!stmts) return { error: 'solution has no statements to run' };

  const probeBody =
    (decls ? decls + '\n\n' : '') + 'func main() {\n' + indent(stmts, '    ') + '\n}\n';
  const probe = runProbe(probeBody, context);
  if (probe.error) return { error: probe.error };
  const golden = probe.output.replace(/\s+$/, '');
  if (!golden.trim()) return { error: 'solution prints nothing' };

  variant.stubGo =
    '// ' + String(variant.title || 'Warmup').replace(/\n/g, ' ') + '\n' +
    '//\n' +
    '// Task: see README.md. Make run() print exactly the "Expected output"\n' +
    '// shown there. Add any types, helpers, and imports you need.\n' +
    'func run() {\n    // your code here\n}\n';
  variant.testGo =
    'const expectedOutput = ' + goStr(golden) + '\n\n' + WARMUP_TEST_HARNESS + '\n';
  variant._verifySolution =
    (decls ? decls + '\n\n' : '') + 'func run() {\n' + indent(stmts, '    ') + '\n}\n';
  variant._expectedOutput = golden;
  return {};
}

// Split a testCases input on top-level semicolons (outside strings and
// brackets): "s := New(); s.Add(x); s.Get(k)" -> statements + final
// expression to print. Returns { stmts: [], expr } — stmts empty for a
// plain expression input.
function splitCaseInput(input) {
  const parts = [];
  let cur = '';
  let depth = 0;
  let str = null; // ", ', or `
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (str) {
      cur += c;
      if (c === '\\' && str !== '`') { cur += input[++i] || ''; continue; }
      if (c === str) str = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { str = c; cur += c; continue; }
    if (c === '(' || c === '[' || c === '{') depth++;
    if (c === ')' || c === ']' || c === '}') depth--;
    if (c === ';' && depth === 0) { parts.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) parts.push(cur.trim());
  // Strip trailing // comments (annotations in testCase inputs, not code)
  const clean = parts.map((p) => {
    let s = null;
    for (let i = 0; i < p.length; i++) {
      const c = p[i];
      if (s) {
        if (c === '\\' && s !== '`') { i++; continue; }
        if (c === s) s = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') { s = c; continue; }
      if (c === '/' && p[i + 1] === '/') return p.slice(0, i).trim();
    }
    return p;
  });
  return { stmts: clean.slice(0, -1), expr: clean[clean.length - 1] || '' };
}

function caseBlock(input, indent) {
  const { stmts, expr } = splitCaseInput(input);
  const lines = stmts.concat([`fmt.Println(${expr})`]);
  return lines.map((l) => indent + l).join('\n');
}

function autoGenChallenge(group, variant, context) {
  const sig = String(variant.functionSignature || '').trim();
  if (!sig) return { error: 'no functionSignature' };
  if (/^(func\s+)?Test[A-Z_]/.test(sig)) return { error: 'test-writing exercise' };
  if (!variant.solution) return { error: 'no solution' };
  const cases = (variant.testCases || [])
    .map((tc) => String(tc.input || '').trim())
    .filter(Boolean);
  if (cases.length === 0) return { error: 'no testCases' };

  const setup = String(variant.setupGo || group.setupGo || '').trim();
  const solutionSrc = (setup ? setup + '\n\n' : '') + variant.solution;

  // Each case in its own block: cases reuse variable names (s := New()...)
  const mainCalls = cases
    .map((c) => `    fmt.Println(${goStr(CASE_SENTINEL)})\n    {\n` + caseBlock(c, '        ') + '\n    }')
    .join('\n');
  const probe = runProbe(solutionSrc + '\n\nfunc main() {\n' + mainCalls + '\n}\n', context);
  if (probe.error) return { error: probe.error };

  const parts = probe.output.split(CASE_SENTINEL + '\n').slice(1)
    .map((p) => p.replace(/\s+$/, ''));
  if (parts.length !== cases.length) return { error: 'could not split case outputs' };

  const switchCases = cases
    .map((c, i) => `    case ${i}:\n` + caseBlock(c, '        '))
    .join('\n');
  variant.testGo =
    'var vibeCaseInputs = []string{\n' + cases.map((c) => '    ' + goStr(c) + ',').join('\n') + '\n}\n\n' +
    'var vibeCaseWants = []string{\n' + parts.map((p) => '    ' + goStr(p) + ',').join('\n') + '\n}\n\n' +
    'func vibeRunCase(i int) {\n    switch i {\n' + switchCases + '\n    }\n}\n\n' +
    `func TestCases(t *testing.T) {
    for i := range vibeCaseWants {
        oldStdout := os.Stdout
        r, w, err := os.Pipe()
        if err != nil {
            t.Fatal(err)
        }
        os.Stdout = w
        vibeRunCase(i)
        w.Close()
        os.Stdout = oldStdout
        data, _ := io.ReadAll(r)
        got := strings.TrimSpace(string(data))
        want := strings.TrimSpace(vibeCaseWants[i])
        if got != want {
            t.Errorf("case %d: %s\\n  got:  %s\\n  want: %s", i+1, vibeCaseInputs[i], got, want)
        }
    }
}\n`;
  if (!variant.stubGo) {
    // The learner implements the signature function(s); everything else the
    // solution declares (types, helper methods) is scaffolding they need to
    // compile against — carry it into the stub.
    const sigNames = new Set(
      [...sig.matchAll(/func\s+(?:\([^)]*\)\s*)?(\w+)/g)].map((m) => m[1])
    );
    const sigTypes = new Set(
      [...sig.matchAll(/type\s+(\w+)/g)].map((m) => m[1])
    );
    const scaffolding = declBlocks(variant.solution)
      .filter((b) => !(b.kind === 'func' && sigNames.has(b.name)))
      .filter((b) => !(b.kind === 'type' && sigTypes.has(b.name)))
      .map((b) => b.text)
      .join('\n\n');
    variant.stubGo =
      (setup ? setup + '\n\n' : '') +
      (scaffolding ? scaffolding + '\n\n' : '') +
      stubFromSignature(variant.functionSignature, context);
  }
  variant._verifySolution = solutionSrc;
  return {};
}

// --- Test-writing exercises (mutation grading) ---
//
// "Write TestX" exercises invert the grading problem: the learner writes
// the test, so we can't grade by running a test against their code. Instead
// the workspace ships the real implementation plus subtly broken mutants
// (from `implGo:` and `mutantsGo:` on the variant), each behind a build
// tag. The learner's test (learner_test.go) must pass against the real
// implementation, and a generated grader re-runs it against every mutant
// via `go test -tags vibe_mN` expecting failure — a test that can't tell
// the broken implementations from the real one isn't done yet.
//
// No generate-time probing: --verify proves the canonical solution test
// passes against the real implementation and kills every mutant.

function assembleTagged(body, context, tagExpr) {
  return `//go:build ${tagExpr}\n\n` + assembleFile(body, context);
}

function autoGenMutation(variant) {
  const implGo = String(variant.implGo || '').trim();
  const mutants = (variant.mutantsGo || []).map((m) =>
    typeof m === 'string' ? { go: m, note: '' } : { go: String(m.go || ''), note: String(m.note || '') });
  if (!implGo || mutants.length === 0 || mutants.some((m) => !m.go.trim())) {
    return { error: 'test-writing exercise (needs implGo + mutantsGo)' };
  }
  if (!variant.solution) return { error: 'test-writing exercise (needs a canonical solution test)' };
  const testNames = [...new Set(String(variant.functionSignature).match(/Test\w+/g) || [])];
  if (testNames.length === 0) return { error: 'cannot find Test name in functionSignature' };
  const testName = testNames[0];
  const runPattern = `^(${testNames.join('|')})$`;
  const namesLabel = testNames.map((n) => '`' + n + '`').join(', ');

  const tags = mutants.map((_, i) => `vibe_m${i + 1}`);
  const mutantRows = tags
    .map((tag, i) => `    {${goStr(tag)}, ${goStr(mutants[i].note)}},`)
    .join('\n');
  variant.testGo =
    '// Mutation grader — your test must pass against the real implementation\n' +
    '// (the normal go test run covers that) and FAIL against every broken\n' +
    '// implementation below. Each mutant lives behind a build tag.\n' +
    'var vibeMutants = []struct{ tag, note string }{\n' + mutantRows + '\n}\n\n' +
    `func TestVibeMutants(t *testing.T) {
    goBin := os.Getenv("VIBE_GO_BINARY")
    if goBin == "" {
        goBin = "go"
    }
    for _, m := range vibeMutants {
        cmd := exec.Command(goBin, "test", "-tags", m.tag, "-run", ${goStr(runPattern)}, "-count=1", ".")
        out, err := cmd.CombinedOutput()
        if strings.Contains(string(out), "no tests to run") {
            t.Fatal("keep your test(s) named ${testNames.join(', ')} — the grader runs them by name")
        }
        if err == nil {
            label := m.tag
            if m.note != "" {
                label += " (" + m.note + ")"
            }
            t.Errorf("broken implementation %s slipped past your test — tighten your assertions so it fails", label)
        }
    }
}\n`;
  if (!variant.stubGo) {
    variant.stubGo =
      '// ' + String(variant.title || 'Write a test').replace(/\n/g, ' ') + '\n' +
      '//\n' +
      `// Write ${testNames.join(', ')} below. They run against the real\n` +
      '// implementation in impl.go — and the grader re-runs them against\n' +
      '// broken implementations that your assertions must catch. See README.md.\n' +
      testNames
        .map((n) => `func ${n}(t *testing.T) {\n    t.Fatal("write your test — see README.md")\n}`)
        .join('\n\n') + '\n';
  }
  variant._mutation = { implGo, mutants, tags, testName };
  variant._verifySolution = variant.solution;
  variant._taskLine =
    `Write ${namesLabel} in \`learner_test.go\`, then run \`go test\`. ` +
    (testNames.length > 1 ? 'They' : 'It') +
    ' must pass against the real implementation and fail against every broken one the grader swaps in.';
  return {};
}

// --- Scaffold drills (trace / fix / complete / produce) ---
//
// Scaffolds are the remedial drill ladder. Each type maps onto the
// workbench differently:
//   trace            — codeGo is the program; the learner sets `predicted`
//                      in exercise.go to what it prints. The test compares
//                      the prediction against the golden output.
//   fix / complete   — codeGo is the broken/blanked starting run() body;
//                      the canonical solution (solutionGo, falling back to
//                      solution when it's runnable) produces the golden
//                      output the learner's run() must match.
//   produce          — same as a plain warmup: empty run() stub, output
//                      must match the canonical solution's.

const TRACE_TEST_HARNESS = `func TestPrediction(t *testing.T) {
    if strings.TrimSpace(predicted) == "" {
        t.Fatal("set ` + '`predicted`' + ` in exercise.go — trace the code by hand first, don't run it")
    }
    got := strings.TrimSpace(predicted)
    want := strings.TrimSpace(expectedOutput)
    if got != want {
        t.Errorf("prediction mismatch\\n--- your prediction ---\\n%s\\n--- the code actually prints ---\\n%s", got, want)
    }
}`;

function runFuncFrom(src) {
  const { decls, stmts } = splitTopLevel(src);
  if (!stmts) return { error: 'no statements to run' };
  return {
    body: (decls ? decls + '\n\n' : '') + 'func run() {\n' + indent(stmts, '    ') + '\n}\n',
    probeBody: (decls ? decls + '\n\n' : '') + 'func main() {\n' + indent(stmts, '    ') + '\n}\n',
  };
}

function autoGenScaffold(variant, context) {
  const type = variant.type || 'produce';

  if (type === 'trace') {
    if (!variant.codeGo) return { error: 'trace scaffold needs codeGo' };
    const rf = runFuncFrom(variant.codeGo);
    if (rf.error) return { error: 'codeGo has no statements to run' };
    const probe = runProbe(rf.probeBody, context);
    if (probe.error) return { error: probe.error };
    const golden = probe.output.replace(/\s+$/, '');
    if (!golden.trim()) return { error: 'codeGo prints nothing' };

    if (!variant.stubGo) {
      variant.stubGo =
        '// ' + String(variant.title || 'Trace').replace(/\n/g, ' ') + '\n' +
        '//\n' +
        '// Trace the code in run() BY HAND — don\'t execute it. Set `predicted`\n' +
        '// to exactly what it prints (use a raw string literal with backticks\n' +
        '// for multi-line output), then save. The test checks your prediction.\n' +
        'var predicted = ``\n\n' + rf.body;
    }
    variant.testGo =
      'const expectedOutput = ' + goStr(golden) + '\n\n' + TRACE_TEST_HARNESS + '\n';
    variant._verifySolution = 'var predicted = ' + goStr(golden) + '\n\n' + rf.body;
    variant._taskLine =
      'Trace the code in `exercise.go` by hand, fill in `predicted`, then run `go test`.';
    return {};
  }

  // fix / complete / produce: output-matching against the canonical solution
  const canonical = String(variant.solutionGo || variant.solution || '').trim();
  if (!canonical) return { error: 'no solution' };
  const sol = runFuncFrom(canonical);
  if (sol.error) return { error: 'solution has no statements to run' };
  const probe = runProbe(sol.probeBody, context);
  if (probe.error) return { error: probe.error };
  const golden = probe.output.replace(/\s+$/, '');
  if (!golden.trim()) return { error: 'solution prints nothing' };

  if (!variant.stubGo) {
    if (variant.codeGo && (type === 'fix' || type === 'complete')) {
      const start = runFuncFrom(variant.codeGo);
      if (start.error) return { error: 'codeGo has no statements to run' };
      const header = type === 'fix'
        ? '// This code is broken — fix run() so the test passes.\n'
        : '// Fill in the blanks (TODO markers) in run() so the test passes.\n';
      variant.stubGo =
        '// ' + String(variant.title || 'Scaffold').replace(/\n/g, ' ') + '\n' +
        '//\n' + header + start.body;
    } else {
      variant.stubGo =
        '// ' + String(variant.title || 'Scaffold').replace(/\n/g, ' ') + '\n' +
        '//\n' +
        '// Task: see README.md. Make run() print exactly the "Expected output"\n' +
        '// shown there. Add any types, helpers, and imports you need.\n' +
        'func run() {\n    // your code here\n}\n';
    }
  }
  variant.testGo =
    'const expectedOutput = ' + goStr(golden) + '\n\n' + WARMUP_TEST_HARNESS + '\n';
  variant._verifySolution = sol.body;
  variant._expectedOutput = golden;
  return {};
}

// Mirror of build.js expandScaffoldTemplates: {{key}} substitution over
// template + params. Kept in sync so manifest keys match the built site.
function expandScaffoldTemplates(scaffolds) {
  if (!Array.isArray(scaffolds)) return scaffolds;
  const sub = (text, paramSet) =>
    text.replace(/\{\{(\w+)\}\}/g, (_, key) =>
      paramSet[key] !== undefined ? paramSet[key] : `{{${key}}}`);
  return scaffolds.map((scaffold) => {
    if (!scaffold.template || !Array.isArray(scaffold.params)) return scaffold;
    const expanded = { ...scaffold, variants: [] };
    scaffold.params.forEach((paramSet, idx) => {
      const variant = { id: 'tp' + (idx + 1) };
      ['type', 'title', 'description', 'solution', 'codeGo', 'solutionGo'].forEach((field) => {
        if (scaffold.template[field]) variant[field] = sub(scaffold.template[field], paramSet);
      });
      if (Array.isArray(scaffold.template.hints)) {
        variant.hints = scaffold.template.hints.map((hint) =>
          typeof hint === 'string' ? sub(hint, paramSet) : hint);
      }
      expanded.variants.push(variant);
    });
    delete expanded.template;
    delete expanded.params;
    return expanded;
  });
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
  loadAutogenCache();
  const exercisesDir = path.join(courseDir, 'content', 'exercises');
  const found = [];
  const moduleNums = fs.existsSync(exercisesDir)
    ? fs.readdirSync(exercisesDir)
        .map(f => (f.match(/^module(\d+)-variants\.yaml$/) || [])[1])
        .filter(Boolean)
        .map(Number)
        .sort((a, b) => a - b)
    : [];
  const skipped = [];
  for (const modNum of moduleNums) {
    const file = path.join(exercisesDir, `module${modNum}-variants.yaml`);
    const parsed = yaml.load(fs.readFileSync(file, 'utf8'));
    const scaffolds = expandScaffoldTemplates(
      (parsed && parsed.variants && parsed.variants.scaffolds) || []);
    const kinds = [
      { groups: (parsed && parsed.variants && parsed.variants.challenges) || [], kind: 'challenge' },
      { groups: (parsed && parsed.variants && parsed.variants.warmups) || [], kind: 'warmup' },
      { groups: scaffolds, kind: 'scaffold' },
    ];
    process.stdout.write(`module${modNum}: probing solutions `);
    for (const { groups, kind } of kinds) {
      for (const challenge of groups) {
        for (const variant of challenge.variants || []) {
          const context = `module${modNum}/${challenge.id}_${variant.id}`;
          if (!variant.testGo) {
            // Test-writing exercises route to the mutation grader; it does
            // no probing (--verify validates it), so it skips the cache.
            const isMutation = kind === 'challenge' &&
              /^(func\s+)?Test[A-Z_]/.test(String(variant.functionSignature || '').trim());
            const res = isMutation
              ? autoGenMutation(variant)
              : cachedAutoGen(kind, variant, challenge, context, () =>
                  kind === 'warmup' ? autoGenWarmup(variant, context)
                    : kind === 'scaffold' ? autoGenScaffold(variant, context)
                    : autoGenChallenge(challenge, variant, context));
            process.stdout.write(res.error ? 'x' : '.');
            if (res.error) {
              skipped.push({ context, reason: res.error });
              continue;
            }
          } else {
            process.stdout.write('·');
          }
          found.push({ modNum, challenge, variant });
        }
      }
    }
    process.stdout.write('\n');
  }
  fs.rmSync(AUTOGEN_DIR, { recursive: true, force: true });
  saveAutogenCache();
  return { found, skipped };
}

function writeMutationImpls(dir, mu, context) {
  const notAll = mu.tags.map((t) => '!' + t).join(' && ');
  fs.writeFileSync(path.join(dir, 'impl.go'),
    assembleTagged(mu.implGo, `${context} (impl)`, notAll));
  mu.mutants.forEach((m, i) => {
    fs.writeFileSync(path.join(dir, `impl_${mu.tags[i]}.go`),
      assembleTagged(m.go, `${context} (mutant ${i + 1})`, mu.tags[i]));
  });
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
    // Mutation (test-writing) workspaces: the learner owns learner_test.go;
    // the implementation and its tagged mutants are generator-owned.
    const stubPath = path.join(dir, variant._mutation ? 'learner_test.go' : 'exercise.go');
    if (force || !fs.existsSync(stubPath)) {
      fs.writeFileSync(stubPath, assembleFile(stubBody, `${context} (stub)`));
      written++;
    } else {
      kept++;
    }
    if (variant._mutation) {
      writeMutationImpls(dir, variant._mutation, context);
      fs.rmSync(path.join(dir, 'exercise.go'), { force: true });
    }
    fs.writeFileSync(
      path.join(dir, 'exercise_test.go'),
      assembleFile(variant.testGo, `${context} (test)`)
    );

    let readme = `# ${variant.title}\n\n${stripHTML(variant.description)}\n`;
    if (variant.functionSignature) {
      readme += `\n\`\`\`go\n${variant.functionSignature}\n\`\`\`\n`;
    }
    if (variant._expectedOutput) {
      readme += `\n## Expected output\n\nMake \`run()\` print exactly this:\n\n\`\`\`\n${variant._expectedOutput}\n\`\`\`\n`;
    }
    if (variant._taskLine) {
      readme += '\n' + variant._taskLine + '\n';
    } else {
      readme += '\nWrite your solution in `exercise.go`, then run `go test`';
      readme += [6, 7, 8, 9].includes(modNum) ? ' (and `go test -race`).\n' : '.\n';
    }
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
    fs.writeFileSync(path.join(dir, variant._mutation ? 'learner_test.go' : 'exercise.go'),
      assembleFile(variant._verifySolution || variant.solution, `${context} (solution)`));
    if (variant._mutation) writeMutationImpls(dir, variant._mutation, context);
    fs.writeFileSync(path.join(dir, 'exercise_test.go'), assembleFile(variant.testGo, `${context} (test)`));
  }
}

function ensureGoMod() {
  mkdirp(PRACTICE_DIR);
  // Anchor every dependency from a real package first: the stubs alone
  // don't import them (learner solutions and generated tests do), and both
  // `go mod tidy` and `go mod vendor` only see packages the module imports.
  // Without the anchors the packaged app's vendored seed would lack these
  // and -mod=vendor would make those exercises unsolvable offline.
  const depsDir = path.join(PRACTICE_DIR, 'internal', 'deps');
  mkdirp(depsDir);
  fs.writeFileSync(path.join(depsDir, 'deps.go'),
    '// Package deps anchors module dependencies that learner solutions\n' +
    '// import, so `go mod tidy` keeps them and `go mod vendor` ships their\n' +
    '// source with the desktop app.\n' +
    'package deps\n\nimport (\n' +
    Object.values(GO_DEPS).map((d) => `    _ "${d.anchor}"\n`).join('') +
    ')\n');

  const goModPath = path.join(PRACTICE_DIR, 'go.mod');
  const have = fs.existsSync(goModPath) ? fs.readFileSync(goModPath, 'utf8') : '';
  const missing = Object.keys(GO_DEPS).filter((m) => !have.includes(m));
  if (missing.length > 0) {
    const requires = Object.entries(GO_DEPS)
      .map(([mod, d]) => `\t${mod} ${d.version}`)
      .join('\n');
    fs.writeFileSync(goModPath,
      `module practice\n\ngo ${GO_VERSION}\n\nrequire (\n${requires}\n)\n`);
    // Fill in indirect requires + go.sum for the new deps. Safe because
    // deps.go (above) anchors everything we must keep.
    const tidy = spawnSync(GO_BINARY, ['mod', 'tidy'], { cwd: PRACTICE_DIR, encoding: 'utf8' });
    if (tidy.status !== 0) {
      console.warn(
        'warning: `go mod tidy` failed (offline?). Run `go mod tidy` in practice/ before using dependency-based exercises.\n' +
          (tidy.stderr || '')
      );
    }
  }
  if (!fs.existsSync(path.join(PRACTICE_DIR, 'go.sum'))) {
    const dl = spawnSync(GO_BINARY, ['mod', 'download', 'all'], { cwd: PRACTICE_DIR, encoding: 'utf8' });
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
  const res = spawnSync(GO_BINARY, args, { cwd, encoding: 'utf8', stdio: 'inherit' });
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

  ensureGoMod();
  const { found: entries, skipped } = collectVariants(courseDir);
  if (skipped.length > 0) {
    console.log(`\nSkipped ${skipped.length} variant(s) (stay browser-rated):`);
    for (const s of skipped) console.log(`  ${s.context}: ${s.reason}`);
  }
  if (entries.length === 0) {
    console.log('No variants with testGo found — nothing to generate yet.');
    return;
  }

  const { written, kept } = writeWorkspace(entries, { force });

  // Committed manifest so build.js (and CI, which never generates
  // practice/) knows which variants have local test workspaces.
  const manifest = {};
  for (const e of entries) {
    manifest[`m${e.modNum}_${e.challenge.id}_${e.variant.id}`] =
      `practice/module${e.modNum}/${e.challenge.id}_${e.variant.id}`;
  }
  fs.writeFileSync(
    MANIFEST_FILE,
    JSON.stringify(manifest, null, 1) + '\n'
  );
  console.log(`${path.relative(ROOT, MANIFEST_FILE)}: ${entries.length} workspaces`);
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
