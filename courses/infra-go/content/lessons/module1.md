Picture this: you're on-call and a dashboard alert fires — "Pod memory exceeding threshold on 3 nodes." You need to pull the pod list, group them by node, find the top memory consumers, and format a report for the incident channel. That's slices, maps, string parsing, and sorting — the four tools this module drills until they're automatic.

Every exercise uses infrastructure data: log lines, metric labels, pod specs, config entries. Every function and pattern used in the exercises is taught in this lesson first. If an exercise feels impossible, the gap is here — come back and re-read the relevant section.

---

## Go Syntax You'll Use

<details>
<summary>Reference: loops, functions, printing, type conversions, builtins — expand when you need it</summary>

### For Loops

Go has one loop keyword: `for`. It does everything.

```go
// Range loop — iterate over a slice (like Python's "for x in list")
for i, name := range servers {
    fmt.Println(i, name)  // i is the index, name is the value
}

// Ignore the index with _
for _, name := range servers {
    fmt.Println(name)
}

// Ignore the value — just need the index
for i := range servers {
    fmt.Println(i)
}
```

```go
// C-style loop — when you need to count or step
for i := 0; i < 10; i++ {
    fmt.Println(i)  // 0, 1, 2, ..., 9
}

// Counting from 1
for i := 1; i <= 5; i++ {
    fmt.Println(fmt.Sprintf("node-%d", i))  // node-1, node-2, ..., node-5
}
```

The three parts of a C-style loop are: `init; condition; post`. You can put anything in the `post` part — it doesn't have to be `i++`. This is how you control the step size, which you'll need for batching (covered in its own section below).

```go
// Multi-variable form — used for two-pointer patterns
for i, j := 0, len(s)-1; i < j; i, j = i+1, j-1 {
    s[i], s[j] = s[j], s[i]  // reverse in place
}
```

**`continue` and `break`:**

```go
for _, line := range lines {
    if line == "" {
        continue  // skip this iteration, go to next line
    }
    if line == "STOP" {
        break  // exit the entire loop
    }
    fmt.Println(line)
}
```

### Functions

```go
// Basic function — takes a string, returns a string
func greet(name string) string {
    return "hello " + name
}

// Multiple parameters of the same type — shorthand
func add(a, b int) int {
    return a + b
}

// Multiple return values — very common in Go
func parseLabel(s string) (string, string) {
    i := strings.Index(s, "=")
    if i < 0 {
        return s, ""
    }
    return s[:i], s[i+1:]
}

key, val := parseLabel("app=nginx")
// key = "app", val = "nginx"
```

**The (value, error) pattern** — you'll see this everywhere in Go. Functions that can fail return the result and an error. If the error is nil, it worked.

```go
func parsePort(s string) (int, error) {
    n, err := strconv.Atoi(s)
    if err != nil {
        return 0, fmt.Errorf("invalid port: %s", s)
    }
    if n < 1 || n > 65535 {
        return 0, fmt.Errorf("port out of range: %d", n)
    }
    return n, nil
}

port, err := parsePort("8080")
if err != nil {
    log.Fatal(err)  // handle the error
}
fmt.Println(port)  // 8080
```

`fmt.Errorf` creates an error value with a formatted message. `nil` means "no error."

### Printing and Format Verbs

```go
fmt.Println("hello")           // print with newline — quick debugging
fmt.Println(42, "pods", true)  // prints: 42 pods true

// Printf — formatted output (no automatic newline, add \n yourself)
fmt.Printf("count: %d\n", 42)           // %d = integer
fmt.Printf("name: %s\n", "web-1")       // %s = string
fmt.Printf("value: %v\n", anyThing)     // %v = default format (works for anything)
fmt.Printf("quoted: %q\n", "hello")     // %q = quoted string
fmt.Printf("bool: %t\n", true)          // %t = boolean

// Float formatting
fmt.Printf("rate: %f\n", 3.14159)       // %f  = 3.141590 (default 6 decimal places)
fmt.Printf("rate: %.1f\n", 3.14159)     // %.1f = 3.1 (1 decimal place)
fmt.Printf("rate: %.2f\n", 3.14159)     // %.2f = 3.14 (2 decimal places)

// Width and alignment
fmt.Printf("%-12s %6d\n", "web-1", 512) // %-12s = left-aligned, 12 chars wide
                                         // %6d = right-aligned, 6 chars wide
// Output: "web-1           512"

// Literal percent sign
fmt.Printf("%.1f%%\n", 42.7)            // %% prints a literal %. Output: "42.7%"

// Sprintf — same format verbs, but returns a string instead of printing
msg := fmt.Sprintf("pod %s: %dMB", "web-1", 512)
// msg = "pod web-1: 512MB"
```

### Type Conversions

Go never converts types implicitly. You must be explicit:

```go
x := 42              // int
f := float64(x)      // int → float64
y := int(3.7)        // float64 → int (truncates to 3, does NOT round)

// Percentage calculation — must convert to float64 first
errors := 3
total := 8
pct := float64(errors) / float64(total) * 100  // 37.5
```

**Rounding floats:**

```go
import "math"

// Round to 1 decimal place
rate := 33.333333
rounded := math.Round(rate*10) / 10  // 33.3

// Round to 2 decimal places
rounded2 := math.Round(rate*100) / 100  // 33.33
```

**String ↔ number conversions:**

```go
import "strconv"

// String → int
n, err := strconv.Atoi("42")        // n = 42, err = nil
n, err := strconv.Atoi("nope")      // n = 0, err = error

// String → float
f, err := strconv.ParseFloat("3.14", 64)  // f = 3.14, err = nil

// Int → string
s := strconv.Itoa(42)               // s = "42"
```

### Builtins: len, cap, copy

```go
s := []string{"a", "b", "c"}
len(s)   // 3 — number of elements
cap(s)   // capacity — how many elements before the backing array needs to grow

// copy(dst, src) — copies elements from src into dst. Returns count copied.
src := []int{1, 2, 3, 4, 5}
dst := make([]int, 3)
copy(dst, src)      // dst = [1, 2, 3] — copied first 3 elements

// Shift elements right (used for insert-at-index):
s = append(s, "")         // grow by one
copy(s[2+1:], s[2:])      // shift elements at index 2+ one position right
s[2] = "inserted"          // write into the gap
```

</details>

### Range Gotchas

Three things that will bite you if you don't know them:

**Range gives you a copy.** The `v` in `for _, v := range nums` is a *copy* of the element. Mutating it does nothing to the slice:

```go
nums := []int{1, 2, 3}
for _, v := range nums {
    v = v * 10  // modifies the copy, not the slice
}
fmt.Println(nums) // [1 2 3] — unchanged!

// Fix: use the index to modify in place
for i := range nums {
    nums[i] = nums[i] * 10
}
fmt.Println(nums) // [10 20 30]
```

**Range locks the length at loop start.** If you `append` during a `range` loop, the new elements won't be visited — the iteration count was set when the loop began:

```go
nums := []int{1, 2, 3}
for i := range nums {
    if nums[i] == 2 {
        nums = append(nums, 99)
    }
}
fmt.Println(nums) // [1 2 3 99] — 99 was added but never iterated
fmt.Println(len(nums)) // 4 — but range only ran 3 times
```

**Use `for i := range` when you need to mutate.** If you need to change elements, use the index form. If you just need to read them, `for _, v := range` is fine.

---

## Slice Operations Under Pressure

> *"Make the zero value useful."* — Go Proverb

A slice is a view over an array: pointer, length, capacity. Think of it like a window over a bookshelf — the pointer says which shelf, the length says how many books are visible through the window, and the capacity says how many the shelf can hold before you need a bigger one. What you need to drill is *using* slices without thinking.

*Quick reference*

```go
fruits := []string{"apple", "banana", "cherry", "date", "elderberry"}

fruits[0]             // "apple" — access by index
fruits[len(fruits)-1] // "elderberry" — last element
fruits[1:3]           // ["banana", "cherry"] — slice expression (start inclusive, end exclusive)
fruits[:3]            // ["apple", "banana", "cherry"] — first three
fruits[2:]            // ["cherry", "date", "elderberry"] — everything from index 2 onward
fruits[len(fruits)-2:]// ["date", "elderberry"] — last two
```

*Python comparison*

```python
# Python: s[-1] gets last element
# Go: no negative indexing. Use s[len(s)-1]

# Python: s[1:3] — same semantics
# Go: s[1:3] — identical behavior
```

> **Gotcha:** Accessing `s[len(s)]` panics with "index out of range." Off-by-one errors are the #1 slice bug. When in doubt, print `len(s)` first.

### Append & Grow

Spot the bug:

```go
pods := []string{"web-1"}
append(pods, "web-2")       // add a pod...
fmt.Println(pods)            // ["web-1"] — where did web-2 go?
```

`append` doesn't modify the original — it returns a *new* slice. If you throw away the return value, you throw away the data. The fix is one character:

```go
pods = append(pods, "web-2")  // reassign!
```

This is the single most common slice bug in Go. Now the correct patterns:

```go
var pods []string                      // nil slice, length 0
pods = append(pods, "web-1")           // [web-1]
pods = append(pods, "web-2", "web-3")  // [web-1, web-2, web-3]

// Append another slice with ...
more := []string{"db-1", "db-2"}
pods = append(pods, more...)           // [web-1, web-2, web-3, db-1, db-2]
```

> **Key insight:** `append` may return a *new* underlying array if capacity is exceeded. Always reassign: `s = append(s, item)`. The compiler won't warn you if you forget — the code runs fine and silently loses data.

**Building a slice in a loop:**

```go
// Build "step-1" through "step-4"
var steps []string
for i := 1; i <= 4; i++ {
    steps = append(steps, fmt.Sprintf("step-%d", i))
}
fmt.Printf("len=%d cap=%d %v\n", len(steps), cap(steps), steps)
// len=4 cap=4 [step-1 step-2 step-3 step-4]
// (cap may vary — Go doubles capacity as needed)
```

### Pre-allocation with make

When you know the size upfront, pre-allocate. When your monitoring tool processes 50,000 metrics per scrape, the difference between "grow the backing array 17 times" and "one allocation" is the difference between a smooth scrape and a GC pause that trips your own alerts.

```go
// Bad: grows the backing array multiple times
var results []string
for _, name := range names {
    results = append(results, name)
}

// Good: one allocation
results := make([]string, 0, len(names))  // length 0, capacity len(names)
for _, name := range names {
    results = append(results, name)
}

// Also good: make with length, then assign by index
results := make([]string, len(names))  // length AND capacity = len(names)
for i, name := range names {
    results[i] = name
}
```

`make([]string, 0, 5)` = length 0, capacity 5 (append to fill). `make([]string, 5)` = length 5, capacity 5 (assign by index).

*Python comparison*

```python
# Python: results = [name for name in names]  — list comprehension
# Go: no comprehensions. Loop and append. Pre-allocate with make().
```

### Batching (Processing in Chunks)

You have 10 items and need to process them in batches of 4. That means groups: `[0:4]`, `[4:8]`, `[8:10]`. How do you loop that?

Start from what you know — a C-style loop counts up by 1:

```go
for i := 0; i < len(items); i++ { ... }
//  i goes: 0, 1, 2, ..., 9
```

But you don't want every index — you want the *start* of each batch. Those are 0, 4, 8. The step isn't 1, it's `batchSize`. The `post` part of a C-style loop can be anything, so change `i++` to `i += batchSize`:

```go
for i := 0; i < len(items); i += batchSize { ... }
//  i goes: 0, 4, 8
```

Now each `i` is the start of a batch. The end is `i + batchSize`. So the batch is `items[i : i+batchSize]` — except there's a problem. When `i=8` and `batchSize=4`, `i+batchSize=12`, which is past the end of a 10-element slice. Go will panic with "index out of range."

The fix: cap the end index so it never exceeds `len(items)`:

```go
end := i + batchSize
if end > len(items) {
    end = len(items)
}
// Now items[i:end] is always safe
```

That's the whole pattern. You derive it from three ideas: (1) C-style loops can step by any amount, (2) each step is the start of a batch, and (3) the last batch might be short so you clamp the end.

### Finding Min / Max

Go has no `min()`/`max()` for slices. You build it from a loop.

The question is: what do you initialize min and max to? If you start with `min := 0`, you'll get 0 as the minimum for any slice of positive numbers — that's wrong. If you start with `min := 999999`, you're guessing at an upper bound — also wrong.

The safe answer: initialize both to the first element. Now min and max are already correct for a 1-element slice, and you just need to scan the rest:

```go
min, max := prices[0], prices[0]
for _, p := range prices[1:] {   // start from index 1 — [0] is already covered
    if p < min {
        min = p
    }
    if p > max {
        max = p
    }
}
```

One pass, two comparisons per element. `prices[1:]` skips the first element since it's already accounted for. This works for any comparable type — ints, floats, strings.

<div class="inline-exercises" data-concept="Slice Operations"></div>

## In-Place Manipulation

> *"Don't communicate by sharing memory, share memory by communicating."* — Go Proverb

Sometimes you can't afford a copy. Modify a slice without creating a new one.

### Swap Two Elements

Go's simultaneous assignment makes swapping trivial — no temp variable needed:

```go
colors := []string{"red", "green", "blue", "yellow"}
colors[0], colors[3] = colors[3], colors[0]
// Before: [red green blue yellow]
// After:  [yellow green blue red]
```

The general form is `s[i], s[j] = s[j], s[i]`. Both sides are evaluated before any assignment happens, so neither value is lost.

### Reverse In Place

Think about what reversing means: the first element swaps with the last, the second with the second-to-last, and so on. You need two positions — one starting at the front, one at the back — walking toward each other. When they meet in the middle, you're done.

```go
letters := []string{"a", "b", "c", "d", "e"}

left := 0
right := len(letters) - 1
for left < right {
    letters[left], letters[right] = letters[right], letters[left]
    left++
    right--
}
// Before: [a b c d e]
// After:  [e d c b a]
```

`left` starts at 0, `right` starts at the last index. Each step: swap them, move both inward. Stop when they've met or crossed.

Go also supports a compact multi-variable form that does the same thing:

```go
for i, j := 0, len(s)-1; i < j; i, j = i+1, j-1 {
    s[i], s[j] = s[j], s[i]
}
```

The simultaneous assignment `i, j = i+1, j-1` updates both in one statement. Use whichever form you find easier to read.

### Remove at Index (Preserving Order)

You want to remove an element and keep everything else in the same order. Think of it as: take everything before the index, then everything after, and join them.

```go
items := []string{"a", "b", "c", "d", "e"}
i := 2 // remove "c"
items = append(items[:i], items[i+1:]...)
// Before: [a b c d e]
// After:  [a b d e]
```

`items[:2]` is `["a", "b"]`. `items[3:]` is `["d", "e"]`. `append` joins them, shifting the later elements left to fill the gap. The `...` unpacks the second slice so append can accept it.

### Remove at Index (Fast, Order Doesn't Matter)

If you don't care about order, there's an O(1) trick: copy the last element into the gap, then shrink:

```go
items := []string{"a", "b", "c", "d", "e"}
i := 1 // remove "b"
items[i] = items[len(items)-1]  // overwrite "b" with "e" (the last element)
items = items[:len(items)-1]     // shrink by one
// Before: [a b c d e]
// After:  [a e c d]
```

Only two operations regardless of slice size. Use this when order doesn't matter — like removing a terminated pod from a running list.

### Filter In Place

Say you have 10,000 items and need to keep only the ones that match a condition. You could create a new slice and copy matches into it — that works, but doubles memory usage. When memory is already tight, that matters.

The naive approach — looping and deleting non-matches — shifts elements every deletion (O(n²)). The efficient way uses a separate write position.

The idea: read through every element, but only write the ones you want to keep. You need two positions — a "read" position (the loop variable) and a "write" position (`n`). They start together, but `n` only advances when you keep an element:

```go
words := []string{"keep", "drop", "keep", "drop", "keep"}

n := 0                          // write position
for _, w := range words {       // read position (implicit)
    if w == "keep" {
        words[n] = w            // write keeper to position n
        n++                     // advance write position
    }
    // non-matches: read advances, write stays — element gets overwritten later
}
words = words[:n]               // shrink to only the kept elements
// Before: [keep drop keep drop keep]
// After:  [keep keep keep]
```

After the loop, everything before index `n` is a keeper. Everything at `n` and beyond is garbage. `words[:n]` slices it to just the good part.

**Parallel slice version** — same idea, but you use the index `i` to look up the corresponding element in another slice:

```go
fruits := []string{"apple", "banana", "cherry", "date"}
fresh := []bool{true, false, true, true}

n := 0
for i, ok := range fresh {
    if ok {
        fruits[n] = fruits[i]   // use i to index into the parallel slice
        n++
    }
}
fruits = fruits[:n]
// fruits = ["apple", "cherry", "date"]
```

The difference: with a single slice you iterate it directly (`for _, w`). With parallel slices you need the index (`for i, ok`) so you can reach into the other slice.

*Python comparison*

```python
# Python: filtered = [x for x in items if condition(x)]
# Go: no filter builtin. The write-index loop above IS the Go way.
```

<div class="inline-exercises" data-concept="In-Place Manipulation"></div>

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

// Access (zero value if missing)
score := scores["Alice"]    // 95
score := scores["Dave"]     // 0 (zero value for int — but did Dave score 0, or is he missing?)

// Comma-ok pattern: distinguish "exists with zero value" from "missing"
score, ok := scores["Bob"]    // score = 0, ok = true  (Bob scored 0)
score, ok := scores["Dave"]   // score = 0, ok = false (Dave isn't in the map)
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

## String Parsing & Building

> *"A little copying is better than a little dependency."* — Go Proverb

Infrastructure is strings all the way down. Log lines, metric formats, config files, YAML keys.

### Splitting & Joining

```go
import "strings"

// Split a sentence on whitespace
line := "The quick brown fox jumps over the lazy dog"
words := strings.Fields(line)  // splits on any whitespace
// ["The", "quick", "brown", "fox", "jumps", "over", "the", "lazy", "dog"]

// Split on specific delimiter
csv := "Alice,Bob,Carol,Dave"
names := strings.Split(csv, ",")
// ["Alice", "Bob", "Carol", "Dave"]

// SplitN — limit the number of splits (useful when the value contains the delimiter)
entry := "name=Tom = Jerry"
parts := strings.SplitN(entry, "=", 2)  // split into at most 2 parts
// ["name", "Tom = Jerry"]
// Without the 2: Split would give ["name", "Tom ", " Jerry"]

// Join
joined := strings.Join(names, " | ")
// "Alice | Bob | Carol | Dave"
```

`strings.SplitN(s, sep, n)` splits into at most `n` pieces. Use `SplitN(s, "=", 2)` whenever the value side might contain the delimiter. A naive `Split` will break any value that contains extra `=` signs.

### Checking Content

```go
strings.Contains(s, "=")           // true if s has "=" anywhere
strings.HasPrefix(line, "#")       // true if line starts with "#" (comment detection)
strings.HasSuffix(path, ".yaml")   // true if path ends with ".yaml"
```

These are your guards before parsing. Check what a string looks like before you try to split or slice it.

### Parsing Key-Value Pairs

You'll do this constantly — config files, labels, environment variables. The quickest way: `SplitN` with a limit of 2:

```go
// Parse "key=value" into key and value
setting := "color=dark blue"
parts := strings.SplitN(setting, "=", 2)
if len(parts) == 2 {
    fmt.Println(parts[0], parts[1])  // "color" "dark blue"
}
```

> **`strings.Index` vs `strings.SplitN`:** Both can split on the first occurrence. `SplitN(s, "=", 2)` gives you a `[]string` directly. `strings.Index` gives you the position so you can use slice expressions (`s[:i]`, `s[i+1:]`). Use whichever feels cleaner for the situation.

### Building Strings

```go
// fmt.Sprintf — your workhorse
msg := fmt.Sprintf("%s scored %d out of %d", "Alice", 87, 100)

// Collect-and-join pattern — build a slice of strings, then join
colors := map[string]string{"sky": "blue", "grass": "green", "sun": "yellow"}
parts := make([]string, 0, len(colors))
for k, v := range colors {
    parts = append(parts, fmt.Sprintf("%s is %s", k, v))
}
result := strings.Join(parts, ", ")
// result = "sky is blue, grass is green, sun is yellow" (order may vary)

// strings.Builder — for building in a loop (more efficient than += concatenation)
var b strings.Builder
for _, line := range lines {
    b.WriteString(line)
    b.WriteByte('\n')
}
result := b.String()
```

### Trimming

```go
s := strings.TrimSpace("  hello  ")      // "hello"
s := strings.Trim(s, "\"")               // remove surrounding quotes
s := strings.TrimPrefix(s, "https://")   // remove prefix if present
s := strings.TrimSuffix(s, ".yaml")      // remove suffix if present
```

<div class="inline-exercises" data-concept="String Parsing"></div>

## Numbers, Floats & Percentages

Infrastructure code mostly deals with integers (ports, counts, bytes), but reporting often needs percentages and formatted output.

### Percentage Calculation

In Go, dividing two ints gives an int — the decimal part is thrown away. `3 / 8` is `0`, not `0.375`. This is different from Python 3 where `/` always gives a float.

So to get a real percentage, you must convert to `float64` *before* dividing:

```go
passed := 7
total := 12

pct := float64(passed) / float64(total) * 100  // 58.333...
fmt.Printf("%.1f%%\n", pct)                     // "58.3%"
```

The `float64()` calls do the conversion. `%%` prints a literal percent sign (because `%` is the format specifier prefix).

### Rounding

`math.Round` rounds to the nearest integer. But what if you want 1 decimal place? There's no `math.Round(x, places)`. The trick: multiply to shift the decimal point, round, then divide back.

To round to 1 decimal: multiply by 10 (moves the tenths digit into the ones place), round, divide by 10:

```go
avg := 72.6789
rounded := math.Round(avg*10) / 10  // 72.7
// 72.6789 * 10 = 726.789 → Round → 727 → / 10 = 72.7
```

To round to 2 decimals, multiply/divide by 100. To round to the nearest integer, just `math.Round(x)`.

### Parsing Numbers from Strings

```go
import "strconv"

// String → int
n, err := strconv.Atoi("42")
if err != nil {
    // handle: "not a number"
}

// String → float64
f, err := strconv.ParseFloat("3.14", 64)
if err != nil {
    // handle: "not a number"
}
```

The second argument to `ParseFloat` is the bit size (64 for `float64`, 32 for `float32`). Always use 64.

<div class="inline-exercises" data-concept="Numbers & Percentages"></div>

## Sorting & Filtering

> *"The bigger the interface, the weaker the abstraction."* — Rob Pike

### sort.Slice

```go
import "sort"

// Sort strings alphabetically
sort.Strings(names)  // sorts in place, modifies the original slice

// Sort with custom comparator — for any slice type
sort.Slice(students, func(i, j int) bool {
    return students[i].Name < students[j].Name
})

// Sort by score, descending
sort.Slice(students, func(i, j int) bool {
    return students[i].Score > students[j].Score
})
```

The comparator returns `true` if element `i` should come before element `j`. That's it.

*Python comparison*

```python
# Python: students.sort(key=lambda s: s.name)
# Go: sort.Slice(students, func(i, j int) bool { return students[i].Name < students[j].Name })
# More verbose, but explicit about the comparison.
```

### Top N Pattern

A very common pattern: "give me the top 5 students by score."

```go
sort.Slice(students, func(i, j int) bool {
    return students[i].Score > students[j].Score  // descending
})
if len(students) > 5 {
    students = students[:5]  // keep top 5
}
```

Sort descending, then truncate. Three lines. You'll use this shape whenever you need "the top N of anything."

<div class="inline-exercises" data-concept="Sorting & Filtering"></div>

## Line-by-Line Parsing

Imagine someone hands you a `.env` file and says "load this into a map." The file has blank lines, comments starting with `#`, and key-value pairs like `DB_HOST=localhost`. Some values are quoted, some aren't. How do you handle all of that?

The answer is a pattern you'll use over and over — for `.env` files, INI configs, CSVs, and any line-oriented format:

```go
// Split into lines, skip blanks and comments, parse each line
func parseEnv(content string) map[string]string {
    result := make(map[string]string)
    lines := strings.Split(content, "\n")

    for _, line := range lines {
        line = strings.TrimSpace(line)

        // Skip empty lines and comments
        if line == "" || strings.HasPrefix(line, "#") {
            continue
        }

        // Split key=value on first =
        parts := strings.SplitN(line, "=", 2)
        if len(parts) != 2 {
            continue  // skip malformed lines
        }

        key := strings.TrimSpace(parts[0])
        val := strings.TrimSpace(parts[1])
        val = strings.Trim(val, "\"")  // strip optional quotes

        result[key] = val
    }
    return result
}
```

Split lines, trim, skip empties and comments, parse what's left. You'll recognize this skeleton in half the infrastructure tools you read on GitHub.

### State Tracking

When a format has sections (like INI files), track the "current section" as you parse:

```go
func parseINI(content string) map[string]map[string]string {
    result := make(map[string]map[string]string)
    currentSection := "default"

    for _, line := range strings.Split(content, "\n") {
        line = strings.TrimSpace(line)
        if line == "" || strings.HasPrefix(line, "#") {
            continue
        }

        // Section header: [section_name]
        if strings.HasPrefix(line, "[") && strings.HasSuffix(line, "]") {
            currentSection = line[1 : len(line)-1]
            continue
        }

        // Key=value pair under the current section
        parts := strings.SplitN(line, "=", 2)
        if len(parts) != 2 {
            continue
        }
        key := strings.TrimSpace(parts[0])
        val := strings.TrimSpace(parts[1])

        // Lazy-initialize the inner map
        if result[currentSection] == nil {
            result[currentSection] = make(map[string]string)
        }
        result[currentSection][key] = val
    }
    return result
}
```

This is a simple **state machine**: the variable `currentSection` changes as you encounter `[section]` headers, and all key-value pairs go into whatever section is current. Same pattern works for parsing Dockerfiles (current stage), multi-doc YAML (current document), etc.

<div class="inline-exercises" data-concept="Line Parsing"></div>

## Putting It Together

Time to combine everything. Given a text file where each line is `name:score`, we'll parse lines, group scores by name, and produce a sorted summary. This is the **parse → accumulate → sort → format** pattern — the same shape you'll use for any "group data and report" task.

**Step 1: Parse one line.** Split on `:` to get the name and numeric value.

```go
line := "alice:95"
parts := strings.SplitN(line, ":", 2)
name := parts[0]                        // "alice"
score, err := strconv.Atoi(parts[1])    // 95
```

**Step 2: Accumulate totals.** Loop through lines, parse each one, sum scores by name.

```go
totals := make(map[string]int)

for _, line := range lines {
    parts := strings.SplitN(line, ":", 2)
    if len(parts) != 2 {
        continue  // skip malformed lines
    }
    score, err := strconv.Atoi(strings.TrimSpace(parts[1]))
    if err != nil {
        continue  // skip lines with bad numbers
    }
    totals[parts[0]] += score
}
```

**Step 3: Sorted output.** Maps iterate in random order, so collect keys, sort, and format.

```go
names := make([]string, 0, len(totals))
for name := range totals {
    names = append(names, name)
}
sort.Strings(names)

results := make([]string, len(names))
for i, name := range names {
    results[i] = fmt.Sprintf("%-20s %d", name, totals[name])
}
return results
```

**All together:**

```go
func scoreReport(lines []string) []string {
    totals := make(map[string]int)

    for _, line := range lines {
        parts := strings.SplitN(line, ":", 2)
        if len(parts) != 2 {
            continue
        }
        score, err := strconv.Atoi(strings.TrimSpace(parts[1]))
        if err != nil {
            continue
        }
        totals[parts[0]] += score
    }

    names := make([]string, 0, len(totals))
    for name := range totals {
        names = append(names, name)
    }
    sort.Strings(names)

    results := make([]string, len(names))
    for i, name := range names {
        results[i] = fmt.Sprintf("%-20s %d", name, totals[name])
    }
    return results
}
```

This function uses every pattern from the module: string splitting, `continue` for skipping bad lines, maps for accumulating, the sorted-keys pattern, and formatted output. In practice, the input could be log entries, config lines, or CSV rows — the shape stays the same.

> **What's missing?** You might notice we sorted alphabetically, not by score descending. Sorting by value (to get "top N") requires bundling each key-value pair into a sortable unit — and that's exactly what structs unlock in Module 2. Once you learn structs, you'll upgrade this pattern to **accumulate → struct → sort → truncate → format**.

<div class="inline-exercises" data-concept="Combining Patterns"></div>

---

## Exercises

Practice individual concepts with quick drills, then tackle multi-step challenges.

<div id="warmups-container">
    <noscript><p class="js-required">JavaScript is required for the interactive exercises.</p></noscript>
</div>

### 💪 Challenges

Apply what you learned to infra-themed problems. Each challenge has multiple variants — shuffle to keep things fresh.

<div id="challenges-container">
    <noscript><p class="js-required">JavaScript is required for the interactive exercises.</p></noscript>
</div>
