## Slices: The Deep Dive

Slices are Go's workhorse. They're more complex than Python lists under the hood.

*Slice internals*

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

> **Gotcha:** <p>Slicing creates a view, not a copy. Modifying the slice modifies the original!</p>

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

> **Map Iteration:** <p>Map iteration order is random by design. If you need ordered keys, sort them separately.</p>

## Building a Set

Go doesn't have a built-in set. Use a map with empty struct values.

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

## Generics Basics

Go 1.18+ introduced generics. Write once, use with any type.

*Generic functions*

```go
// Generic function
func Min[T constraints.Ordered](a, b T) T {
    if a < b {
        return a
    }
    return b
}

// Works with any ordered type
Min(3, 5)          // 3
Min("a", "b")      // "a"
Min(3.14, 2.71)    // 2.71

// Generic Map function
func Map[T, U any](items []T, f func(T) U) []U {
    result := make([]U, len(items))
    for i, item := range items {
        result[i] = f(item)
    }
    return result
}

// Usage
nums := []int{1, 2, 3}
doubled := Map(nums, func(n int) int { return n * 2 })
// [2, 4, 6]
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
- **Generics** with [T any] or [T constraints.Ordered]
