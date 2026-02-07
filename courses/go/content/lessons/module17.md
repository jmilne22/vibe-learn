## Why Sets Matter

Tons of real problems are set problems in disguise:

- What files are in directory A but not B?
- Which users have permission X but not Y?
- What config changed between versions?
- Which items need to be added/removed to sync two lists?

If you have two lists and need to compare them, you're doing set math.

## Set Operations Visualized

Set A: {1, 2, 3, 4}
Set B: {3, 4, 5, 6}

Union (A ∪ B)

= {1, 2, 3, 4, 5, 6}

// Everything

Intersection (A ∩ B)

= {3, 4}

// In both

Difference (A - B)

= {1, 2}

// In A but not B

Difference (B - A)

= {5, 6}

// In B but not A

## Sets in Go: map[T]struct{}

Go doesn't have a built-in set type. Use a map with empty struct values.

*Basic set*

```go
// struct{} takes zero bytes — perfect for "I just need the keys"
type Set[T comparable] map[T]struct{}

// Create from slice
func NewSet[T comparable](items []T) Set[T] {
    s := make(Set[T], len(items))
    for _, item := range items {
        s[item] = struct{}{}
    }
    return s
}

// Check membership — O(1)
func (s Set[T]) Contains(item T) bool {
    _, ok := s[item]
    return ok
}

// Add item
func (s Set[T]) Add(item T) {
    s[item] = struct{}{}
}

// Convert back to slice
func (s Set[T]) ToSlice() []T {
    result := make([]T, 0, len(s))
    for item := range s {
        result = append(result, item)
    }
    return result
}
```

> **Why struct{} instead of bool?:** `map[string]bool` works but wastes 1 byte per entry. `map[string]struct{}` uses zero extra bytes. For large sets, this adds up.

## Set Operations

*Set operations*

```go
// Difference: items in A but not in B
func Difference[T comparable](a, b Set[T]) Set[T] {
    result := make(Set[T])
    for item := range a {
        if !b.Contains(item) {
            result[item] = struct{}{}
        }
    }
    return result
}

// Intersection: items in both A and B
func Intersection[T comparable](a, b Set[T]) Set[T] {
    result := make(Set[T])
    for item := range a {
        if b.Contains(item) {
            result[item] = struct{}{}
        }
    }
    return result
}

// Union: items in A or B or both
func Union[T comparable](a, b Set[T]) Set[T] {
    result := make(Set[T], len(a)+len(b))
    for item := range a {
        result[item] = struct{}{}
    }
    for item := range b {
        result[item] = struct{}{}
    }
    return result
}
```

## Comparing Two Lists

The classic "diff" problem: given two lists, what's different?

*Diff two slices*

```go
// Result of comparing two lists
type Diff[T comparable] struct {
    OnlyInA []T  // In first list but not second
    OnlyInB []T  // In second list but not first
    InBoth  []T  // In both lists
}

func Compare[T comparable](a, b []T) Diff[T] {
    setA := NewSet(a)
    setB := NewSet(b)
    
    return Diff[T]{
        OnlyInA: Difference(setA, setB).ToSlice(),
        OnlyInB: Difference(setB, setA).ToSlice(),
        InBoth:  Intersection(setA, setB).ToSlice(),
    }
}

// Usage
current := []string{"a", "b", "c"}
desired := []string{"b", "c", "d"}

diff := Compare(current, desired)
// diff.OnlyInA = ["a"]      // current has, desired doesn't
// diff.OnlyInB = ["d"]      // desired has, current doesn't
// diff.InBoth  = ["b", "c"] // both have
```

## Performance: O(n) vs O(n²)

This is why sets matter for performance.

*Naive approach — O(n²)*

```go
// DON'T DO THIS for large lists
func slowDiff(a, b []string) []string {
    var onlyInA []string
    for _, itemA := range a {
        found := false
        for _, itemB := range b {  // Loops through B for every A
            if itemA == itemB {
                found = true
                break
            }
        }
        if !found {
            onlyInA = append(onlyInA, itemA)
        }
    }
    return onlyInA
}
// 1000 items × 1000 items = 1,000,000 comparisons
```

*Set approach — O(n)*

```go
// DO THIS
func fastDiff(a, b []string) []string {
    setB := NewSet(b)  // O(n) to build
    
    var onlyInA []string
    for _, item := range a {
        if !setB.Contains(item) {  // O(1) lookup!
            onlyInA = append(onlyInA, item)
        }
    }
    return onlyInA
}
// 1000 items = ~2000 operations
```

## Sorting for Consistent Output

Maps (and therefore sets) iterate in random order. Sort before displaying.

*Sorted output*

```go
import "sort"

func (s Set[string]) SortedSlice() []string {
    result := s.ToSlice()
    sort.Strings(result)
    return result
}

// For any comparable type that's also orderable
func SortedKeys[K cmp.Ordered, V any](m map[K]V) []K {
    keys := make([]K, 0, len(m))
    for k := range m {
        keys = append(keys, k)
    }
    slices.Sort(keys)
    return keys
}
```

## Real World Applications

Places you'll use this pattern:

- **File sync** — what files to copy/delete
- **Database migrations** — what columns to add/remove
- **Permission systems** — what access to grant/revoke
- **Config management** — what changed between versions
- **Dependency resolution** — what to install/uninstall
- **Cache invalidation** — what keys are stale

Any time you're comparing "what is" vs "what should be" — that's a diff.

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

## Module 15 Summary

- **Set = map[T]struct{}** — O(1) membership test
- **Difference(A, B)** — in A but not B
- **Intersection(A, B)** — in both
- **Union(A, B)** — in either or both
- **Compare two lists** → OnlyInA, OnlyInB, InBoth
- **Always sort** before displaying for consistency
