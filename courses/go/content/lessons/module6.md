## The Problem Generics Solve

Before Go 1.18, if you wanted a function that worked with multiple types, you had two bad options: write duplicate code for every type, or use `interface{}` and lose type safety. Here's the deal: both approaches hurt.

*Pre-generics approach with interface{}*

```go
// Before generics — works, but no compile-time type safety
func MinOld(a, b interface{}) interface{} {
    // You have to type-assert, and hope for the best
    switch a := a.(type) {
    case int:
        if a < b.(int) {
            return a
        }
        return b
    case float64:
        if a < b.(float64) {
            return a
        }
        return b
    }
    panic("unsupported type")
}

result := MinOld(3, 5).(int) // manual cast back — ugly and fragile
```

That's a lot of ceremony for something simple. If someone passes a string and an int, it panics at runtime instead of failing at compile time. Don't write code like this!

> **The Fix:** Generics let you write *one* function that the compiler checks for you. No casting, no panics, no duplicated logic.

Now look at the same thing with generics — the compiler does the heavy lifting:

*Generic Min function*

```go
func Min[T constraints.Ordered](a, b T) T {
    if a < b {
        return a
    }
    return b
}

// Works with any ordered type — and it's all type-safe
Min(3, 5)          // 3
Min("a", "b")      // "a"
Min(3.14, 2.71)    // 2.71
```

The `[T constraints.Ordered]` part is a **type parameter** with a **constraint**. It tells the compiler: "T can be any type that supports ordering operators." If you try `Min([]int{1}, []int{2})`, the compiler stops you cold — slices aren't ordered.

Generics really shine when you're transforming data. Here's a `Map` function that applies any transformation to a slice, regardless of input and output types:

*Generic Map function*

```go
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

> **Two Type Parameters:** `Map` uses *both* `T` (input type) and `U` (output type). The `any` constraint means there are no restrictions — you could map ints to strings, structs to bools, whatever you need.

## Type Parameters and Constraints

Type parameters let you write generic types and functions. Constraints limit what types are allowed — and picking the right constraint is half the battle.

Here's a quick tour of the built-in constraints and how to build your own:

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

### The `~` Operator (Underlying Types)

Notice the `~` in `~int`, `~float64` above? That tilde is doing important work. Without it, only the *exact* type matches. With `~`, any type whose **underlying type** matches is also accepted.

*Why ~ matters*

```go
type Celsius float64
type Fahrenheit float64

// Without ~: only accepts plain float64
type StrictFloat interface {
    float64
}

// With ~: accepts float64, Celsius, Fahrenheit, and any other type
// defined as float64 under the hood
type FlexFloat interface {
    ~float64
}

func Average[T FlexFloat](vals []T) T {
    var sum T
    for _, v := range vals {
        sum += v
    }
    return sum / T(len(vals))
}

temps := []Celsius{20.0, 22.5, 19.8}
Average(temps) // Works! Celsius has underlying type float64
```

> **Rule of Thumb:** Almost always use `~` in your constraints. You rarely want to exclude named types that are built on top of a base type.

### `comparable` vs `any`

These two get confused a lot, so here's the deal: `comparable` means the type supports `==` and `!=`. That sounds broad, but some types are *not* comparable — slices, maps, and functions. You can't use `==` on them, period.

*When to use comparable*

```go
// This needs comparable — we're using ==
func Contains[T comparable](items []T, target T) bool {
    for _, item := range items {
        if item == target {
            return true
        }
    }
    return false
}

Contains([]string{"a", "b"}, "b") // true

// This only needs any — no equality check
func First[T any](items []T) (T, bool) {
    if len(items) == 0 {
        var zero T
        return zero, false
    }
    return items[0], true
}
```

> **Gotcha:** If your function never uses `==` or `!=`, don't constrain it to `comparable`. Use `any` instead — it's more flexible and lets callers pass slices-of-slices, maps, or anything else.

## Generic Data Structures

Generics shine when building reusable data structures. Before 1.18, you'd either copy-paste your linked list for every type or use `interface{}` and cast everywhere. Now you write it once, and the compiler keeps everything type-safe.

Here's a linked list that works with any type — notice how `Push` and `Pop` both stay fully typed:

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

> **Gotcha — Zero Values:** Notice the `var zero T` pattern in `Pop`. When `T` is generic, you can't just write `return nil, false` — `nil` isn't valid for value types like `int`. Declaring `var zero T` gives you the zero value for whatever `T` happens to be.

## Generic Utility Functions

These are the bread-and-butter functions you'll reach for constantly. Filter, Reduce, and Contains follow patterns you've seen in other languages — but in Go, generics let you write them once and reuse them with full type safety.

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

## When NOT to Use Generics

Generics are powerful, but they're not always the right tool. Here's when you should skip them:

**You only have one concrete type.** If your function only ever works with `int`, just use `int`. Writing `func DoThing[T any](x T)` when `T` is always `string` adds complexity for zero benefit. Keep it simple.

**Interfaces already solve your problem.** If you need different types to share behavior (like `fmt.Stringer` or `io.Reader`), that's what interfaces are for. Don't reach for generics when a well-known interface does the job — interfaces are more idiomatic and easier to read.

**It makes the code harder to understand.** If you find yourself writing three levels of nested type parameters and your teammates need a PhD to read the function signature, step back. Readability matters more than cleverness.

> **A Good Test:** Ask yourself, "Would I actually call this function with more than one type?" If the answer is no, skip generics. If the answer is "maybe someday," still skip them — you can always add generics later when the need is real.

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
