Go has testing baked right into the language and toolchain — no external framework required. The `testing` package ships with the standard library, and `go test` is a first-class command. Here's the deal: the testing package is intentionally minimal. Assert libraries like `testify` exist, but the Go community overwhelmingly prefers explicit `if` checks. It feels verbose at first, but it gives you complete control over error messages and keeps your tests readable without learning a DSL.

## Writing Tests

*math.go*

```go
package math

func Add(a, b int) int {
    return a + b
}
```

*math_test.go*

```go
package math

import "testing"

func TestAdd(t *testing.T) {
    result := Add(2, 3)
    if result != 5 {
        t.Errorf("Add(2, 3) = %d; want 5", result)
    }
}
```

*Run tests*

```bash
$ go test ./...
$ go test -v ./...           # Verbose
$ go test -run TestAdd ./... # Run specific test
$ go test -cover ./...       # With coverage
```

## Table-Driven Tests

The Go way to test multiple cases without repetition.

*Table-driven test*

```go
func TestAdd(t *testing.T) {
    tests := []struct {
        name     string
        a, b     int
        expected int
    }{
        {"positive", 2, 3, 5},
        {"negative", -1, -2, -3},
        {"zero", 0, 0, 0},
        {"mixed", -5, 10, 5},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            t.Helper()
            result := Add(tt.a, tt.b)
            if result != tt.expected {
                t.Errorf("Add(%d, %d) = %d; want %d",
                    tt.a, tt.b, result, tt.expected)
            }
        })
    }
}
```

> **`t.Helper()`:** Calling `t.Helper()` marks a function as a test helper. When a test fails inside a helper, Go reports the *caller's* line number instead of the helper's — much easier to track down failures.

### Parallel Tests

If your table-driven test cases are independent (no shared mutable state), you can speed things up with `t.Parallel()`. Each subtest runs concurrently instead of sequentially.

*Parallel subtests*

```go
for _, tt := range tests {
    t.Run(tt.name, func(t *testing.T) {
        t.Parallel() // This subtest now runs concurrently
        result := Add(tt.a, tt.b)
        if result != tt.expected {
            t.Errorf("Add(%d, %d) = %d; want %d",
                tt.a, tt.b, result, tt.expected)
        }
    })
}
```

> **When to use `t.Parallel()`:** It shines for I/O-bound or slow tests. Don't use it when subtests share state like a database connection or a temporary file — you'll get flaky tests and race conditions.

## Testing with Interfaces (Mocking)

*Interface-based testing*

```go
// Define interface for dependencies
type UserStore interface {
    GetUser(id string) (*User, error)
}

// Service uses the interface
type UserService struct {
    store UserStore
}

func (s *UserService) GetUserName(id string) (string, error) {
    user, err := s.store.GetUser(id)
    if err != nil {
        return "", err
    }
    return user.Name, nil
}

// Mock for testing
type mockStore struct {
    users map[string]*User
}

func (m *mockStore) GetUser(id string) (*User, error) {
    if u, ok := m.users[id]; ok {
        return u, nil
    }
    return nil, ErrNotFound
}

func TestGetUserName(t *testing.T) {
    mock := &mockStore{
        users: map[string]*User{
            "1": {Name: "Alice"},
        },
    }
    svc := &UserService{store: mock}

    name, err := svc.GetUserName("1")
    if err != nil {
        t.Fatal(err)
    }
    if name != "Alice" {
        t.Errorf("got %s, want Alice", name)
    }
}
```

## Benchmarks

Go's testing package also handles benchmarks — no separate tool needed. A benchmark function starts with `Benchmark` and takes a `*testing.B` instead of `*testing.T`. The key thing to understand is `b.N`: Go automatically adjusts this value, running your code enough times to get a statistically reliable measurement.

*A simple benchmark*

```go
func BenchmarkAdd(b *testing.B) {
    for i := 0; i < b.N; i++ {
        Add(2, 3)
    }
}
```

*Running benchmarks*

```bash
$ go test -bench=. ./...            # Run all benchmarks
$ go test -bench=BenchmarkAdd ./... # Run a specific benchmark
$ go test -bench=. -benchmem ./...  # Include memory allocation stats
```

Here's the deal: benchmarks only run when you pass `-bench`. A plain `go test` skips them entirely, so they never slow down your regular test suite.

If your benchmark has expensive setup that you don't want included in the measurement, use `b.ResetTimer()`:

*Benchmark with setup*

```go
func BenchmarkProcess(b *testing.B) {
    data := loadLargeTestFile() // Expensive setup
    b.ResetTimer()              // Reset — only measure the loop
    for i := 0; i < b.N; i++ {
        Process(data)
    }
}
```

> **Gotcha:** Don't use `b.ResetTimer()` inside the loop — it resets the *entire* timer each iteration, giving you garbage results. Put it once, right before the loop starts.

## Useful Testing Patterns

### Race Detection

Go ships with a built-in race detector. Run your tests with the `-race` flag and Go instruments your code at compile time to catch concurrent access bugs:

```bash
$ go test -race ./...
```

This is slower than a normal test run, but it catches real concurrency bugs that would otherwise be nearly impossible to reproduce. Many teams run it in CI on every commit.

### The `testdata/` Directory

Need test fixtures — JSON files, golden outputs, sample configs? Put them in a `testdata/` directory inside your package. Go tooling ignores `testdata/` during builds, so it won't bloat your binary. Access files with relative paths from your test:

```go
data, err := os.ReadFile("testdata/input.json")
```

### Skipping Slow Tests

Some tests are slow — integration tests, tests that hit real services. Mark them so they can be skipped during quick development cycles:

```go
func TestSlowIntegration(t *testing.T) {
    if testing.Short() {
        t.Skip("skipping slow test in short mode")
    }
    // ... expensive test logic
}
```

```bash
$ go test -short ./... # Skips tests that check testing.Short()
```

> **Tip:** Use `-short` during local development for fast feedback, and run the full suite in CI.

## Exercises

Progress through each section in order, or jump to where you need practice.

Practice individual concepts you just learned.

<div id="warmups-container">
            <noscript><p class="js-required">JavaScript is required for the interactive exercises.</p></noscript>
            </div>

### Challenges

Combine concepts and learn patterns. Each challenge has multiple variants at different difficulties.

<div id="challenges-container">
            <noscript><p class="js-required">JavaScript is required for the interactive exercises.</p></noscript>
            </div>

## Module 10 Summary

- **Test files** end in `_test.go`, same package
- **testing.T** -- `t.Errorf`, `t.Fatal`, `t.Run`
- **Table-driven tests** -- the Go standard pattern
- **`t.Helper()`** marks helpers so failures report the caller's line
- **`t.Parallel()`** runs independent subtests concurrently
- **Subtests** with `t.Run` for organized output
- **Test coverage** with `go test -cover`
- **Interfaces for mocking** -- easy dependency injection
- **Benchmarks** with `testing.B` and `go test -bench=.`
- **Race detection** with `go test -race`
- **`testdata/`** directory for test fixtures
- **`testing.Short()`** to skip slow tests with `-short`
