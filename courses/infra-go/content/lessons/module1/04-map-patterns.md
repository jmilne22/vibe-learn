## Map Patterns

> *"Clear is better than clever."* — Go Proverb

A map is a lookup table — think of it like a dictionary. You look up a word (the key) and get back a definition (the value). If the word isn't in the dictionary, you get back a zero value, not an error. That's why you'll need the comma-ok pattern below: to tell "this key maps to zero" apart from "this key doesn't exist."

Maps are your most-used data structure after slices. Counting, grouping, lookup tables, caches.

### Create & Access

```go
// Literal
scores := map[string]int{
    "Alice": 95,
    "Bob":   0,
    "Carol": 78,
}

// make
studentsByClass := make(map[string][]string)

// Access — returns zero value if key is missing
score := scores["Alice"] // 95
score := scores["Dave"]  // 0 — but did Dave score 0, or is he missing?

// Comma-ok pattern: tells you whether the key actually exists
score, ok := scores["Bob"]  // 0, true  (Bob scored 0)
score, ok := scores["Dave"] // 0, false (Dave isn't in the map)
if !ok {
    fmt.Println("key not found")
}
```

> **When to use comma-ok:** Whenever the zero value is a valid value. For `map[string]int`, 0 could be a real score. For `map[string]string`, empty string could be a real value. When in doubt, use comma-ok.

### Counting

The single most common map pattern:

```go
// Count how many of each fruit
counts := make(map[string]int)
for _, fruit := range basket {
    counts[fruit]++  // zero value of int is 0, so this just works
}
```

### Grouping

```go
// Group students by grade level (struct slice version)
byGrade := make(map[string][]string)
for _, s := range students {
    byGrade[s.Grade] = append(byGrade[s.Grade], s.Name)
}

// Parallel slice version — names[i] goes with subjects[i]
names := []string{"Alice", "Bob", "Carol", "Dave"}
subjects := []string{"math", "math", "science", "science"}

grouped := make(map[string][]string)
for i, subj := range subjects {
    grouped[subj] = append(grouped[subj], names[i])
}
// grouped = map[math:[Alice Bob] science:[Carol Dave]]
```

### Map as Set

Go has no set type. Use `map[string]bool`:

```go
// Track which words you've already seen
seen := make(map[string]bool)
for _, word := range words {
    seen[word] = true
}

// Check membership
if seen["hello"] {
    fmt.Println("already encountered this word")
}
```

### Merge Two Maps

Say you have base settings for a game character (`health: 100`, `speed: 5`, `armor: 10`) and a power-up that changes some of them (`speed: 8`, `armor: 20`). The final stats should use the power-up values where they exist, and the base values everywhere else.

Maps don't have a merge method. You build it: create a new map, copy one in, then copy the other. Whichever you copy second wins on conflicts:

```go
base := map[string]int{"health": 100, "speed": 5, "armor": 10}
powerUp := map[string]int{"speed": 8, "armor": 20}

merged := make(map[string]int)
for k, v := range base {
    merged[k] = v            // copy all base stats
}
for k, v := range powerUp {
    merged[k] = v            // overwrite with power-up values (second write wins)
}
// merged = map[armor:20 health:100 speed:8]
```

Order matters. If you copied `powerUp` first and `base` second, the base values would win — the opposite of what you want.

### Nested Maps

When you need two levels of lookup (like INI file sections → keys → values):

```go
config := make(map[string]map[string]string)

// DANGER: the inner map doesn't exist yet
// config["database"]["host"] = "localhost"  // PANIC — nil map write

// Initialize the inner map before writing to it
section := "database"
if config[section] == nil {
    config[section] = make(map[string]string)
}
config[section]["host"] = "localhost"
config[section]["port"] = "5432"
```

Always check if the inner map is nil before writing. The compiler won't catch this — it compiles fine and panics at runtime, which is exactly the kind of bug that shows up in production at 2am because your test data only had one section. This "lazy initialization" pattern avoids pre-creating maps for every possible key.

### Delete

```go
delete(studentsByClass, "art")  // remove key. No-op if key doesn't exist.
```

### Iteration Order is Random

```go
// This prints in a DIFFERENT order every run
for k, v := range m {
    fmt.Println(k, v)
}
```

Go randomizes map iteration order on purpose — so you don't accidentally depend on it. Yes, they did this intentionally. Yes, it's annoying the first time you write a test that passes one run and fails the next. And yes, you'll eventually appreciate it — because that flaky test just saved you from a production bug where "it worked on my machine" because the map happened to iterate in the order you expected.

If you need deterministic output (sorted keys), you have to sort yourself:

1. Collect the keys into a slice (loop over the map, append each key)
2. Sort the slice (`sort.Strings` for string keys)
3. Loop the sorted slice, look up each value from the map

```go
keys := make([]string, 0, len(m))
for k := range m {
    keys = append(keys, k)
}
sort.Strings(keys)
for _, k := range keys {
    fmt.Println(k, m[k])
}
```

This is verbose compared to Python's `for k in sorted(d)`, but there's no shortcut. You'll use this pattern whenever test output needs to be deterministic.

<div class="inline-exercises" data-concept="Map Patterns"></div>

### Checkpoint: Slices + Maps Together

Before moving on, here's a taste of how slices and maps combine. Given a list of pod statuses, produce a summary: how many pods in each state, sorted alphabetically.

```go
statuses := []string{"Running", "Failed", "Running", "Pending", "Running", "Failed"}

// Step 1: count with a map
counts := make(map[string]int)
for _, s := range statuses {
    counts[s]++
}

// Step 2: sorted keys (because map iteration is random)
keys := make([]string, 0, len(counts))
for k := range counts {
    keys = append(keys, k)
}
sort.Strings(keys)

// Step 3: format
for _, k := range keys {
    fmt.Printf("  %-10s %d\n", k, counts[k])
}
// Output:
//   Failed     2
//   Pending    1
//   Running    3
```

Three patterns you already know — counting, sorted key iteration, formatted output — combined into something useful. The full "Putting It Together" at the end of this module builds on this same idea, just with string parsing added.
