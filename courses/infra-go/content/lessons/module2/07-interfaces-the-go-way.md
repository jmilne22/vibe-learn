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

<div class="inline-exercises" data-concept="Interfaces"></div>
