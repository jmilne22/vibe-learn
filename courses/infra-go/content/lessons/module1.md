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

---

## Slice Operations Under Pressure

> *"Make the zero value useful."* — Go Proverb

A slice is a view over an array: pointer, length, capacity. Think of it like a window over a bookshelf — the pointer says which shelf, the length says how many books are visible through the window, and the capacity says how many the shelf can hold before you need a bigger one. What you need to drill is *using* slices without thinking.

*Quick reference*

```go
s := []string{"nginx", "redis", "postgres"}

s[0]             // "nginx" — access by index
s[len(s)-1]      // "postgres" — last element
s[1:3]           // ["redis", "postgres"] — slice expression (start inclusive, end exclusive)
s[:2]            // ["nginx", "redis"] — first two
s[1:]            // ["redis", "postgres"] — everything after first
s[len(s)-3:]     // last 3 elements
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
// Build "node-1" through "node-5"
var nodes []string
for i := 1; i <= 5; i++ {
    nodes = append(nodes, fmt.Sprintf("node-%d", i))
}
fmt.Printf("len=%d cap=%d %v\n", len(nodes), cap(nodes), nodes)
// len=5 cap=8 [node-1 node-2 node-3 node-4 node-5]
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

You have 7 pods and need to process them in batches of 3. That means groups: `[0:3]`, `[3:6]`, `[6:7]`. How do you loop that?

Start from what you know — a C-style loop counts up by 1:

```go
for i := 0; i < len(pods); i++ { ... }
//  i goes: 0, 1, 2, 3, 4, 5, 6
```

But you don't want every index — you want the *start* of each batch. Those are 0, 3, 6. The step isn't 1, it's `batchSize`. The `post` part of a C-style loop can be anything, so change `i++` to `i += batchSize`:

```go
for i := 0; i < len(pods); i += batchSize { ... }
//  i goes: 0, 3, 6
```

Now each `i` is the start of a batch. The end is `i + batchSize`. So the batch is `pods[i : i+batchSize]` — except there's a problem. When `i=6` and `batchSize=3`, `i+batchSize=9`, which is past the end of a 7-element slice. Go will panic with "index out of range."

The fix: cap the end index so it never exceeds `len(pods)`:

```go
end := i + batchSize
if end > len(pods) {
    end = len(pods)
}
// Now pods[i:end] is always safe
```

That's the whole pattern. You derive it from three ideas: (1) C-style loops can step by any amount, (2) each step is the start of a batch, and (3) the last batch might be short so you clamp the end. In production, you'll use this when rolling out config changes to 500 nodes — you don't hit all 500 at once, you batch them in groups of 50 so a bad config only takes down 10% before you notice.

### Finding Min / Max

Go has no `min()`/`max()` for slices. You build it from a loop.

The question is: what do you initialize min and max to? If you start with `min := 0`, you'll get 0 as the minimum for any slice of positive numbers — that's wrong. If you start with `min := 999999`, you're guessing at an upper bound — also wrong.

The safe answer: initialize both to the first element. Now min and max are already correct for a 1-element slice, and you just need to scan the rest:

```go
min, max := times[0], times[0]
for _, t := range times[1:] {   // start from index 1 — [0] is already covered
    if t < min {
        min = t
    }
    if t > max {
        max = t
    }
}
```

One pass, two comparisons per element. `times[1:]` skips the first element since it's already accounted for. This works for any comparable type — ints, floats, strings.

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

### Insert at Index

Inserting is the reverse of removing: you need to make a gap, then write into it. Three steps:

```go
items := []string{"a", "b", "d", "e"}
i := 2
val := "c"

items = append(items, "")      // [a b d e ""] — grow by one
copy(items[i+1:], items[i:])   // [a b d d e]  — shift elements right, opening a gap at i
items[i] = val                 // [a b c d e]  — write into the gap
```

`copy(dst, src)` copies elements from `src` into `dst`, overwriting whatever's there. Here `items[i:]` is the source (elements from `i` onward) and `items[i+1:]` is the destination (one position to the right). The overlap is fine — `copy` handles it correctly.

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

### Deduplicate a Sorted Slice

If the slice is sorted, all duplicates are adjacent. So the question becomes: "is this element the same as the one before it?" If yes, skip it. If no, keep it.

This is the filter-in-place pattern again — a write position `n` that only advances for keepers. But there are two differences from the filter above:

1. The first element always stays (there's nothing before it to compare to), so `n` starts at 1 instead of 0.
2. You need to compare `nums[i]` with `nums[i-1]`, which means you need the index — so use a C-style `for` starting at 1, not `range`.

```go
nums := []int{1, 1, 2, 2, 2, 3, 4, 4}

n := 1  // first element always stays
for i := 1; i < len(nums); i++ {
    if nums[i] != nums[i-1] {  // different from previous? keep it
        nums[n] = nums[i]
        n++
    }
}
nums = nums[:n]
// Before: [1 1 2 2 2 3 4 4]
// After:  [1 2 3 4]
```

If you understood the filter pattern, this is just "filter where the condition is: different from the previous element."

*Python comparison*

```python
# Python: filtered = [x for x in items if condition(x)]
# Go: no filter builtin. The write-index loop above IS the Go way.
```

<div class="inline-exercises" data-concept="In-Place Manipulation"></div>

## Map Patterns for Infra

> *"Clear is better than clever."* — Go Proverb

A map is a lookup table — think of it like a DNS server. You give it a name (the key), it gives you back an address (the value). If the name isn't registered, you get back a zero value, not an error. That's why you'll need the comma-ok pattern below: to tell "this key maps to zero" apart from "this key doesn't exist."

Maps are your most-used data structure in infrastructure code. Counting, grouping, lookup tables, caches.

### Create & Access

```go
// Literal
statusCodes := map[string]int{
    "healthy":   0,
    "degraded":  1,
    "unhealthy": 2,
}

// make
podsByNode := make(map[string][]string)

// Access (zero value if missing)
count := statusCodes["healthy"]  // 0
count := statusCodes["missing"]  // 0 (zero value for int — ambiguous!)

// Comma-ok pattern: distinguish "exists with zero value" from "missing"
count, ok := statusCodes["missing"]
if !ok {
    fmt.Println("key not found")
}
```

> **When to use comma-ok:** Whenever the zero value is a valid value. For `map[string]int`, 0 could be a real count. For `map[string]string`, empty string could be a real value. When in doubt, use comma-ok.

### Counting

The single most common map pattern in infra:

```go
// Count log entries by level
counts := make(map[string]int)
for _, level := range levels {
    counts[level]++  // zero value of int is 0, so this just works
}
```

### Grouping

```go
// Group pods by namespace (struct slice version)
byNamespace := make(map[string][]string)
for _, pod := range pods {
    byNamespace[pod.Namespace] = append(byNamespace[pod.Namespace], pod.Name)
}

// Parallel slice version — names[i] goes with namespaces[i]
names := []string{"web-1", "web-2", "api-1", "db-1"}
namespaces := []string{"frontend", "frontend", "backend", "data"}

grouped := make(map[string][]string)
for i, ns := range namespaces {
    grouped[ns] = append(grouped[ns], names[i])
}
// grouped = map[frontend:[web-1 web-2] backend:[api-1] data:[db-1]]
```

### Map as Set

Go has no set type. Use `map[string]bool`:

```go
// Track unique error messages
seen := make(map[string]bool)
for _, msg := range errors {
    seen[msg] = true
}

// Check membership
if seen["connection refused"] {
    fmt.Println("network issue detected")
}
```

### Merge Two Maps

Here's a scenario: you have default config values (`timeout: 30s`, `retries: 3`, `log_level: info`) and user overrides (`timeout: 10s`, `log_level: debug`). The final config should have the user's timeout and log level, but the default retries. How would you produce that merged result?

Maps don't have a merge method. You build it: create a new map, copy one in, then copy the other. Whichever you copy second wins on conflicts:

```go
defaults := map[string]string{"timeout": "30s", "retries": "3", "log_level": "info"}
overrides := map[string]string{"timeout": "10s", "log_level": "debug"}

merged := make(map[string]string)
for k, v := range defaults {
    merged[k] = v              // copy all defaults
}
for k, v := range overrides {
    merged[k] = v              // overwrite with user values (second write wins)
}
// merged = map[log_level:debug retries:3 timeout:10s]
```

Order matters. If you copied overrides first and defaults second, defaults would win — the opposite of what you want.

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
delete(podsByNode, "node-3")  // remove key. No-op if key doesn't exist.
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

// Split a log line on whitespace
line := "2024-01-15 ERROR [auth] connection refused"
parts := strings.Fields(line)  // splits on any whitespace
// ["2024-01-15", "ERROR", "[auth]", "connection", "refused"]

// Split on specific delimiter
labels := "app=nginx,env=prod,region=us-east"
pairs := strings.Split(labels, ",")
// ["app=nginx", "env=prod", "region=us-east"]

// SplitN — limit the number of splits (critical for key=value where value contains =)
line2 := "DB_URL=postgres://host:5432/db?opt=val"
parts2 := strings.SplitN(line2, "=", 2)  // split into at most 2 parts
// ["DB_URL", "postgres://host:5432/db?opt=val"]
// Without the 2: Split would give ["DB_URL", "postgres://host:5432/db?opt", "val"]

// Join
joined := strings.Join(pairs, " | ")
// "app=nginx | env=prod | region=us-east"
```

`strings.SplitN(s, sep, n)` splits into at most `n` pieces. Use `SplitN(s, "=", 2)` whenever the value side might contain the delimiter. This one trips people up in production — a database URL like `postgres://host:5432/db?opt=val` contains multiple `=` signs, and a naive `Split` will shred it.

### Checking Content

```go
strings.Contains(s, "=")           // true if s has "=" anywhere
strings.HasPrefix(line, "#")       // true if line starts with "#" (comment detection)
strings.HasSuffix(path, ".yaml")   // true if path ends with ".yaml"
```

These are your guards before parsing. Check what a string looks like before you try to split or slice it.

### Parsing Key-Value Pairs

You'll do this constantly — config files, labels, environment variables:

```go
// Parse "key=value" into key and value, splitting on first = only
func parseKV(s string) (string, string, bool) {
    i := strings.Index(s, "=")
    if i < 0 {
        return "", "", false
    }
    return s[:i], s[i+1:], true
}

key, val, ok := parseKV("app=nginx")
// key="app", val="nginx", ok=true
```

> **`strings.Index` vs `strings.SplitN`:** Both can split on the first occurrence. `Index` gives you the position (use slice expressions). `SplitN(s, "=", 2)` gives you a `[]string` directly. Use whichever feels cleaner for the situation.

### Building Strings

```go
// fmt.Sprintf — your workhorse
msg := fmt.Sprintf("pod %s in namespace %s: %s", "web-1", "production", "Running")

// Collect-and-join pattern — build a slice of strings, then join
// Very common for building reports from maps or slices
labels := map[string]string{"method": "GET", "status": "200"}
parts := make([]string, 0, len(labels))
for k, v := range labels {
    parts = append(parts, fmt.Sprintf("%s=\"%s\"", k, v))
}
result := strings.Join(parts, ",")
// result = method="GET",status="200" (order may vary)

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
errors := 3
total := 8

pct := float64(errors) / float64(total) * 100  // 37.5
fmt.Printf("%.1f%%\n", pct)                     // "37.5%"
```

The `float64()` calls do the conversion. `%%` prints a literal percent sign (because `%` is the format specifier prefix).

### Rounding

`math.Round` rounds to the nearest integer. But what if you want 1 decimal place? There's no `math.Round(x, places)`. The trick: multiply to shift the decimal point, round, then divide back.

To round to 1 decimal: multiply by 10 (moves the tenths digit into the ones place), round, divide by 10:

```go
rate := 33.3333
rounded := math.Round(rate*10) / 10  // 33.3
// 33.3333 * 10 = 333.333 → Round → 333 → / 10 = 33.3
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
sort.Slice(pods, func(i, j int) bool {
    return pods[i].Name < pods[j].Name
})

// Sort by memory usage, descending
sort.Slice(pods, func(i, j int) bool {
    return pods[i].MemoryMB > pods[j].MemoryMB
})
```

The comparator returns `true` if element `i` should come before element `j`. That's it.

*Python comparison*

```python
# Python: pods.sort(key=lambda p: p.name)
# Go: sort.Slice(pods, func(i, j int) bool { return pods[i].Name < pods[j].Name })
# More verbose, but explicit about the comparison.
```

### Top N Pattern

A very common infra pattern: "give me the top 5 pods by CPU usage."

```go
sort.Slice(pods, func(i, j int) bool {
    return pods[i].CPUM > pods[j].CPUM  // descending
})
if len(pods) > 5 {
    pods = pods[:5]  // keep top 5
}
```

During an incident, you need the top 5 memory hogs in seconds, not minutes. This three-line sort-and-truncate is something you'll write from muscle memory at 3am.

### Zipping Parallel Slices for Sorting

`sort.Slice` rearranges elements within a single slice. But if your data is in parallel slices (`names[i]` goes with `memoryMB[i]`), sorting one slice would break the pairing — `names` would be reordered but `memoryMB` would stay put.

The solution: combine them into a struct slice so the paired data moves together. Three steps:

**1. Define a struct to hold one pair.** You can define a `type` inside a function — it's scoped to that function. Use this for throwaway structs:

```go
type pod struct {
    name string
    mem  int
}
```

**2. Zip the parallel slices into structs.** Loop by index, pull from both slices:

```go
pods := make([]pod, len(names))
for i := range names {
    pods[i] = pod{names[i], memoryMB[i]}
}
```

**3. Sort the struct slice.** Now `sort.Slice` moves name and memory together:

```go
sort.Slice(pods, func(i, j int) bool {
    return pods[i].mem > pods[j].mem  // descending by memory
})
```

After sorting, extract the field you need (e.g. `pods[0].name` for the highest-memory pod). If you need a slice of just the names, loop and pull them out.

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

Remember the on-call scenario from the top? Here's something close to it: parse a Prometheus-style metrics file, group by label, sort by value, return the top N. This is the kind of function you'd write during an incident to answer "which endpoints are getting hammered?" We'll build it in steps.

**Step 1: Parse one line.** A Prometheus metric looks like `http_requests{method="GET",status="200"} 1027`. We need the label part and the numeric value.

```go
// Extract labels and value from: metric_name{labels} value
line := "http_requests{method=\"GET\",status=\"200\"} 1027"

// Find the { and } to extract the label portion
braceOpen := strings.Index(line, "{")
braceClose := strings.Index(line, "}")
labelPart := line[braceOpen+1 : braceClose]  // method="GET",status="200"

// The value is everything after "} "
valStr := strings.TrimSpace(line[braceClose+1:])
val, err := strconv.Atoi(valStr)  // 1027
```

**Step 2: Accumulate counts.** Loop through lines, parse each one, sum values by label.

```go
counts := make(map[string]int)

for _, line := range lines {
    idx := strings.Index(line, "} ")
    if idx < 0 {
        continue  // skip lines without labels
    }
    labelPart := line[strings.Index(line, "{")+1 : idx]
    valStr := strings.TrimSpace(line[idx+2:])
    val, err := strconv.Atoi(valStr)
    if err != nil {
        continue  // skip lines with unparseable values
    }
    counts[labelPart] += val
}
```

**Step 3: Sort by count.** Maps aren't sortable, so convert to a struct slice.

```go
type entry struct {
    labels string
    count  int
}
entries := make([]entry, 0, len(counts))
for k, v := range counts {
    entries = append(entries, entry{k, v})
}

sort.Slice(entries, func(i, j int) bool {
    return entries[i].count > entries[j].count  // descending
})
```

**Step 4: Take top N and format.**

```go
if len(entries) > n {
    entries = entries[:n]
}

results := make([]string, len(entries))
for i, e := range entries {
    results[i] = fmt.Sprintf("%s: %d", e.labels, e.count)
}
return results
```

**All together:**

```go
func topEndpoints(lines []string, n int) []string {
    counts := make(map[string]int)

    for _, line := range lines {
        idx := strings.Index(line, "} ")
        if idx < 0 {
            continue
        }
        labelPart := line[strings.Index(line, "{")+1 : idx]
        valStr := strings.TrimSpace(line[idx+2:])
        val, err := strconv.Atoi(valStr)
        if err != nil {
            continue
        }
        counts[labelPart] += val
    }

    type entry struct {
        labels string
        count  int
    }
    entries := make([]entry, 0, len(counts))
    for k, v := range counts {
        entries = append(entries, entry{k, v})
    }

    sort.Slice(entries, func(i, j int) bool {
        return entries[i].count > entries[j].count
    })

    if len(entries) > n {
        entries = entries[:n]
    }

    results := make([]string, len(entries))
    for i, e := range entries {
        results[i] = fmt.Sprintf("%s: %d", e.labels, e.count)
    }
    return results
}
```

This function uses: string parsing, `continue` for skipping bad lines, maps for counting, an inline struct for sorting, `sort.Slice`, and slice truncation. This is the **count → sort → format** pattern — the same shape as "group pods by node, find the top memory consumers, format a report." You'll see it again in the challenges. If you can write this from scratch, you're ready for Module 2.

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
