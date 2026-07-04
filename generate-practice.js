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

function assembleFile(body, context, pkg) {
  const imports = inferImports(body, context);
  let src = `package ${pkg || 'exercise'}\n\n`;
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

// Top-level decl blocks with names: [{ kind: 'func'|'type', name, text }]
function declBlocks(src) {
  const lines = String(src).split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const m = line.match(/^(func|type)\s+(?:\([^)]*\)\s*)?(\w+)/);
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
  const build = spawnSync('go', ['build', '-o', bin, './autogen-tmp'], opts);
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

function autoGenWarmup(variant, context) {
  if (!variant.solution) return { error: 'no solution' };
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

  const mainCalls = cases
    .map((c) => `    fmt.Println(${goStr(CASE_SENTINEL)})\n    fmt.Println(${c})`)
    .join('\n');
  const probe = runProbe(solutionSrc + '\n\nfunc main() {\n' + mainCalls + '\n}\n', context);
  if (probe.error) return { error: probe.error };

  const parts = probe.output.split(CASE_SENTINEL + '\n').slice(1)
    .map((p) => p.replace(/\s+$/, ''));
  if (parts.length !== cases.length) return { error: 'could not split case outputs' };

  const switchCases = cases
    .map((c, i) => `    case ${i}:\n        fmt.Println(${c})`)
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
  const skipped = [];
  for (const modNum of moduleNums) {
    const file = path.join(exercisesDir, `module${modNum}-variants.yaml`);
    const parsed = yaml.load(fs.readFileSync(file, 'utf8'));
    const kinds = [
      { groups: (parsed && parsed.variants && parsed.variants.challenges) || [], kind: 'challenge' },
      { groups: (parsed && parsed.variants && parsed.variants.warmups) || [], kind: 'warmup' },
    ];
    process.stdout.write(`module${modNum}: probing solutions `);
    for (const { groups, kind } of kinds) {
      for (const challenge of groups) {
        for (const variant of challenge.variants || []) {
          const context = `module${modNum}/${challenge.id}_${variant.id}`;
          if (!variant.testGo) {
            const res = kind === 'warmup'
              ? autoGenWarmup(variant, context)
              : autoGenChallenge(challenge, variant, context);
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
  return { found, skipped };
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
    if (variant._expectedOutput) {
      readme += `\n## Expected output\n\nMake \`run()\` print exactly this:\n\n\`\`\`\n${variant._expectedOutput}\n\`\`\`\n`;
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
    fs.writeFileSync(path.join(dir, 'exercise.go'),
      assembleFile(variant._verifySolution || variant.solution, `${context} (solution)`));
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
