## Turn several observations into a result

A port validator makes one decision. A report needs to make that decision, or a similar one, repeatedly. Start with an ordinary loop before reaching for concurrency.

```go
codes := []int{200, 503, 200}
ok := 0
for _, code := range codes {
    if code >= 200 && code < 300 {
        ok++
    }
}
```

`:=` declares a variable and infers its type. `[]int` is a slice of integers. `range` gives an index and a value; `_` discards the index because this loop does not need it. `ok++` adds one. After this loop, `ok` is 2.

To count several categories, use a map:

```go
counts := map[string]int{"ok": 0, "server": 0}
counts["ok"]++
```

The key type is `string`; the value type is `int`. A missing map key reads as the value type's zero value, which is zero for an integer. But assignment into a nil map panics. `var counts map[string]int` declares a nil map; the literal above allocates one. `make(map[string]int)` also allocates one.

**Exercise: Count response classes.** Read its category boundaries first. Do not assume that a 302 belongs to `ok` just because a browser might follow it. The function is classifying the status it was given.

### Give associated values a name

When a result needs both a target and a status, a struct keeps them together:

```go
type Observation struct {
    Target string
    Status int
}

observation := Observation{Target: "api", Status: 503}
```

This is preferable to two parallel slices whose indices must always line up. A type declaration also makes the vocabulary of a program visible: this is an observation, not an arbitrary pair.

### Copying a slice is not copying its elements

```go
names := []string{"api", "worker"}
other := names
other[0] = "changed"
```

Now `names[0]` is also `"changed"`. The assignment copies a slice descriptor pointing at shared backing storage. To obtain independently editable elements, allocate another slice and copy:

```go
independent := make([]string, len(names))
copy(independent, names)
```

This is an element copy, not a recursive deep copy. If the elements themselves contain pointers or slices, those may still refer to shared data. Our target names are strings, so copying the elements is enough for this exercise.

**Exercise: Return independent target names.** Combine a membership map with a new output slice. Preserve first-seen order. Iterating over a map is not a way to preserve order; map iteration order is unspecified.

### Return useful results instead of printing from every function

The counting function returns a map. It does not print the report. That lets a caller choose JSON, text, or a test comparison without rewriting the counting logic. This separation is small, but it is the beginning of program structure: transform data in one place, perform I/O at the edges.

For a function that can fail, Go conventionally returns a result and an error:

```go
func Positive(n int) (int, error) {
    if n <= 0 {
        return 0, fmt.Errorf("expected a positive integer, got %d", n)
    }
    return n, nil
}
```

This snippet needs `import "fmt"`. `nil` means there is no error. At the call site, check the error before using the result. Do not add logging here and again in every caller: repeated logging can turn one failure into five misleading events.

### A short review

A map counts or looks up by key. A slice keeps a sequence. A struct names related fields. A function boundary separates a decision from where its input came from. These are enough to write a useful configuration reader; we do not need interfaces or goroutines yet.

References: [A Tour of Go: slices](https://go.dev/tour/moretypes/7), [maps](https://go.dev/tour/moretypes/19), and [errors](https://go.dev/tour/methods/19).
