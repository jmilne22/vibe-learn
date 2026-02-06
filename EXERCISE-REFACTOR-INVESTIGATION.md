# Investigation: Token-Efficient Exercise Refactoring

## Problem

Refactoring ~60 exercise variants in Module 1 consumed a large number of tokens because each variant was edited individually via inline AI edits. Each edit required reading context, matching old strings, and writing new content — multiplied across 60 variants, this adds up fast. This applies to any AI coding tool (Claude Code, Cursor, Copilot, Augment, etc.).

## Codebase Findings

1. **Exercise YAML schema** is consistent across all courses — two variant types:
   - **Warmups**: `id`, `title`, `description`, `hints` (string array), `solution`
   - **Challenges**: `id`, `title`, `description`, `functionSignature`, `testCases`, `hints` (objects with `title`/`content`), `solution`, `difficulty`

2. **`js-yaml`** is already a project dependency (used in `build.js` and `course-builder.js`)

3. **Course Builder REST API** (`course-builder.js` at port 3456) already supports:
   - `GET /api/courses/:slug/exercises/:moduleId` → returns parsed YAML
   - `PUT /api/courses/:slug/exercises/:moduleId` → accepts `{ raw: yamlString }` or `{ data: parsedObject }`

4. **No schema validation** exists beyond YAML syntax — the build just parses and dumps to JSON

5. **Build verification** is trivial: `node build.js go` catches any YAML errors

---

## Options

### Option A: "Replacement Spec" Script
**Confidence: 90%** | Estimated token savings: **~85%**

Write a one-off Node.js script that takes a JSON/YAML "replacement spec" as input and patches the exercise file programmatically.

**How it works:**
1. Your AI tool generates a JSON spec file with the replacements (compact, no surrounding YAML boilerplate):
   ```json
   {
     "file": "courses/go/content/exercises/module1-variants.yaml",
     "replacements": [
       {
         "section": "warmup_1",
         "variantId": "v5",
         "patch": {
           "title": "Reindeer Roll Call",
           "description": "Write a program that prints each reindeer...",
           "hints": ["Create a slice...", "Use index+1..."],
           "solution": "reindeer := []string{...}\nfor i, name := range reindeer {\n    fmt.Printf(\"%d. %s\\n\", i+1, name)\n}"
         }
       }
     ]
   }
   ```
2. A script (`scripts/patch-exercises.js`) reads the spec, loads the YAML, locates each variant by section+id, merges the patch fields, and writes the file back.

**Pros:**
- The AI only generates the replacement *content* (the creative part), not the structural YAML boilerplate
- Script handles YAML serialization, indentation, quoting — no risk of YAML syntax errors from edits
- Replacement spec is ~40% the size of the full YAML edits
- Script is reusable across any course/module
- One `Write` call for the spec + one `Bash` call to run = 2 tool calls vs ~60 `Edit` calls

**Cons:**
- Requires writing and testing the script once (~100 lines)
- JSON spec still needs to be generated correctly (but it's simpler than YAML)

**Implementation sketch:**
```
scripts/patch-exercises.js  (~100 lines)
├── Read YAML file with js-yaml
├── For each replacement in spec:
│   ├── Find section by key (e.g., "warmup_1")
│   ├── Find variant by id within section
│   └── Merge patch fields over existing variant
└── Write patched YAML back to file
```

---

### Option B: AI Generates Complete Replacement YAML, Script Swaps Sections
**Confidence: 85%** | Estimated token savings: **~70%**

Instead of editing individual variants, the AI writes complete replacement section blocks (e.g., all 13 variants of `warmup_1` at once) into a temporary file. A script then swaps the entire section in the main file.

**How it works:**
1. Your AI tool writes a temp file with just the sections that need changes (full YAML for those sections only)
2. A merge script replaces matching sections in the master file

**Pros:**
- The AI can generate variants in natural YAML without worrying about edit-matching
- Fewer tool calls (one `Write` per section group instead of per variant)
- No JSON↔YAML translation issues

**Cons:**
- The AI still generates full YAML for unchanged variants within a section (wastes some tokens)
- More output tokens than Option A since it includes unchanged variants
- Section-level granularity means less precise control

---

### Option C: Use the Existing Course Builder API
**Confidence: 70%** | Estimated token savings: **~60%**

Use the already-built course builder's REST API to read/write exercises programmatically.

**How it works:**
1. Start the builder: `npm run builder`
2. Your AI tool reads current exercises via `GET /api/courses/go/exercises/1`
3. Your AI tool modifies the JSON in memory and writes back via `PUT`

**Pros:**
- Zero new code — uses existing infrastructure
- API handles YAML serialization/deserialization

**Cons:**
- Requires the builder server to be running during the session
- API operates on entire module files (no section-level granularity)
- The full JSON round-trip through the AI's context is expensive
- Network calls add latency and potential failure points
- Still requires the AI to generate all the replacement content

---

### Option D: External LLM Script (Outside AI Coding Tool)
**Confidence: 75%** | Estimated token savings: **~95%**

Write a standalone script that calls an LLM API directly with a focused prompt to generate exercise replacements, then patches the file.

**How it works:**
1. A Node.js script reads the current YAML
2. For each variant to replace, it sends a focused API call with just the variant context + replacement instructions
3. Parses the response and patches the file
4. Runs `node build.js go` to verify

**Pros:**
- Maximum token efficiency — each API call only has the context it needs
- No AI coding tool overhead (tool calls, conversation history, etc.)
- Can be run independently, parallelized, retried on failure
- Reusable across courses
- Works with any LLM API (Anthropic, OpenAI, etc.)

**Cons:**
- Requires API key setup
- More complex to build and debug (~200 lines)
- Loses the interactive review loop — harder to catch quality issues
- Prompt engineering needed to match exact schema

---

### Option E: Hybrid — Plan in AI Tool, Execute via Script
**Confidence: 92%** | Estimated token savings: **~80%**

Use your AI coding tool (Claude Code, Cursor, Copilot, Augment, etc.) for the *creative planning* phase (deciding what replaces what), then execute bulk changes via a script.

**How it works:**
1. AI tool generates a **plan file** (like the existing `COURSE-IMPORT-PLAN.md`) with a replacement table
2. AI tool writes a compact **replacement spec** (JSON) based on the plan
3. AI tool runs a **patch script** that applies the spec to the YAML file
4. AI tool runs `node build.js go` to verify

This is essentially Option A but emphasizes the workflow split: planning (where AI tools excel) vs. bulk execution (where scripts excel).

**Pros:**
- Plays to AI tools' strengths (creative decisions, code review)
- Avoids their weakness (repetitive bulk edits that burn tokens)
- The plan file serves as documentation
- The spec file is auditable before execution
- The patch script is reusable
- Works identically across Claude Code, Cursor, Copilot, Augment, or any AI tool

**Cons:**
- Still requires the one-time script investment

---

## Recommendation

**Option E (Hybrid)** is the best overall approach. Confidence: **92%**.

The token waste in the current workflow comes from *execution*, not *planning*. AI tools are great at deciding "replace Fibonacci with Reindeer Roll Call" but inefficient at making 60 individual YAML edits one-by-one. A patch script eliminates the execution overhead while keeping your AI tool in the loop for quality control.

This approach works with **any AI coding tool** — Claude Code, Cursor, Copilot, Augment, or even a plain chat LLM. The AI just needs to output a JSON spec file; the script does the rest.

**Status:** `scripts/patch-exercises.js` is built and tested. It does targeted YAML surgery — only patched variants are reformatted, everything else stays untouched (clean diffs).

### Quick Comparison

| Option | Confidence | Token Savings | New Code | Reusable | Complexity |
|--------|-----------|---------------|----------|----------|------------|
| A: Replacement Spec Script | 90% | ~85% | ~100 lines | Yes | Low |
| B: Section Swap | 85% | ~70% | ~80 lines | Yes | Low |
| C: Builder API | 70% | ~60% | 0 lines | Yes | Low |
| D: External LLM API Script | 75% | ~95% | ~200 lines | Yes | Medium |
| **E: Hybrid (Recommended)** | **92%** | **~80%** | **~100 lines** | **Yes** | **Low** |
