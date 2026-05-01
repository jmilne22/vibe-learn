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

Go copies everything by default. When you pass a struct to a function, the function gets a copy. Changes to the copy don't affect the original. The fix is to pass a pointer:

<variations runner="go">
template: |
  package main
  import "fmt"

  type Pod struct{ Name, Status string }

  func resetStatus({{SIG}}) {
      p.Status = "Pending"
  }

  func main() {
      pod := Pod{Name: "web-1", Status: "Running"}
      resetStatus({{ARG}})
      fmt.Println(pod.Status)
  }
cases:
  - name: by value
    SIG: 'p Pod'
    ARG: 'pod'
  - name: by pointer
    SIG: 'p *Pod'
    ARG: '&pod'
</variations>

The "by value" version compiles and runs without error — but the assignment lands on the copy that lives only inside `resetStatus`, and is thrown away when the function returns. The "by pointer" version takes the address with `&pod`; `p.Status = "Pending"` writes through that address to the original struct, so the change sticks after the call returns.

*Python comparison*

```python
# Python: mutable objects (lists, dicts, class instances) are always references
# Go: you choose. Value = safe copy. Pointer = shared, mutable.
```

### Pointer Aliasing

<predict prompt="What does this print?">
```go
type Pod struct{ Status string }

func main() {
    a := &Pod{Status: "Running"}
    b := a
    b.Status = "Pending"
    fmt.Println(a.Status)
}
```
```
Pending
```
</predict>

`b := a` doesn't copy the struct — it copies the *pointer*. Both `a` and `b` now hold the same address, so writing through `b` is the same as writing through `a`. To get a real, independent copy of the struct, dereference and assign: `b := *a` produces a fresh `Pod` whose modifications don't affect `a`.

This is why pointers are powerful and dangerous in equal measure. Every function call that takes `*Pod` is potentially a function that can change your `Pod` out from under you — including changes you didn't ask for, on a separate goroutine you didn't know was running.

### Pointers to Local Variables

<predict prompt="What does this print?">
```go
type Pod struct{ Status string }

func newPod() *Pod {
    p := Pod{Status: "Running"}
    return &p
}

func main() {
    fmt.Println(newPod().Status)
}
```
```
Running
```
</predict>

If you're coming from C, this looks like a use-after-free bug — `p` is a local variable that goes out of scope when `newPod` returns. In Go it's safe: the compiler's *escape analysis* notices that `p`'s address leaves the function, so it allocates `p` on the heap instead of the stack. The garbage collector keeps it alive as long as any pointer references it. This is why `return &Pod{...}` is the idiomatic Go constructor pattern — no manual `malloc`, no risk of dangling pointers.

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

> **Slices, maps, and channels** are already reference types internally. You don't need to pass `*[]Pod` — just `[]Pod` is fine for reading and even for mutating elements. But the slice *header* (`{ptr, len, cap}`) is itself a value, so a function that appends has to either return the new slice or take a pointer to it.

<variations runner="go">
template: |
  package main
  import "fmt"

  func addItem({{SIG}}, item string) {
      {{ASSIGN}}
  }

  func main() {
      items := []string{"a", "b"}
      addItem({{ARG}}, "c")
      fmt.Println(items)
  }
cases:
  - name: by value
    SIG: 's []string'
    ASSIGN: 's = append(s, item)'
    ARG: 'items'
  - name: by pointer
    SIG: 's *[]string'
    ASSIGN: '*s = append(*s, item)'
    ARG: '&items'
</variations>

In the "by value" case, the local `s` gets the result of `append`, but the caller's `items` is never updated. In the "by pointer" case, `&items` passes the address of the slice header; `*s = append(...)` writes through that address, so the caller sees the new slice. The idiom most Go code uses is to skip the pointer and return the new slice instead — `items = addItem(items, "c")` — but `*[]T` is the right tool when the function genuinely needs to grow the caller's slice in place.

<div class="inline-exercises" data-concept="Pointers"></div>
