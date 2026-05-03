## Interfaces the Go Way

*A config parser that takes `io.Reader` works on a file in production and a `strings.NewReader` in tests — same code, no temp files. That's the payoff of small implicit interfaces.*

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

### io.Reader / io.Writer — The Pair You'll Use Constantly

The single highest-ROI interfaces in the standard library:

```go
type Reader interface {
    Read(p []byte) (n int, err error)
}

type Writer interface {
    Write(p []byte) (n int, err error)
}
```

One method each. Half of the standard library and half of every infra tool you'll ever read on GitHub takes one of these. Why it matters: a function that takes `io.Reader` doesn't care whether the bytes come from a file, an HTTP response, an in-memory buffer, a network socket, or stdin — they all satisfy the interface.

```go
// Real, idiomatic config parser — accepts anything readable
func ParseConfig(r io.Reader) (Config, error) {
    data, err := io.ReadAll(r)
    if err != nil {
        return Config{}, fmt.Errorf("reading config: %w", err)
    }
    var cfg Config
    return cfg, yaml.Unmarshal(data, &cfg)
}

// Production: pass the file
f, _ := os.Open("/etc/app.yaml")
defer f.Close()
cfg, err := ParseConfig(f)

// Tests: pass an in-memory string — no temp files needed
cfg, err := ParseConfig(strings.NewReader("name: test\nport: 8080\n"))

// HTTP middleware: pass the request body directly
cfg, err := ParseConfig(r.Body)
```

Three call sites, one function, zero plumbing. The test variant is the one you'll appreciate every day — `strings.NewReader` and `bytes.NewBuffer` exist precisely because so much of the standard library takes `io.Reader`. If you write `func ParseConfig(path string)`, you've made the function untestable without touching the filesystem.

The same pattern applies to output via `io.Writer`:

```go
func WriteReport(w io.Writer, report Report) error {
    _, err := fmt.Fprintf(w, "...")
    return err
}

// Production: write to stdout, a file, or http.ResponseWriter
WriteReport(os.Stdout, report)

// Tests: write to a buffer, then assert on its contents
var buf bytes.Buffer
WriteReport(&buf, report)
if !strings.Contains(buf.String(), "expected") { /* fail */ }
```

**Rule of thumb**: any function that consumes byte input should take `io.Reader`. Any function that produces byte output should take `io.Writer`. Reach for `string` or `[]byte` only when the data is already in memory and the function genuinely owns it.

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
