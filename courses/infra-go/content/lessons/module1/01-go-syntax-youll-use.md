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
fmt.Printf("rate: %f\n", 3.14159)    // 3.141590 (default: 6 decimals)
fmt.Printf("rate: %.1f\n", 3.14159)  // 3.1
fmt.Printf("rate: %.2f\n", 3.14159)  // 3.14

// Width and alignment
// %-12s = left-aligned, 12 chars wide
// %6d  = right-aligned, 6 chars wide
fmt.Printf("%-12s %6d\n", "web-1", 512)
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
len(s)  // 3 — number of elements
cap(s)  // capacity (how many before the backing array grows)

// copy(dst, src) — returns number of elements copied
src := []int{1, 2, 3, 4, 5}
dst := make([]int, 3)
copy(dst, src) // dst = [1, 2, 3]

// Shift elements right (used for insert-at-index)
s = append(s, "")    // grow by one
copy(s[2+1:], s[2:]) // shift index 2+ one position right
s[2] = "inserted"     // write into the gap
```

</details>

### Range Gotchas

Three things that will bite you if you don't know them:

**Range gives you a copy.** The `v` in `for _, v := range nums` is a *copy* of the element. Mutating it does nothing to the slice:

```go
nums := []int{1, 2, 3}

// BUG: v is a copy — changing it does nothing to the slice
for _, v := range nums {
    v = v * 10
}
fmt.Println(nums) // [1 2 3] — unchanged!

// FIX: use the index to modify in place
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

// 99 was appended — but range already decided to run 3 times
fmt.Println(nums)      // [1 2 3 99]
fmt.Println(len(nums)) // 4
```

**Use `for i := range` when you need to mutate.** If you need to change elements, use the index form. If you just need to read them, `for _, v := range` is fine.

---
