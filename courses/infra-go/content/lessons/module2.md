Infrastructure is about modeling real things: pods, services, deployments, configs. This module teaches you to model them in Go and write behavior that attaches to your models.

---

## Structs as Infrastructure Models

A struct is a typed collection of fields. In infra code, nearly everything is a struct — a pod has a name, namespace, and resource limits; a service has ports and selectors; a config entry has a key, value, and source.

### Defining Structs

```go
type Pod struct {
    Name      string
    Namespace string
    Status    string
    MemoryMB  int
    CPUM      int // millicores
}

type Service struct {
    Name      string
    Namespace string
    Port      int
    Target    int
    Selector  map[string]string
}
```

Field names are capitalized (exported). Lowercase = unexported (package-private). In infra code, you'll almost always export fields because structs get passed between packages, serialized to JSON/YAML, etc.

### Struct Literals

```go
// Named fields — always use this style
pod := Pod{
    Name:      "web-1",
    Namespace: "production",
    Status:    "Running",
    MemoryMB:  512,
    CPUM:      250,
}

// You CAN use positional: Pod{"web-1", "production", "Running", 512, 250}
// But don't. It breaks when fields are added and is unreadable.
```

### Zero Values

Every field gets its zero value if you don't set it:

```go
p := Pod{Name: "web-1"}
// p.Namespace == ""     (zero value for string)
// p.MemoryMB == 0       (zero value for int)
// p.Status == ""         (zero value for string)
```

This matters in infra code — is `MemoryMB == 0` "not set" or "zero bytes requested"? This ambiguity is why we need constructors and validation.

*Python comparison*

```python
# Python: @dataclass handles defaults, __init__, __repr__ automatically
# Go: you write it yourself. More boilerplate, more control.

@dataclass
class Pod:
    name: str
    namespace: str = "default"
    memory_mb: int = 0
```

### Nested Structs

Real infra models are nested. A pod has resource limits. A deployment has a pod template.

```go
type Resources struct {
    MemoryMB int
    CPUM     int
}

type Pod struct {
    Name      string
    Namespace string
    Status    string
    Resources Resources // nested struct
    Labels    map[string]string
}

// Access nested fields directly
pod := Pod{
    Name:      "web-1",
    Resources: Resources{MemoryMB: 512, CPUM: 250},
    Labels:    map[string]string{"app": "web", "env": "prod"},
}
fmt.Println(pod.Resources.MemoryMB) // 512
```

## Structs Unlock Sorting

In Module 1, you learned the **count → sort-keys → format** pattern: count with a map, sort the keys alphabetically, and format. That's powerful, but it has a limitation — you can only sort by key, not by value. If you want "top 5 endpoints by request count," alphabetical order is useless.

The fix: bundle each key-value pair into a struct, put the structs in a slice, and sort with `sort.Slice` using any field you want.

### The Upgrade: Count → Struct → Sort → Format

```go
// Module 1 version: sorted alphabetically (keys only)
keys := make([]string, 0, len(counts))
for k := range counts {
    keys = append(keys, k)
}
sort.Strings(keys)

// Module 2 upgrade: sorted by count descending
type entry struct {
    label string
    count int
}
entries := make([]entry, 0, len(counts))
for k, v := range counts {
    entries = append(entries, entry{k, v})
}
sort.Slice(entries, func(i, j int) bool {
    return entries[i].count > entries[j].count
})
```

The struct lets `sort.Slice` compare by `.count` while keeping `.label` attached. Without the struct, the key and value drift apart when you sort.

### Zipping Parallel Slices

Same idea applies when you have parallel slices — names and values that go together by index. Zip them into structs so they stay paired:

```go
names    := []string{"web-1", "api-1", "db-1", "cache-1"}
memoryMB := []int{512, 256, 2048, 1024}

type pod struct {
    name string
    mem  int
}
pods := make([]pod, len(names))
for i := range names {
    pods[i] = pod{names[i], memoryMB[i]}
}

// Now sort by memory descending — names stay attached
sort.Slice(pods, func(i, j int) bool {
    return pods[i].mem > pods[j].mem
})

// Top 3 by memory:
for _, p := range pods[:3] {
    fmt.Printf("%-10s %dMB\n", p.name, p.mem)
}
```

Without the struct, sorting `memoryMB` would rearrange the values but leave `names` untouched — the pairing breaks. This is exactly the "draw the rest of the owl" problem from Module 1's sorting section, and now you have the tool to solve it.

---

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

Go copies everything by default. When you pass a struct to a function, the function gets a copy. Changes to the copy don't affect the original.

```go
// Pass by value — gets a COPY
func resetStatus(p Pod) {
    p.Status = "Pending"  // only changes the copy
}

pod := Pod{Name: "web-1", Status: "Running"}
resetStatus(pod)
fmt.Println(pod.Status)  // still "Running"!

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

```go
var p *Pod            // declared but not assigned
fmt.Println(p)        // <nil>
fmt.Println(p == nil) // true

// DANGER: using a nil pointer crashes
// fmt.Println(p.Name)  // panic: nil pointer dereference

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

## Constructors & Validation

Go has no constructors as a language feature. The convention is a `New*` function that returns `(T, error)`.

```go
func NewPod(name, namespace string, memMB, cpuM int) (Pod, error) {
    if name == "" {
        return Pod{}, fmt.Errorf("pod name cannot be empty")
    }
    if namespace == "" {
        namespace = "default"
    }
    if memMB < 0 {
        return Pod{}, fmt.Errorf("memory cannot be negative: %d", memMB)
    }
    return Pod{
        Name:      name,
        Namespace: namespace,
        Status:    "Pending",
        Resources: Resources{MemoryMB: memMB, CPUM: cpuM},
    }, nil
}
```

**Why this pattern matters:** In infra, invalid data causes outages. A pod with empty name, a service with port 0, a config with negative TTL — these are bugs that should be caught at construction time, not at deploy time.

*Python comparison*

```python
# Python: validation in __init__ or __post_init__
@dataclass
class Pod:
    name: str
    def __post_init__(self):
        if not self.name:
            raise ValueError("name required")

# Go: validation in NewPod() constructor
# Same idea, different mechanism.
```

## Methods & Receivers

Methods are functions attached to a type. In Go, you define them outside the struct — they're just functions with a receiver parameter.

### Value Receivers

```go
// Value receiver — gets a COPY of the struct
func (p Pod) FullName() string {
    return p.Namespace + "/" + p.Name
}

func (p Pod) IsRunning() bool {
    return p.Status == "Running"
}

// Usage
pod := Pod{Name: "web-1", Namespace: "production", Status: "Running"}
fmt.Println(pod.FullName())  // "production/web-1"
fmt.Println(pod.IsRunning()) // true
```

### Pointer Receivers

```go
// Pointer receiver — can MODIFY the original struct
func (p *Pod) SetStatus(status string) {
    p.Status = status
}

func (p *Pod) AddLabel(key, value string) {
    if p.Labels == nil {
        p.Labels = make(map[string]string)
    }
    p.Labels[key] = value
}

// Usage
pod := Pod{Name: "web-1", Status: "Pending"}
pod.SetStatus("Running")  // modifies pod directly
fmt.Println(pod.Status)    // "Running"
```

### When to Use Which

| Use value receiver | Use pointer receiver |
|---|---|
| Method only reads fields | Method modifies fields |
| Struct is small (< 5 fields) | Struct is large |
| You want immutable semantics | You need mutation |

> **Practical rule:** If *any* method on a type needs a pointer receiver, use pointer receivers for *all* methods on that type. Mixing receivers is confusing and causes subtle interface satisfaction bugs.

*Python comparison*

```python
# Python: all methods get `self` (always a reference, always mutable)
class Pod:
    def full_name(self):
        return f"{self.namespace}/{self.name}"

# Go: you explicitly choose value vs pointer receiver.
# More typing, but you know exactly what can mutate.
```

## Composition Over Inheritance

Go has no inheritance. Instead, you embed one struct inside another. The embedded struct's fields and methods get "promoted" — they're accessible directly on the outer struct.

### Embedding

```go
type Metadata struct {
    Name      string
    Namespace string
    Labels    map[string]string
}

func (m Metadata) FullName() string {
    return m.Namespace + "/" + m.Name
}

type Pod struct {
    Metadata           // embedded — no field name
    Status   string
    Resources Resources
}

type Service struct {
    Metadata          // same Metadata, different resource
    Port     int
    Target   int
}

// Promoted fields — access directly
pod := Pod{
    Metadata: Metadata{
        Name:      "web-1",
        Namespace: "production",
        Labels:    map[string]string{"app": "web"},
    },
    Status: "Running",
}

fmt.Println(pod.Name)       // "web-1" — promoted from Metadata
fmt.Println(pod.FullName()) // "production/web-1" — promoted method
```

This is how the real Kubernetes Go types work. `ObjectMeta` is embedded in every resource type.

### Why Composition

```go
// Python/Java instinct: class Pod(Resource) — inheritance
// Go: embed the shared parts, compose the rest

// This lets you:
// 1. Share fields/methods without a type hierarchy
// 2. Embed multiple types (no diamond problem)
// 3. Override promoted methods by defining your own
```

## Interfaces the Go Way

Go interfaces are satisfied *implicitly*. If your type has the right methods, it satisfies the interface. No `implements` keyword.

### Small Interfaces

```go
// The most important Go interfaces are tiny
type Stringer interface {
    String() string
}

type Reader interface {
    Read(p []byte) (n int, err error)
}

type error interface {
    Error() string
}
```

One or two methods. That's the Go way. Small interfaces are easy to satisfy, easy to test, easy to compose.

### Defining Your Own

Think about what behavior you need, not what types you have.

```go
// Any resource that can report its health
type HealthChecker interface {
    IsHealthy() bool
}

// Any resource that can be validated
type Validator interface {
    Validate() error
}

// Any resource with a name
type Named interface {
    FullName() string
}
```

### Implementing Interfaces

```go
// Pod satisfies HealthChecker
func (p Pod) IsHealthy() bool {
    return p.Status == "Running"
}

// Pod satisfies Validator
func (p Pod) Validate() error {
    if p.Name == "" {
        return fmt.Errorf("name is required")
    }
    if p.Namespace == "" {
        return fmt.Errorf("namespace is required")
    }
    return nil
}

// Pod satisfies Named (via embedded Metadata.FullName())
// No extra code needed — promotion handles it

// Now use them:
func checkAll(checkers []HealthChecker) []string {
    var unhealthy []string
    for _, c := range checkers {
        if !c.IsHealthy() {
            unhealthy = append(unhealthy, fmt.Sprintf("%v", c))
        }
    }
    return unhealthy
}
```

> **"Accept interfaces, return structs."** This is the most important Go API design rule. Functions that accept interfaces are flexible (any type that satisfies the interface works). Functions that return concrete types are predictable (callers know exactly what they get).

### The Empty Interface

```go
// interface{} (or 'any' since Go 1.18) accepts any type
func printAnything(v any) {
    fmt.Println(v)
}
```

Use sparingly. Every `any` is a place where the compiler can't help you. In infra code, you'll encounter it in JSON parsing, config libraries, and plugin systems.

*Python comparison*

```python
# Python: duck typing — if it has the method, it works (at runtime)
# Go: duck typing — if it has the method, it works (at compile time)
# Same philosophy, but Go catches the errors before you deploy.

# Python:
class Pod:
    def is_healthy(self):
        return self.status == "Running"

# Works because Python checks at call time.
# Go checks at compile time — same flexibility, earlier errors.
```

## Type Assertions & Switches

When you have an interface value and need the concrete type underneath.

### Comma-Ok Pattern

```go
var c HealthChecker = Pod{Name: "web-1", Status: "Running"}

// Type assertion with comma-ok
pod, ok := c.(Pod)
if ok {
    fmt.Println(pod.Resources.MemoryMB) // access Pod-specific fields
}

// Without comma-ok — panics if wrong type
pod := c.(Pod) // dangerous in production code
```

### Type Switch

When an interface could hold multiple concrete types:

```go
type Resource interface {
    FullName() string
}

func describe(r Resource) string {
    switch v := r.(type) {
    case Pod:
        return fmt.Sprintf("Pod %s (%s, %dMB)", v.FullName(), v.Status, v.Resources.MemoryMB)
    case Service:
        return fmt.Sprintf("Service %s (port %d→%d)", v.FullName(), v.Port, v.Target)
    default:
        return fmt.Sprintf("Unknown resource: %s", v.FullName())
    }
}
```

**When to use type switches vs redesign:** If you find yourself writing type switches in many places, you probably need a better interface. Type switches are appropriate at boundaries — serialization, logging, CLI output — not in core logic.

---

## Exercises

Practice individual concepts with quick drills, then tackle multi-step challenges.

<div id="warmups-container">
    <noscript><p class="js-required">JavaScript is required for the interactive exercises.</p></noscript>
</div>

### Challenges

Apply what you learned to infra-themed problems. Each challenge has multiple variants — shuffle to keep things fresh.

<div id="challenges-container">
    <noscript><p class="js-required">JavaScript is required for the interactive exercises.</p></noscript>
</div>
