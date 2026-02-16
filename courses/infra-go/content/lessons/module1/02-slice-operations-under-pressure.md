## Slice Operations Under Pressure

> *"Make the zero value useful."* — Go Proverb

A slice is a view over an array: pointer, length, capacity. Think of it like a window over a bookshelf — the pointer says which shelf, the length says how many books are visible through the window, and the capacity says how many the shelf can hold before you need a bigger one. What you need to drill is *using* slices without thinking.

*Quick reference*

```go
fruits := []string{"apple", "banana", "cherry", "date", "elderberry"}

// Access by index
fruits[0]              // "apple"
fruits[len(fruits)-1]  // "elderberry" (last element)

// Slice expression — [start : end)
// start is inclusive, end is exclusive
fruits[1:3]            // ["banana", "cherry"]

// Omit start → from the beginning
fruits[:3]             // ["apple", "banana", "cherry"]

// Omit end → through the end
fruits[2:]             // ["cherry", "date", "elderberry"]

// Last N elements
fruits[len(fruits)-2:] // ["date", "elderberry"]
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
var pods []string            // nil slice, length 0
pods = append(pods, "web-1") // [web-1]

// Append multiple at once
pods = append(pods, "web-2", "web-3")
// pods = [web-1, web-2, web-3]

// Append another slice (... unpacks it)
more := []string{"db-1", "db-2"}
pods = append(pods, more...)
// pods = [web-1, web-2, web-3, db-1, db-2]
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

// Start from index 1 — prices[0] is already covered
for _, p := range prices[1:] {
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
