## Slices: The Deep Dive

Slices are Go's workhorse. They're more complex than Python lists under the hood.

*Slice internals*

Here's the deal: a slice is really just a tiny struct with three fields — a pointer, a length, and a capacity. Picture it like this:

```
┌──────────┐
│ ptr ─────┼───▶ [1] [2] [3] [_] [_]
│ len: 3   │      ▲ actual data     ▲
│ cap: 5   │      └── used ──┘      │
└──────────┘              unused ────┘
```

The pointer references an underlying array in memory. `len` tells Go how many elements you're actually using, and `cap` is the total space available before Go needs to allocate a new, bigger array. When you take a sub-slice, you get a *new* slice header pointing into the *same* underlying array — that's why modifications bleed through.

```go
// A slice is a struct with 3 fields:
// - pointer to underlying array
// - length (current elements)
// - capacity (max before realloc)

s := make([]int, 3, 10)  // len=3, cap=10
fmt.Println(len(s))  // 3
fmt.Println(cap(s))  // 10

// Append grows the slice
s = append(s, 1, 2, 3)

// Slicing creates a view (shares memory!)
original := []int{1, 2, 3, 4, 5}
slice := original[1:4]  // [2 3 4]
slice[0] = 999
fmt.Println(original)  // [1 999 3 4 5] — modified!
```

> **Gotcha:** Slicing creates a view, not a copy. Modifying the slice modifies the original!

### Append Growth Strategy

What happens when you `append` past the capacity? Go allocates a brand-new, larger array, copies everything over, and returns a slice pointing at it. The old array becomes garbage.

Here's the deal: for small slices (under ~256 elements), Go roughly **doubles** the capacity. For larger slices, it grows by about **25%**. This keeps amortized cost low, but it means you could temporarily use twice the memory you need.

> **Performance Tip:** If you know how many elements you'll need, pre-allocate with `make`. Don't let Go guess for you!

*Pre-allocating vs. growing*

```go
// Bad — grows and re-allocates multiple times
var result []int
for i := 0; i < 10000; i++ {
    result = append(result, i)
}

// Good — one allocation, no copying
result := make([]int, 0, 10000)
for i := 0; i < 10000; i++ {
    result = append(result, i)
}
```

### Common Slice Operations

*Slice operations*

```go
// Copy (to avoid shared memory)
dst := make([]int, len(src))
copy(dst, src)

// Delete element at index i
s = append(s[:i], s[i+1:]...)

// Insert at index i
s = append(s[:i], append([]int{newItem}, s[i:]...)...)

// Filter (create new slice)
var filtered []int
for _, v := range nums {
    if v > 10 {
        filtered = append(filtered, v)
    }
}

// Reverse in place
for i, j := 0, len(s)-1; i < j; i, j = i+1, j-1 {
    s[i], s[j] = s[j], s[i]
}
```

That delete trick deserves a closer look. Here's what happens step by step:

*Step-by-step delete walkthrough*

```go
// Delete index 2 from [10, 20, 30, 40, 50]:
// Before:    [10, 20, 30, 40, 50]
// s[:2]    → [10, 20]
// s[3:]    → [40, 50]
// append   → [10, 20, 40, 50]

s := []int{10, 20, 30, 40, 50}
i := 2
s = append(s[:i], s[i+1:]...)
fmt.Println(s) // [10 20 40 50]
```

> **Gotcha:** This delete pattern modifies the original underlying array. If another slice shares that memory, you'll get surprising results. When in doubt, `copy` first.

## Maps Deep Dive

*Map operations*

```go
// Create
m := make(map[string]int)
m := map[string]int{"a": 1, "b": 2}

// Check existence (IMPORTANT!)
val, ok := m["key"]
if !ok {
    // key doesn't exist
}

// Delete
delete(m, "key")

// Iterate (random order!)
for key, val := range m {
    fmt.Println(key, val)
}

// Get keys
keys := make([]string, 0, len(m))
for k := range m {
    keys = append(keys, k)
}
```

> **Map Iteration:** Map iteration order is random by design. If you need ordered keys, sort them separately.

### When to Use Set, Stack, or Queue

Before we build these, here's when you'd actually reach for them in real Go code:

- **Set** — deduplication, membership checks, tracking "seen" items. Think: "have I visited this URL already?" or "which user IDs are online?"
- **Stack** — undo/redo systems, expression parsing, DFS traversal, matching brackets. Anything where you process the *most recent* item first.
- **Queue** — BFS traversal, task scheduling, rate limiting, buffering events. Anything where you process items in the order they arrived.

Go's standard library doesn't ship these as types, so you build them from slices and maps. It's straightforward and idiomatic — don't reach for a third-party library for something this simple.

## Building a Set

Go doesn't have a built-in set. Use a map with empty struct values.

> **Why `struct{}` instead of `bool`?** You might wonder why we don't just use `map[string]bool`. Here's the deal: `struct{}` is a zero-byte type — it takes up literally no memory per entry. A `bool` costs 1 byte per entry. With a million keys, that's a megabyte saved. More importantly, `struct{}` signals intent: "I only care about the *keys*, not the values." Don't use `bool` when you mean "set membership."

*Set implementation*

```go
// Set using map[T]struct{}
// struct{} takes zero bytes!

type Set[T comparable] map[T]struct{}

func NewSet[T comparable]() Set[T] {
    return make(Set[T])
}

func (s Set[T]) Add(item T) {
    s[item] = struct{}{}
}

func (s Set[T]) Contains(item T) bool {
    _, ok := s[item]
    return ok
}

func (s Set[T]) Remove(item T) {
    delete(s, item)
}

// Usage
fruits := NewSet[string]()
fruits.Add("apple")
fruits.Add("banana")
fmt.Println(fruits.Contains("apple"))  // true
```

## Building a Stack

*Generic stack*

```go
type Stack[T any] struct {
    items []T
}

func (s *Stack[T]) Push(item T) {
    s.items = append(s.items, item)
}

func (s *Stack[T]) Pop() (T, bool) {
    if len(s.items) == 0 {
        var zero T
        return zero, false
    }
    item := s.items[len(s.items)-1]
    s.items = s.items[:len(s.items)-1]
    return item, true
}

func (s *Stack[T]) Peek() (T, bool) {
    if len(s.items) == 0 {
        var zero T
        return zero, false
    }
    return s.items[len(s.items)-1], true
}

func (s *Stack[T]) Len() int {
    return len(s.items)
}

// Usage
stack := &Stack[int]{}
stack.Push(1)
stack.Push(2)
val, _ := stack.Pop()  // 2
```

## Building a Queue

*Generic queue*

```go
type Queue[T any] struct {
    items []T
}

func (q *Queue[T]) Enqueue(item T) {
    q.items = append(q.items, item)
}

func (q *Queue[T]) Dequeue() (T, bool) {
    if len(q.items) == 0 {
        var zero T
        return zero, false
    }
    item := q.items[0]
    q.items = q.items[1:]
    return item, true
}

func (q *Queue[T]) IsEmpty() bool {
    return len(q.items) == 0
}
```

## Exercises

Progress through each section in order, or jump to where you need practice.

Practice individual concepts you just learned.

<div id="warmups-container">
            <noscript><p class="js-required">JavaScript is required for the interactive exercises.</p></noscript>
            </div>

### 💪 Challenges

Combine concepts and learn patterns. Each challenge has multiple variants at different difficulties.

<div id="challenges-container">
            <noscript><p class="js-required">JavaScript is required for the interactive exercises.</p></noscript>
            </div>

## Module 5 Summary

- **Slices** have length AND capacity
- **Slicing shares memory** — use copy() for independence
- **Maps iterate randomly** — sort keys if order matters
- **Set = map[T]struct{}**
- **Stack and Queue** built from slices with generics
