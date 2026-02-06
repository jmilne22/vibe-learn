#!/usr/bin/env node
/**
 * Patch exercise variants from a YAML replacement spec.
 *
 * Works with any AI tool — Claude Code, Cursor, Copilot, Augment, etc.
 * The AI generates the spec, this script does the YAML surgery.
 *
 * Usage:
 *   node scripts/patch-exercises.js <spec.yaml>
 *
 * Spec format:
 *
 *   file: courses/go/content/exercises/module1-variants.yaml
 *   replacements:
 *     - section: warmup_1
 *       variantId: v5
 *       patch:
 *         title: New Title
 *         description: New description...
 *         hints:
 *           - "hint1"
 *           - "hint2"
 *         solution: |-
 *           fmt.Println("hello")
 *
 * For challenge variants, patch can also include:
 *   functionSignature, testCases, difficulty
 *
 * Hint formats (auto-detected from context):
 *   - Warmups:    string arrays
 *   - Challenges: objects with title + content
 *
 * Only fields present in "patch" are overwritten; others are preserved.
 * Unchanged variants keep their original formatting (no reformatting noise).
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = path.resolve(__dirname, '..');

// --- Load spec ---
const specPath = process.argv[2];
if (!specPath) {
  console.error('Usage: node scripts/patch-exercises.js <spec.yaml>');
  process.exit(1);
}

const spec = yaml.load(fs.readFileSync(path.resolve(specPath), 'utf8'));
const yamlPath = path.join(ROOT, spec.file);

if (!fs.existsSync(yamlPath)) {
  console.error(`File not found: ${yamlPath}`);
  process.exit(1);
}

// --- Load file ---
const raw = fs.readFileSync(yamlPath, 'utf8');
const doc = yaml.load(raw);
const lines = raw.split('\n');

// --- Build section lookup from parsed YAML ---
const sectionMap = {};
for (const category of ['warmups', 'challenges', 'advanced']) {
  const sections = doc.variants?.[category];
  if (!sections) continue;
  for (let i = 0; i < sections.length; i++) {
    sectionMap[sections[i].id] = { category, index: i };
  }
}

// --- Find variant block boundaries in raw text ---
function findVariantLines(sectionId, variantId) {
  // Section items: "    - id: warmup_1"  (4-space indent)
  const sectionRe = new RegExp(`^    - id: ${sectionId}\\s*$`);
  let secStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (sectionRe.test(lines[i])) { secStart = i; break; }
  }
  if (secStart === -1) return null;

  // Next section boundary
  let secEnd = lines.length;
  for (let i = secStart + 1; i < lines.length; i++) {
    if (/^    - id: /.test(lines[i])) { secEnd = i; break; }
  }

  // Variant items: "        - id: v5"  (8-space indent)
  const varRe = new RegExp(`^        - id: ${variantId}\\s*$`);
  let varStart = -1;
  for (let i = secStart; i < secEnd; i++) {
    if (varRe.test(lines[i])) { varStart = i; break; }
  }
  if (varStart === -1) return null;

  // Next variant or section end
  let varEnd = secEnd;
  for (let i = varStart + 1; i < secEnd; i++) {
    if (/^        - id: /.test(lines[i])) { varEnd = i; break; }
  }

  return { start: varStart, end: varEnd };
}

// --- Format a variant object as a YAML array item at 8-space indent ---
function formatVariant(obj) {
  const dumped = yaml.dump(obj, {
    lineWidth: 100,
    noRefs: true,
    quotingType: '"',
    forceQuotes: false,
  }).trimEnd();

  const dumpLines = dumped.split('\n');
  const out = [];
  // First line: "        - key: value"  (array item marker)
  out.push('        - ' + dumpLines[0]);
  // Remaining lines: "          key: value"  (continuation indent)
  for (let i = 1; i < dumpLines.length; i++) {
    out.push('          ' + dumpLines[i]);
  }
  return out;
}

// --- Collect and sort replacements by line position (bottom-up to avoid offset drift) ---
const patches = [];

for (const replacement of spec.replacements) {
  const { section, variantId, patch } = replacement;
  const loc = sectionMap[section];

  if (!loc) {
    console.warn(`  SKIP: section "${section}" not found`);
    continue;
  }

  // Get parsed variant and merge patch
  const sectionObj = doc.variants[loc.category][loc.index];
  const variant = sectionObj.variants.find(v => v.id === variantId);
  if (!variant) {
    console.warn(`  SKIP: variant "${variantId}" not found in "${section}"`);
    continue;
  }

  const bounds = findVariantLines(section, variantId);
  if (!bounds) {
    console.warn(`  SKIP: could not locate "${variantId}" in raw text of "${section}"`);
    continue;
  }

  // Merge patch into a copy of the variant
  const patched = { ...variant };
  for (const [key, value] of Object.entries(patch)) {
    patched[key] = value;
  }

  patches.push({
    section,
    variantId,
    title: patched.title,
    bounds,
    newLines: formatVariant(patched),
  });
}

// Sort bottom-up so line splicing doesn't shift later positions
patches.sort((a, b) => b.bounds.start - a.bounds.start);

// --- Apply patches ---
let applied = 0;
for (const p of patches) {
  lines.splice(p.bounds.start, p.bounds.end - p.bounds.start, ...p.newLines);
  console.log(`  OK: ${p.section}/${p.variantId} → "${p.title}"`);
  applied++;
}

// --- Write ---
fs.writeFileSync(yamlPath, lines.join('\n'), 'utf8');

// --- Validate round-trip ---
try {
  yaml.load(fs.readFileSync(yamlPath, 'utf8'));
  console.log(`\nDone: ${applied} patched, YAML valid ✓`);
} catch (e) {
  console.error(`\nDone: ${applied} patched, but YAML is INVALID:`);
  console.error(e.message);
  process.exit(1);
}
