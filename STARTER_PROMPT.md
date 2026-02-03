# vibe-learn — Course Generator Prompt

Paste this entire file into Claude Code, Cursor, Copilot, Augment, or any AI coding tool to generate a complete course.

## Your Course Configuration

Fill these in before pasting (or tell your AI tool what you want and it will fill them in):

- **Topic:** [e.g., "Python for data science"]
- **Slug:** [e.g., "python-ds" — lowercase, alphanumeric + hyphens only]
- **Number of modules:** [e.g., 8]
- **Target audience:** [e.g., "developers who know JavaScript"]
- **Comparison language (optional):** [e.g., "JavaScript" — lessons will show side-by-side code]
- **Include algorithms section?** [yes/no]
- **Include real-world challenges?** [yes/no]

## What You're Building

vibe-learn is a static course platform. You're generating content files that the build system (`node build.js`) compiles into an interactive course site. The engine automatically provides:

- Spaced repetition (SM-2 algorithm)
- Flashcard sessions
- Daily practice with multiple modes
- Interactive exercises with hints, solutions, and self-rating
- Analytics dashboard
- Offline support via service worker

You just provide the content. Don't modify anything in `engine/` — only create files under `courses/<slug>/`.

## File Structure to Generate

```
courses/<slug>/
├── course.yaml                                    # Course metadata
├── content/
│   ├── lessons/
│   │   ├── module0.md                             # One markdown file per module
│   │   ├── module1.md
│   │   └── ...
│   ├── exercises/
│   │   ├── module1-variants.yaml                  # Exercise file per module
│   │   └── ...                                    # (skip for modules with hasExercises: false)
│   ├── flashcards/
│   │   └── flashcards.yaml                        # All flashcards in one file
│   ├── algorithms/                                # (optional)
│   │   └── algorithms.yaml
│   └── real-world-challenges/                     # (optional)
│       └── real-world-challenges.yaml
```

---

## Step 1: Generate `course.yaml`

This is the course manifest. It defines modules, tracks, projects, and annotation types.

### Full schema

```yaml
course:
  name: "Course Name"              # Display name
  slug: course-slug                 # URL slug (matches directory name convention)
  description: "One-liner."        # Shown on landing page card
  storagePrefix: course-slug       # MUST be unique — namespaces localStorage keys
  # status: null                   # Optional: "Complete", "Scaffold", "Template"
  # hidden: false                  # Optional: exclude from landing page

tracks:
  - title: Getting Started         # Track display name
    modules: [0]                   # Array of module IDs (matches array indices below)
  - title: Core Concepts
    modules: [1, 2, 3]
  # Track `id` is auto-derived as array index + 1

modules:
  - title: Quick Reference                 # REQUIRED — only `title` is required
    description: "Cheat sheet and links."  # Shown in sidebar and dashboard
    hasExercises: false                    # Opt out of exercises for this module
  - title: Variables & Types
    description: "Core data types."
    # id: auto-derived as array index (0, 1, 2, ...)
    # num: auto-derived as padded string of id
    # file: auto-derived as "module" + id (maps to content/lessons/module0.md)
    # hasExercises: defaults to true

projects: []
  # Optional. Projects are standalone pages inserted after a specific module:
  # - id: p1
  #   num: P1
  #   title: My Project
  #   file: project-myproject        # Maps to content/lessons/project-myproject.md
  #   afterModule: 3                 # Insert after module 3 in sidebar
  #   description: "Build something."

annotationTypes:
  # Define annotation types used in exercise solutions.
  # Keys are referenced by `type` field in exercise annotations.
  tip: { icon: "!", cssClass: ann-tip }
  note: { icon: i, cssClass: ann-note }
  # More examples:
  # idiom: { icon: "Go", cssClass: ann-idiom }
  # complexity: { icon: "O", cssClass: ann-complexity }
  # gotcha: { icon: "!", cssClass: ann-gotcha }
  # pattern: { icon: "P", cssClass: ann-pattern }
```

### Example: minimal course (3 modules)

```yaml
course:
  name: "Python for JS Developers"
  slug: python-js
  description: "Learn Python by comparing it to JavaScript. Side-by-side code, exercises, and flashcards."
  storagePrefix: python-js

tracks:
  - title: Foundation
    modules: [0]
  - title: Core
    modules: [1, 2]

modules:
  - title: Python Quick Reference
    description: "Commands, setup, and common patterns for quick lookup."
    hasExercises: false
  - title: Variables, Types & Functions
    description: "Python's type system and functions, mapped from JavaScript."
  - title: Control Flow & Collections
    description: "Loops, conditionals, lists, dicts — the Python way."

projects: []

annotationTypes:
  tip: { icon: "!", cssClass: ann-tip }
  note: { icon: i, cssClass: ann-note }
```

### Key rules

- Module IDs default to array index — only `title` is required per module
- `file` defaults to `"module" + id` — maps to `content/lessons/module{id}.md`
- `hasExercises` defaults to `true` — set `false` for reference/intro modules
- `storagePrefix` must be unique across all courses (use the slug)
- Track IDs default to array index + 1

---

## Step 2: Generate lesson markdown files

Each module gets one file: `content/lessons/module{id}.md`

For example, module 0 → `content/lessons/module0.md`, module 1 → `content/lessons/module1.md`.

### Supported markdown features

**Standard markdown:**
- Headings (`##`, `###`)
- Bold (`**text**`), italic (`*text*`), inline code (`` `code` ``)
- Lists (ordered and unordered)
- Tables
- Links
- Blockquotes

**Syntax-highlighted code blocks:**

````markdown
```python
def hello():
    return "world"
```
````

Use any language tag supported by highlight.js (python, javascript, go, rust, bash, json, yaml, sql, etc.).

**Side-by-side code comparisons:**

Put an italic label (`*Label*`) on its own line before a code block. Two or more consecutive labeled blocks are automatically rendered side-by-side:

````markdown
*Python*

```python
for i in range(5):
    print(i)
```

*JavaScript*

```javascript
for (let i = 0; i < 5; i++) {
    console.log(i);
}
```
````

Use this when a comparison language was specified — show concepts in both languages side-by-side.

**Callout blocks:**

```markdown
> **Tip:** This is a helpful tip.

> **Warning:** Watch out for this gotcha.

> **Note:** Additional context here.
```

### Exercise section (CRITICAL)

For every module that has exercises (`hasExercises: true` or omitted), the markdown file **MUST** end with this exact structure:

```markdown
## Exercises

### Warmups

<div id="warmups-container">
    <noscript><p class="js-required">JavaScript is required for the interactive exercises.</p></noscript>
</div>

### Challenges

<div id="challenges-container">
    <noscript><p class="js-required">JavaScript is required for the interactive exercises.</p></noscript>
</div>
```

**If these divs are missing, exercises will not render even if the YAML file exists.** The build system injects exercise JavaScript that targets these container IDs.

### Quality guidelines

- **200–350 lines** per module
- Start with practical examples, not abstract theory
- Use side-by-side comparisons if a comparison language was specified
- Include callout blocks for gotchas and tips (2–4 per module)
- Code examples should be complete and runnable
- Use `##` for major sections, `###` for subsections
- End with a brief summary section before the exercises section

### Example lesson (abbreviated)

````markdown
## Variables & Types

Python uses dynamic typing — you don't declare types, you just assign values.

```python
name = "Alice"
age = 30
scores = [95, 87, 92]
```

### Type Differences

*JavaScript*

```javascript
let name = "Alice";       // string
const age = 30;            // number (no int/float distinction)
let scores = [95, 87, 92]; // array
```

*Python*

```python
name = "Alice"        # str
age = 30              # int (distinct from float)
scores = [95, 87, 92] # list
```

> **Tip:** Python has distinct `int` and `float` types. JavaScript has only `number`.

## String Formatting

Python's f-strings work like JavaScript template literals:

*JavaScript*

```javascript
console.log(`Hello, ${name}! You are ${age}.`);
```

*Python*

```python
print(f"Hello, {name}! You are {age}.")
```

> **Warning:** f-strings require Python 3.6+. Older code uses `.format()` or `%` formatting.

## Summary

- Python is dynamically typed like JavaScript
- Use f-strings for string interpolation
- Python distinguishes `int` from `float`

## Exercises

### Warmups

<div id="warmups-container">
    <noscript><p class="js-required">JavaScript is required for the interactive exercises.</p></noscript>
</div>

### Challenges

<div id="challenges-container">
    <noscript><p class="js-required">JavaScript is required for the interactive exercises.</p></noscript>
</div>
````

---

## Step 3: Generate exercise YAML files

**File naming:** `content/exercises/module{id}-variants.yaml`

For example, module 1 → `module1-variants.yaml`, module 2 → `module2-variants.yaml`.

**Do NOT create exercise files for modules with `hasExercises: false`.**

The naming must match exactly: `module{id}-variants.yaml`. Not `module-{id}`, not `module_{id}`, not `Module{id}`.

### Full schema

```yaml
conceptLinks:
  "Concept Name": "#section-anchor"    # Maps concept names to lesson section anchors
  "Another Concept": "#another-section"
  # Keys must match the `concept` field in exercises below
  # Values should be anchor links to lesson headings (lowercase, hyphens)

sharedContent: {}
# Optional: shared code snippets referenced by exercises (rarely used)

variants:
  warmups:
    - id: warmup_1                     # Unique ID within this file
      concept: Concept Name            # Must match a key in conceptLinks
      variants:
        - id: v1                       # Variant ID (v1, v2, v3, etc.)
          title: Exercise Title
          description: >-
            What the user should do. HTML is allowed here
            (e.g., <code>example</code>, <strong>bold</strong>).
          hints:
            - "First hint — nudge in the right direction."
            - "Second hint — more specific guidance."
            - "Third hint — nearly gives the answer."
          solution: |
            # Complete, correct solution code
            x = 42
            print(x)
          annotations:               # Optional
            - type: tip               # Must match a key in course.yaml annotationTypes
              label: Display Label
              text: >-
                Explanation shown with the solution. Teaches patterns,
                gotchas, or alternative approaches.
        - id: v2
          title: Different Exercise, Same Concept
          description: A variation testing the same concept differently.
          hints:
            - "Hint for this variant."
          solution: |
            y = "hello"
            print(y)
          annotations: []
        # Add 2-4 variants per exercise group

    - id: warmup_2
      concept: Another Concept
      variants:
        - id: v1
          # ...
        - id: v2
          # ...

  challenges:
    - id: challenge_1
      concept: Concept Name
      variants:
        - id: v1
          title: Harder Exercise
          description: Combine multiple concepts.
          hints:
            - "Think about how X and Y interact."
            - "Try using X to solve for Y."
          solution: |
            # Solution combining concepts
            result = compute(data)
          annotations:
            - type: note
              label: Pattern
              text: "This is a common pattern called..."

  # advanced: []   # Optional third tier (rarely used)
```

### Key rules

- **conceptLinks** keys must exactly match concept fields in exercises
- **conceptLinks** values should be anchor links to lesson section headings (e.g., `"#variables-types"` for a `## Variables & Types` heading)
- Each exercise group has **2–4 variants** testing the same concept differently
- **Warmups:** 3–5 groups per module, beginner-friendly, one concept each
- **Challenges:** 2–3 groups per module, combine multiple concepts
- **Hints** should be progressive: think about it → specific hint → near-answer
- **Solutions** must be correct, complete, and runnable
- **Annotations** are optional but valuable (the `type` must match a key in `annotationTypes` from course.yaml)
- HTML is allowed in descriptions, hints, and annotation text (use `<code>`, `<strong>`, etc.)

### Full working example

```yaml
conceptLinks:
  Variables: "#variables-types"
  Strings: "#string-formatting"
  Lists: "#lists-and-loops"

sharedContent: {}

variants:
  warmups:
    - id: warmup_1
      concept: Variables
      variants:
        - id: v1
          title: Assign a Variable
          description: Create a variable <code>name</code> with the value <code>"Alice"</code> and print it.
          hints:
            - "Python doesn't need <code>let</code> or <code>const</code> — just assign directly."
            - "Use <code>name = \"Alice\"</code>."
          solution: |
            name = "Alice"
            print(name)
          annotations:
            - type: tip
              label: No Declaration Keyword
              text: >-
                Python has no <code>let</code>, <code>const</code>, or <code>var</code>.
                Variables are created on first assignment.
        - id: v2
          title: Multiple Assignment
          description: >-
            Assign <code>x = 10</code>, <code>y = 20</code>, and <code>z = 30</code>
            on a single line using Python's multiple assignment syntax.
          hints:
            - "Python supports: <code>a, b, c = 1, 2, 3</code>."
          solution: |
            x, y, z = 10, 20, 30
            print(x, y, z)
          annotations: []
        - id: v3
          title: Type Check
          description: >-
            Create a variable <code>price = 9.99</code> and print its type.
          hints:
            - "Use the built-in <code>type()</code> function."
          solution: |
            price = 9.99
            print(type(price))  # <class 'float'>
          annotations: []

    - id: warmup_2
      concept: Strings
      variants:
        - id: v1
          title: F-String Interpolation
          description: >-
            Given <code>name = "World"</code>, use an f-string to print
            <code>Hello, World!</code>.
          hints:
            - "F-strings use <code>f\"...{variable}...\"</code> syntax."
          solution: |
            name = "World"
            print(f"Hello, {name}!")
          annotations:
            - type: tip
              label: F-Strings
              text: "F-strings (Python 3.6+) are the preferred way to format strings. They're faster than <code>.format()</code> and more readable."
        - id: v2
          title: String Methods
          description: >-
            Given <code>text = \"hello world\"</code>, convert it to title case
            and print the result.
          hints:
            - "Python strings have a <code>.title()</code> method."
          solution: |
            text = "hello world"
            print(text.title())  # Hello World
          annotations: []

  challenges:
    - id: challenge_1
      concept: Lists
      variants:
        - id: v1
          title: Filter and Transform
          description: >-
            Given <code>numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]</code>,
            create a new list containing only the even numbers, doubled.
            Print the result.
          hints:
            - "You can use a list comprehension: <code>[expr for x in list if condition]</code>."
            - "The condition is <code>n % 2 == 0</code>, the expression is <code>n * 2</code>."
          solution: |
            numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
            result = [n * 2 for n in numbers if n % 2 == 0]
            print(result)  # [4, 8, 12, 16, 20]
          annotations:
            - type: tip
              label: List Comprehensions
              text: >-
                List comprehensions are Python's equivalent of JavaScript's
                <code>.filter().map()</code> chain, but in a single expression.
        - id: v2
          title: Count Occurrences
          description: >-
            Given <code>words = ["apple", "banana", "apple", "cherry", "banana", "apple"]</code>,
            count how many times each word appears and print the result as a dictionary.
          hints:
            - "You can loop and build a dict, or use <code>collections.Counter</code>."
            - "Manual approach: <code>counts = {}</code>, then <code>counts[word] = counts.get(word, 0) + 1</code>."
          solution: |
            words = ["apple", "banana", "apple", "cherry", "banana", "apple"]
            counts = {}
            for word in words:
                counts[word] = counts.get(word, 0) + 1
            print(counts)  # {'apple': 3, 'banana': 2, 'cherry': 1}
          annotations: []
```

---

## Step 4: Generate `flashcards.yaml`

**File:** `content/flashcards/flashcards.yaml`

All flashcards for the entire course go in this one file. Keys are module IDs as **strings**.

### Schema

```yaml
"0":                                   # Module ID as a quoted string
  - topic: Topic Name                  # Concept being tested
    q: What is the question?           # Front of card
    a: >-                              # Back of card (supports HTML)
      The answer. You can use <code>inline code</code>
      and multi-line text.
  - topic: Another Topic
    q: Another question?
    a: Another answer.

"1":
  - topic: Topic Name
    q: Question for module 1?
    a: Answer for module 1.
```

### Key rules

- Keys are module IDs as **quoted strings** (`"0"`, `"1"`, `"2"` — not bare numbers)
- **8–12 cards per module**
- Questions should test **recall**, not recognition (ask "what is X" not "is X true or false")
- Answers can include HTML (`<code>` tags are common)
- Cover the most important concepts from each module

### Example

```yaml
"0":
  - topic: Setup
    q: What command installs Python packages?
    a: >-
      <code>pip install package-name</code>. Use <code>pip3</code> on systems
      where Python 2 is the default.
  - topic: REPL
    q: How do you start the Python interactive interpreter?
    a: >-
      Run <code>python3</code> (or <code>python</code>) in your terminal.
      Type <code>exit()</code> or press Ctrl+D to quit.

"1":
  - topic: Variables
    q: How do you create a variable in Python?
    a: >-
      Just assign: <code>x = 42</code>. No <code>let</code>, <code>const</code>,
      or <code>var</code> keyword needed. The type is inferred from the value.
  - topic: F-Strings
    q: What is Python's preferred string interpolation syntax?
    a: >-
      F-strings (Python 3.6+): <code>f"Hello, {name}!"</code>.
      Similar to JavaScript template literals but uses <code>f"..."</code>
      instead of backticks.
  - topic: Type Checking
    q: How do you check the type of a value in Python?
    a: >-
      Use <code>type(value)</code> to get the type, or
      <code>isinstance(value, int)</code> to check against a specific type.
```

---

## Step 5 (optional): Generate `algorithms.yaml`

**File:** `content/algorithms/algorithms.yaml`

Only generate this if the user requested an algorithms section.

### Schema

```yaml
categories:
  - id: category-slug               # Unique slug
    name: Category Name              # Display name
    icon: "#"                        # Single character or emoji
    order: 1                         # Sort order in UI
    description: "One-liner"         # Category description
    problems:
      - id: problem-slug             # Unique within category
        name: Problem Name
        concept: "Concept Being Tested"  # Used by analytics
        difficulty: 2                    # 1-5 scale
        docLinks:                        # Optional: reference links
          - url: https://example.com
            title: "Doc Title"
            note: "Why this link is useful"
        patternPrimer:                   # Optional: educational context
          bruteForce: "Naive approach description - O(n^2)"
          bestApproach: "Optimal approach - O(n)"
          typical: "Common solution pattern"
        variants:
          - id: v1
            title: Variant Title
            difficulty: 1
            description: "Problem statement."
            hints:
              - "Progressive hint 1"
              - "Progressive hint 2"
              - "Progressive hint 3"
            solution: |
              # Complete solution code
              func solve(input []int) int {
                  // ...
              }
            testCases: |
              fmt.Println(solve([]int{1, 2, 3}))  // expected output
          - id: v2
            title: Harder Variant
            difficulty: 2
            description: "Harder version."
            hints: [...]
            solution: |
              // ...
            testCases: |
              // ...
```

### Key rules

- Group related problems into categories (e.g., "Arrays & Hashing", "Two Pointers")
- Each problem has 2–3 variants of increasing difficulty
- Solutions must be complete and correct
- Test cases should show expected output
- `concept` values are used by the analytics dashboard for weakness tracking

---

## Step 6 (optional): Generate `real-world-challenges.yaml`

**File:** `content/real-world-challenges/real-world-challenges.yaml`

Only generate this if the user requested real-world challenges.

### Schema

```yaml
challenges:
  - id: challenge-slug                 # Unique ID
    title: "Challenge Title"
    difficulty: 2                      # 1-5 scale
    companies: [Company1, Company2]    # Company tags
    concepts: [REST, JSON, HTTP]       # Concept tags
    source: "Where this problem comes from"
    sourceUrl: "https://example.com"   # Optional
    requirements: |                    # Rendered as markdown at build time
      Build a thing that does stuff.

      Requirements:

      - **Feature 1** — description
      - **Feature 2** — description

      Use markdown freely here — it's converted to HTML during the build.
    acceptanceCriteria:                # Rendered as interactive checkboxes
      - "It does X correctly"
      - "It handles Y edge case"
      - "Error responses use proper status codes"
    hints:
      - title: "Getting started"
        content: |                     # Rendered as markdown at build time
          Think about the architecture first.
          Use a simple approach to start.
      - title: "Key pattern"
        content: |
          Consider using the strategy pattern for...
    extensions:                        # Stretch goals
      - "Add pagination support"
      - "Add caching with Redis"
```

### Key rules

- `requirements` and `hints[].content` are **rendered as markdown** at build time (use markdown formatting freely)
- `acceptanceCriteria` items become interactive checkboxes in the UI (progress saved to localStorage)
- Include 3–6 challenges of varying difficulty
- Tag with realistic companies and concepts

---

## Generation Process

Follow this order:

1. **First, generate `course.yaml`** and show it for approval
2. **Then generate each module's content one at a time:**
   a. Lesson markdown (`content/lessons/module{id}.md`)
   b. Exercise YAML (`content/exercises/module{id}-variants.yaml`) — skip if `hasExercises: false`
   c. Flashcard entries for that module (accumulate for the final file)
3. **After all modules, write `content/flashcards/flashcards.yaml`** with all accumulated flashcards
4. **Generate optional content** (algorithms, challenges) if requested

## Verification Checklist

Before finishing, verify:

- [ ] Every module in course.yaml has a corresponding `.md` file in `content/lessons/`
- [ ] Every module with `hasExercises: true` (or omitted) has a `module{id}-variants.yaml` file in `content/exercises/`
- [ ] Exercise files use exact naming: `module{id}-variants.yaml` (not `module-{id}` or `module_{id}`)
- [ ] Lesson markdown for exercise modules ends with the `warmups-container` and `challenges-container` divs
- [ ] Flashcard keys are module IDs as **quoted strings** (`"0"`, `"1"`, not bare numbers)
- [ ] All `conceptLinks` values are valid anchor IDs matching headings in the lesson
- [ ] `storagePrefix` in course.yaml is unique
- [ ] Annotation `type` values used in exercises match keys defined in `annotationTypes` in course.yaml
- [ ] The `content/flashcards/` directory exists with `flashcards.yaml`
- [ ] The `content/exercises/` directory exists (even if some modules have no exercises)
- [ ] Side-by-side comparisons use `*Label*` on its own line before each code block

## Build & Run

Once all content is generated, tell the user how to build and preview the course. Use the actual slug from course.yaml:

```bash
npm run build              # or: node build.js {slug}
cd dist && python3 -m http.server 8000
```

Then open `http://localhost:8000/{slug}/` to preview the course (substitute the real slug).
