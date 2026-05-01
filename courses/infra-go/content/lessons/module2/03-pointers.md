## Pointers

In Python, everything is a reference behind the scenes. In Go, you choose explicitly. A **pointer** holds a memory address instead of a value directly.

### The Two Operators

```go
x := 42

// & = "address of" — get the memory address
p := &x        // p is *int (pointer to int)
fmt.Println(p)  // 0xc0000b4008 (some address)

// * = "dereference" — get the value at the address
fmt.Println(*p) // 42

// Modify through the pointer
*p = 100
fmt.Println(x)  // 100 — x changed!
```

> **Memory trick:** `&` = "get **A**ddress" (`&` looks like A). `*` = "go through" the pointer to the value.

### Pass by Value vs Pass by Pointer

<predict prompt="What does this print?">
```go
type Pod struct{ Name, Status string }

func resetStatus(p Pod) {
    p.Status = "Pending"
}

pod := Pod{Name: "web-1", Status: "Running"}
resetStatus(pod)
fmt.Println(pod.Status)
```
```
Running
```
</predict>

Go copies everything by default. When you pass a struct to a function, the function gets a copy. Changes to the copy don't affect the original. To actually modify the caller's value, take a pointer:

```go
// Pass by pointer — gets the ADDRESS
func resetStatusPtr(p *Pod) {
    p.Status = "Pending"  // changes the original
}

resetStatusPtr(&pod)
fmt.Println(pod.Status)  // "Pending"
```

*Python comparison*

```python
# Python: mutable objects (lists, dicts, class instances) are always references
# Go: you choose. Value = safe copy. Pointer = shared, mutable.
```

### When to Use Pointers

**Use a pointer when:**

1. You need to modify the original value
2. The struct is large — avoids copying
3. You need to express "nothing" (nil)
4. Consistency — if any method needs a pointer receiver, use pointers for all

**Use a value when:**

1. You only read the data
2. The struct is small (fewer than 5 fields)
3. The zero value is meaningful
4. You want immutability guarantees

```go
// ✓ Pointer — modifies the struct
func (p *Pod) SetStatus(s string) { p.Status = s }

// ✓ Value — just reads fields, small struct
func (p Pod) FullName() string { return p.Namespace + "/" + p.Name }

// ✓ Pointer — large struct, avoid copying
func processMetrics(m *MetricsSnapshot) { /* ... */ }

// ✗ Unnecessary pointer — int is tiny
func double(x *int) int { return *x * 2 }
// ✓ Just take the value
func double(x int) int { return x * 2 }
```

### nil — The Absence of a Value

A pointer that hasn't been assigned points to nothing — it's `nil`. This is Go's version of Python's `None`, but only for pointers, slices, maps, channels, interfaces, and functions.

<predict prompt="What happens when this runs?">
```go
var p *Pod
fmt.Println(p == nil)
fmt.Println(p.Name)
```
```
true
panic: runtime error: invalid memory address or nil pointer dereference
```
</predict>

`p == nil` is fine — comparing to nil is always safe. But `p.Name` follows the pointer to read the struct's field, and there's no struct to read. This is the most common crash in Go infrastructure code: an API call returns nil, you forget to check, and the next field access panics.

```go
// Always check first
if p != nil {
    fmt.Println(p.Name)
}
```

**Nil pointer dereferences** are the most common crash in Go. In infra code, they usually happen when an API returns `nil` and you forget to check.

```go
// Common infra pattern: API lookup that might return nothing
func FindPod(name string, pods []*Pod) *Pod {
    for _, p := range pods {
        if p.Name == name {
            return p
        }
    }
    return nil  // not found
}

pod := FindPod("web-99", pods)
if pod == nil {
    log.Fatal("pod not found")
}
fmt.Println(pod.Status)  // safe — we checked
```

### Pointers and Constructors

A common Go pattern is returning a pointer from a constructor — it signals that the caller gets a reference to the allocated value, and methods should use pointer receivers:

```go
func NewPod(name, ns string) *Pod {
    return &Pod{
        Name:      name,
        Namespace: ns,
        Status:    "Pending",
        Labels:    make(map[string]string),
    }
}

pod := NewPod("web-1", "production")  // pod is *Pod
pod.SetStatus("Running")               // pointer receiver
```

> **Slices, maps, and channels** are already reference types internally. You don't need to pass `*[]Pod` — just `[]Pod` is fine. Appending inside a function won't grow the caller's slice though, so return the new slice if appending.

<div class="inline-exercises" data-concept="Pointers"></div>
