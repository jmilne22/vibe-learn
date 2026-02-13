You know what slices and maps are. This module drills you on *using* them until they're automatic. Every exercise uses infrastructure data — log lines, metric labels, pod specs, config entries.

Every function and pattern used in the exercises below is taught in this lesson first. If an exercise feels impossible, the gap is here — come back and re-read the relevant section.

---

## Go Syntax You'll Use

This section covers the Go-specific syntax the exercises need. Not what slices or maps *are* — you know that — but the Go forms for writing loops, functions, printing, and converting types. Skim this now, come back when you need it.

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

// Stepping by more than 1 — useful for batching
for i := 0; i < len(pods); i += batchSize {
    end := i + batchSize
    if end > len(pods) {
        end = len(pods)
    }
    fmt.Println(pods[i:end])  // print each batch
}

// Counting from 1
for i := 1; i <= 5; i++ {
    fmt.Println(fmt.Sprintf("node-%d", i))  // node-1, node-2, ..., node-5
}
```

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

---

## Slice Operations Under Pressure

A slice is a view over an array: pointer, length, capacity. What you need to drill is *using* them without thinking.

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

```go
var pods []string                      // nil slice, length 0
pods = append(pods, "web-1")           // [web-1]
pods = append(pods, "web-2", "web-3")  // [web-1, web-2, web-3]

// Append another slice with ...
more := []string{"db-1", "db-2"}
pods = append(pods, more...)           // [web-1, web-2, web-3, db-1, db-2]
```

> **Key insight:** `append` may return a *new* underlying array if capacity is exceeded. Always reassign: `s = append(s, item)`. Forgetting the reassignment is a silent bug.

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

When you know the size upfront, pre-allocate. This matters in infra code processing thousands of resources.

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

### Finding Min / Max

No builtin for this. Just loop:

```go
times := []int{234, 12, 891, 45, 567, 23, 445}

min, max := times[0], times[0]
for _, t := range times[1:] {
    if t < min {
        min = t
    }
    if t > max {
        max = t
    }
}
fmt.Printf("min=%dms max=%dms\n", min, max)
// min=12ms max=891ms
```

Initialize to the first element, then scan the rest. Works for any comparable type.

## In-Place Manipulation

Modify a slice without creating a new one.

### Swap Two Elements

```go
// Swap elements at index i and j
s[i], s[j] = s[j], s[i]
```

Go's simultaneous assignment makes this trivial.

### Reverse In Place

```go
for i, j := 0, len(s)-1; i < j; i, j = i+1, j-1 {
    s[i], s[j] = s[j], s[i]
}
```

Two pointers, walk inward, swap. Practice this until you can write it without thinking.

### Remove at Index (Preserving Order)

```go
// Remove element at index i, shift everything left
s = append(s[:i], s[i+1:]...)
```

Creates a new slice header but reuses the backing array. Elements after `i` shift left by one.

### Remove at Index (Fast, Order Doesn't Matter)

```go
// Swap with last element, then shrink
s[i] = s[len(s)-1]
s = s[:len(s)-1]
```

O(1) instead of O(n). Use this when order doesn't matter — like removing a terminated pod from a running list.

### Insert at Index

```go
// Insert val at index i — grow, shift right, write
s = append(s, "")          // grow by one (use zero value for the type)
copy(s[i+1:], s[i:])       // shift elements at i and beyond one position right
s[i] = val                 // insert into the gap
```

`copy(dst, src)` copies elements from `src` into `dst`, overwriting whatever's there. It copies `min(len(dst), len(src))` elements.

### Filter In Place

Keep elements that match a condition, reusing the same backing array:

```go
// Keep only running pods (struct slice version)
n := 0
for _, pod := range pods {
    if pod.Status == "Running" {
        pods[n] = pod
        n++
    }
}
pods = pods[:n]
```

This is the **in-place filter pattern**. Two-index approach: `n` tracks where to write, the range iterates where to read.

**Parallel slice version** — when your data is in separate slices instead of structs:

```go
// names and statuses are parallel slices — names[i] goes with statuses[i]
names := []string{"web-1", "web-2", "db-1", "cache-1"}
statuses := []string{"Running", "Failed", "Running", "Running"}

n := 0
for i, status := range statuses {
    if status == "Running" {
        names[n] = names[i]
        n++
    }
}
names = names[:n]
// names = ["web-1", "db-1", "cache-1"]
```

Same write-index pattern. Use the index `i` to reach into the parallel slice.

### Deduplicate a Sorted Slice

A variant of the filter pattern — keep an element only if it differs from the previous one:

```go
versions := []string{"v1.0", "v1.0", "v1.1", "v1.1", "v1.2", "v1.3", "v1.3"}

n := 1  // first element always stays
for i := 1; i < len(versions); i++ {
    if versions[i] != versions[i-1] {
        versions[n] = versions[i]
        n++
    }
}
versions = versions[:n]
// [v1.0 v1.1 v1.2 v1.3]
```

Note this uses a C-style `for` loop (not `range`) because we need to compare adjacent elements by index.

*Python comparison*

```python
# Python: pods = [p for p in pods if p.status == "Running"]
# Go: no filter builtin. The loop above IS the Go way.
```

## Map Patterns for Infra

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

Override defaults with user-supplied values:

```go
defaults := map[string]string{"timeout": "30s", "retries": "3", "log_level": "info"}
overrides := map[string]string{"timeout": "10s", "log_level": "debug"}

merged := make(map[string]string)
for k, v := range defaults {
    merged[k] = v
}
for k, v := range overrides {
    merged[k] = v  // overwrites defaults
}
// merged = map[log_level:debug retries:3 timeout:10s]
```

Copy defaults in first, then overrides. Second write wins.

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

Always check if the inner map is nil before writing. This "lazy initialization" pattern avoids pre-creating maps for every possible key.

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

If you need sorted output, collect keys into a slice and sort first:

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

## String Parsing & Building

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

`strings.SplitN(s, sep, n)` splits into at most `n` pieces. Use `SplitN(s, "=", 2)` whenever the value side might contain the delimiter.

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

## Numbers, Floats & Percentages

Infrastructure code mostly deals with integers (ports, counts, bytes), but reporting often needs percentages and formatted output.

### Percentage Calculation

```go
errors := 3
total := 8

// Must convert to float64 before dividing — int division truncates
pct := float64(errors) / float64(total) * 100  // 37.5
fmt.Printf("%.1f%%\n", pct)                     // "37.5%"
```

Without the `float64()` conversion: `3 / 8 = 0` (integer division truncates).

### Rounding

```go
import "math"

// Round to 1 decimal place: multiply, round, divide
rate := 33.3333
rounded := math.Round(rate*10) / 10  // 33.3

// Round to nearest integer
count := math.Round(42.6)  // 43
```

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

## Sorting & Filtering

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

### Zipping Parallel Slices for Sorting

When data comes as parallel slices (`names[i]` goes with `memoryMB[i]`), zip them into a struct slice first so you can sort them together:

```go
names := []string{"web-1", "api-1", "db-1", "cache-1"}
memoryMB := []int{512, 256, 2048, 1024}

// Define a struct type to hold paired data
type pod struct {
    name string
    mem  int
}

// Zip the parallel slices
pods := make([]pod, len(names))
for i := range names {
    pods[i] = pod{names[i], memoryMB[i]}
}

// Now sort by memory descending
sort.Slice(pods, func(i, j int) bool {
    return pods[i].mem > pods[j].mem
})

// Extract just the names back out
topNames := make([]string, 3) // top 3
for i := 0; i < 3; i++ {
    topNames[i] = pods[i].name
}
// topNames = ["db-1", "cache-1", "web-1"]
```

You can define a `type` inside a function — it's scoped to that function. Use this whenever you need a throwaway struct for sorting or grouping.

## Line-by-Line Parsing

Parsing config files, env files, or any line-oriented format follows the same pattern:

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

This pattern — split lines, trim, skip empties/comments, parse — works for `.env` files, INI configs, CSVs, and most line-oriented formats.

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

## Putting It Together

Here's a realistic example combining everything: parse a Prometheus-style metrics file, group by label, sort by value, return the top N. We'll build it in steps.

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

This function uses: string parsing, `continue` for skipping bad lines, maps for counting, an inline struct for sorting, `sort.Slice`, and slice truncation. This is the **count → sort → format** pattern. You'll see it again in the challenges. If you can write this from scratch, you're ready for Module 2.

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
