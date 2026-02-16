This is where you stop vibe coding. After this module, everything you write has tests. You'll understand errors deeply enough to handle them properly instead of ignoring them.

---

## Errors as Values

In Go, errors are just values that implement one interface:

```go
type error interface {
    Error() string
}
```

That's it. No stack traces, no exceptions, no try/catch. An error is a value you return, check, and pass around like any other value.

### Creating Errors

```go
import (
    "errors"
    "fmt"
)

// Simple error — when you just need a message
err := errors.New("connection refused")

// Formatted error — when you need context
err := fmt.Errorf("failed to connect to %s:%d", host, port)
```

### The if err != nil Pattern

You'll write this hundreds of times. Get comfortable with it.

```go
pod, err := fetchPod("web-1", "production")
if err != nil {
    return fmt.Errorf("fetching pod: %w", err)
}
// use pod — only reachable if err was nil
```

**Why not exceptions?** In infrastructure code, almost every operation can fail: network calls, file reads, config parsing, API requests. Exceptions make the failure path invisible — you don't know what can throw until it does. Go makes every failure explicit in the return type. You can't accidentally ignore an error without deliberately writing `_ =` or skipping the return value.

*Python comparison*

```python
# Python: failure is invisible until it explodes
try:
    pod = fetch_pod("web-1", "production")
except ConnectionError:
    # What if there's also a TimeoutError? JSONDecodeError?
    # You find out in production.
    pass

# Go: every failure is visible in the function signature
# func fetchPod(name, ns string) (Pod, error)
# You MUST handle the error — or explicitly ignore it.
```

### Errors in Practice

```go
// Don't: ignore errors
data, _ := os.ReadFile("config.yaml")  // silent failure

// Do: handle them
data, err := os.ReadFile("config.yaml")
if err != nil {
    return fmt.Errorf("reading config: %w", err)
}

// Don't: check err twice or in weird order
err := doSomething()
result := useResult()  // BUG: using result before checking err
if err != nil { ... }

// Do: check immediately after the call
result, err := doSomething()
if err != nil {
    return err
}
// now use result
```

## Wrapping & Unwrapping

Raw errors lose context as they bubble up. Wrapping adds context at each layer.

### fmt.Errorf with %w

```go
func loadConfig(path string) (Config, error) {
    data, err := os.ReadFile(path)
    if err != nil {
        return Config{}, fmt.Errorf("loading config %s: %w", path, err)
    }

    var cfg Config
    if err := yaml.Unmarshal(data, &cfg); err != nil {
        return Config{}, fmt.Errorf("parsing config %s: %w", path, err)
    }

    return cfg, nil
}
```

The `%w` verb wraps the original error inside the new one. The resulting error message reads like a call stack: `"loading config /etc/app.yaml: open /etc/app.yaml: no such file or directory"`.

### errors.Is — Checking for Specific Errors

```go
import "errors"

// Check if an error (or any wrapped error in the chain) matches
if errors.Is(err, os.ErrNotExist) {
    fmt.Println("file doesn't exist, creating default config")
}

// Works through wrapping:
wrapped := fmt.Errorf("loading config: %w", os.ErrNotExist)
errors.Is(wrapped, os.ErrNotExist) // true — unwraps and checks
```

**Don't use `==` for error comparison.** It doesn't check wrapped errors:

```go
// Wrong — misses wrapped errors
if err == os.ErrNotExist { ... }

// Right — checks the entire chain
if errors.Is(err, os.ErrNotExist) { ... }
```

### errors.As — Extracting Typed Errors

When you need the concrete error type (not just "is it this error?"):

```go
var pathErr *os.PathError
if errors.As(err, &pathErr) {
    fmt.Println("operation:", pathErr.Op)
    fmt.Println("path:", pathErr.Path)
}
```

`errors.As` unwraps the chain looking for an error that can be assigned to your target variable. Use this when you need fields from the error, not just identity.

## Sentinel & Custom Errors

### Sentinel Errors

Package-level variables for well-known error conditions:

```go
// Define at package level
var (
    ErrNotFound    = errors.New("not found")
    ErrUnauthorized = errors.New("unauthorized")
    ErrConflict    = errors.New("conflict")
)

// Use in functions
func findPod(name string) (Pod, error) {
    pod, ok := registry[name]
    if !ok {
        return Pod{}, ErrNotFound
    }
    return pod, nil
}

// Callers check with errors.Is
pod, err := findPod("web-1")
if errors.Is(err, ErrNotFound) {
    // handle missing pod specifically
}
```

Convention: sentinel error names start with `Err`. You'll see this throughout the standard library: `io.EOF`, `os.ErrNotExist`, `sql.ErrNoRows`.

### Custom Error Types

When you need more context than a string:

```go
type ValidationError struct {
    Field   string
    Message string
}

func (e *ValidationError) Error() string {
    return fmt.Sprintf("validation failed on %s: %s", e.Field, e.Message)
}

// Return it
func validatePort(port int) error {
    if port < 1 || port > 65535 {
        return &ValidationError{
            Field:   "port",
            Message: fmt.Sprintf("must be 1-65535, got %d", port),
        }
    }
    return nil
}

// Extract with errors.As
var valErr *ValidationError
if errors.As(err, &valErr) {
    fmt.Printf("field %s: %s\n", valErr.Field, valErr.Message)
}
```

### When to Use Which

| Approach | When |
|----------|------|
| `fmt.Errorf("message")` | One-off errors with no special handling |
| `fmt.Errorf("context: %w", err)` | Adding context while preserving the original |
| `var ErrFoo = errors.New(...)` | Callers need to check for this specific condition |
| `type FooError struct{...}` | Callers need structured data from the error |

## Writing Your First Tests

### Test File Convention

Tests live next to the code they test, in files ending with `_test.go`:

```
config/
├── config.go       # your code
├── config_test.go  # tests for config.go
```

### Basic Test

```go
// config_test.go
package config

import "testing"

func TestParsePort(t *testing.T) {
    port, err := ParsePort("8080")
    if err != nil {
        t.Fatalf("unexpected error: %v", err)
    }
    if port != 8080 {
        t.Errorf("got %d, want 8080", port)
    }
}

func TestParsePort_Invalid(t *testing.T) {
    _, err := ParsePort("not-a-number")
    if err == nil {
        t.Fatal("expected error for invalid port, got nil")
    }
}
```

### t.Error vs t.Fatal

| Method | Behavior |
|--------|----------|
| `t.Error(args...)` | Log failure, **continue** running this test |
| `t.Errorf(format, args...)` | Same, with formatting |
| `t.Fatal(args...)` | Log failure, **stop** this test immediately |
| `t.Fatalf(format, args...)` | Same, with formatting |

**Rule:** Use `t.Fatal` when continuing would panic or be meaningless (e.g., a nil pointer). Use `t.Error` when you want to collect multiple failures.

### Running Tests

```bash
go test ./...              # all tests, all packages
go test -v ./...           # verbose — see each test name
go test -run TestParsePort # run tests matching a pattern
go test -count=1 ./...     # bypass test cache
go test -race ./...        # detect data races
```

## Table-Driven Tests

The Go testing idiom. Instead of writing separate functions for each case, define a table:

```go
func TestParsePort(t *testing.T) {
    tests := []struct {
        name    string
        input   string
        want    int
        wantErr bool
    }{
        {name: "valid port", input: "8080", want: 8080},
        {name: "port 1", input: "1", want: 1},
        {name: "port 65535", input: "65535", want: 65535},
        {name: "zero", input: "0", wantErr: true},
        {name: "negative", input: "-1", wantErr: true},
        {name: "too high", input: "70000", wantErr: true},
        {name: "not a number", input: "abc", wantErr: true},
        {name: "empty string", input: "", wantErr: true},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            got, err := ParsePort(tt.input)
            if tt.wantErr {
                if err == nil {
                    t.Errorf("expected error, got nil")
                }
                return
            }
            if err != nil {
                t.Fatalf("unexpected error: %v", err)
            }
            if got != tt.want {
                t.Errorf("got %d, want %d", got, tt.want)
            }
        })
    }
}
```

**Why this pattern is powerful:**
- Adding a test case is one line
- Each case runs as a subtest (`t.Run`) — failures show which case failed
- Easy to test error cases alongside happy paths
- `go test -run TestParsePort/zero` runs just one case

*Python comparison*

```python
# Python: @pytest.mark.parametrize("input,expected", [...])
# Go: same idea, but it's just a struct slice + loop. No framework needed.
```

## Testing Infra Code

### Testing Validators

```go
func TestValidatePod(t *testing.T) {
    tests := []struct {
        name    string
        pod     Pod
        wantErr string  // empty means no error expected
    }{
        {
            name: "valid pod",
            pod:  Pod{Name: "web-1", Namespace: "prod", MemoryMB: 512},
        },
        {
            name:    "empty name",
            pod:     Pod{Namespace: "prod", MemoryMB: 512},
            wantErr: "name is required",
        },
        {
            name:    "negative memory",
            pod:     Pod{Name: "web-1", Namespace: "prod", MemoryMB: -1},
            wantErr: "memory must be positive",
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            err := tt.pod.Validate()
            if tt.wantErr == "" {
                if err != nil {
                    t.Fatalf("unexpected error: %v", err)
                }
                return
            }
            if err == nil {
                t.Fatal("expected error, got nil")
            }
            if !strings.Contains(err.Error(), tt.wantErr) {
                t.Errorf("error %q should contain %q", err.Error(), tt.wantErr)
            }
        })
    }
}
```

### Test Helpers

When you repeat the same assertion in many tests, extract a helper:

```go
func assertEqual(t *testing.T, got, want string) {
    t.Helper()  // marks this as a helper — errors report the CALLER's line number
    if got != want {
        t.Errorf("got %q, want %q", got, want)
    }
}
```

`t.Helper()` is critical. Without it, test failures point to the helper function, not the test that called it.

### Testing Error Types

```go
func TestFindPod_NotFound(t *testing.T) {
    _, err := findPod("nonexistent")

    // Check sentinel error
    if !errors.Is(err, ErrNotFound) {
        t.Errorf("expected ErrNotFound, got %v", err)
    }
}

func TestValidateConfig_ErrorType(t *testing.T) {
    err := validateConfig(badConfig)

    // Check custom error type
    var valErr *ValidationError
    if !errors.As(err, &valErr) {
        t.Fatalf("expected ValidationError, got %T", err)
    }
    if valErr.Field != "port" {
        t.Errorf("expected field 'port', got %q", valErr.Field)
    }
}
```

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
