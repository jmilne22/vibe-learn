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

## Type Parameters and Constraints

Type parameters let you write generic types and functions. Constraints limit what types are allowed.

*Type constraints*

```go
import "golang.org/x/exp/constraints"

// Built-in constraints:
// any          — no constraint (like interface{})
// comparable   — supports == and !=
// constraints.Ordered — supports < > <= >=

// Custom constraint
type Number interface {
    ~int | ~int8 | ~int16 | ~int32 | ~int64 |
    ~float32 | ~float64
}

func Sum[T Number](nums []T) T {
    var total T
    for _, n := range nums {
        total += n
    }
    return total
}

Sum([]int{1, 2, 3})          // 6
Sum([]float64{1.1, 2.2})     // 3.3
```

## Generic Data Structures

Generics shine when building reusable data structures.

*Generic linked list*

```go
type Node[T any] struct {
    Value T
    Next  *Node[T]
}

type LinkedList[T any] struct {
    Head *Node[T]
    Len  int
}

func (ll *LinkedList[T]) Push(val T) {
    ll.Head = &Node[T]{Value: val, Next: ll.Head}
    ll.Len++
}

func (ll *LinkedList[T]) Pop() (T, bool) {
    if ll.Head == nil {
        var zero T
        return zero, false
    }
    val := ll.Head.Value
    ll.Head = ll.Head.Next
    ll.Len--
    return val, true
}
```

## Generic Utility Functions

Common patterns you'll use everywhere.

*Utility functions*

```go
// Filter returns elements matching a predicate
func Filter[T any](items []T, pred func(T) bool) []T {
    var result []T
    for _, item := range items {
        if pred(item) {
            result = append(result, item)
        }
    }
    return result
}

// Reduce folds a slice into a single value
func Reduce[T, U any](items []T, initial U, f func(U, T) U) U {
    acc := initial
    for _, item := range items {
        acc = f(acc, item)
    }
    return acc
}

// Contains checks if a slice contains an element
func Contains[T comparable](items []T, target T) bool {
    for _, item := range items {
        if item == target {
            return true
        }
    }
    return false
}

// Usage
nums := []int{1, 2, 3, 4, 5}
evens := Filter(nums, func(n int) bool { return n%2 == 0 })
// [2, 4]

sum := Reduce(nums, 0, func(acc, n int) int { return acc + n })
// 15
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

## Module 6 Summary

- **Generics** with `[T any]` or `[T constraints.Ordered]`
- **Type constraints** limit which types a generic accepts
- **Custom constraints** use interface unions with `~` for underlying types
- **Generic utilities** like Filter, Map, Reduce eliminate repetitive code
- **Generic data structures** like LinkedList work with any type
