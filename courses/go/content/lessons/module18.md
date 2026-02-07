## Test File Basics

Go has testing built in. No external frameworks needed.

*math.go*

```go
package math

func Add(a, b int) int {
    return a + b
}

func Divide(a, b int) (int, error) {
    if b == 0 {
        return 0, fmt.Errorf("division by zero")
    }
    return a / b, nil
}
```

*math_test.go*

```go
package math

import "testing"

// Test functions MUST:
// - Be in a file ending with _test.go
// - Start with Test (capital T)
// - Take *testing.T as only parameter

func TestAdd(t *testing.T) {
    result := Add(2, 3)
    if result != 5 {
        t.Errorf("Add(2, 3) = %d; want 5", result)
    }
}

func TestDivide(t *testing.T) {
    result, err := Divide(10, 2)
    if err != nil {
        t.Fatalf("unexpected error: %v", err)
    }
    if result != 5 {
        t.Errorf("Divide(10, 2) = %d; want 5", result)
    }
}

func TestDivideByZero(t *testing.T) {
    _, err := Divide(10, 0)
    if err == nil {
        t.Error("expected error for division by zero")
    }
}
```

*Running tests*

```bash
# Run all tests in current package
$ go test

# Verbose output (see each test)
$ go test -v

# Run all tests in all packages
$ go test ./...

# Run specific test by name (regex)
$ go test -run TestDivide
$ go test -run "TestDivide.*"
```

## t.Error vs t.Fatal

*When to use which*

```go
func TestSomething(t *testing.T) {
    // t.Error / t.Errorf — marks test as failed, continues running
    // Use when you want to see ALL failures
    if got != want {
        t.Errorf("got %v, want %v", got, want)
    }
    
    // t.Fatal / t.Fatalf — marks test as failed, STOPS immediately
    // Use when continuing would cause panic or meaningless errors
    result, err := DoThing()
    if err != nil {
        t.Fatalf("setup failed: %v", err)  // No point continuing
    }
    
    // t.Skip / t.Skipf — skip this test
    if os.Getenv("CI") == "" {
        t.Skip("skipping integration test in local dev")
    }
}
```

## Table-Driven Tests

The idiomatic way to test multiple cases. You'll see this everywhere in Go code.

*math_test.go*

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
            result := Add(tt.a, tt.b)
            if result != tt.expected {
                t.Errorf("Add(%d, %d) = %d; want %d", 
                    tt.a, tt.b, result, tt.expected)
            }
        })
    }
}
```

*Output*

```bash
$ go test -v
=== RUN   TestAdd
=== RUN   TestAdd/positive
=== RUN   TestAdd/negative
=== RUN   TestAdd/zero
=== RUN   TestAdd/mixed
--- PASS: TestAdd (0.00s)
    --- PASS: TestAdd/positive (0.00s)
    --- PASS: TestAdd/negative (0.00s)
    --- PASS: TestAdd/zero (0.00s)
    --- PASS: TestAdd/mixed (0.00s)
```

> **Why t.Run()?:** Subtests with `t.Run()` let you run individual cases: `go test -run TestAdd/negative`. Also makes failure output clearer.

## Testing Errors

*Error test patterns*

```go
func TestDivide(t *testing.T) {
    tests := []struct {
        name      string
        a, b      int
        want      int
        wantErr   bool
    }{
        {"valid", 10, 2, 5, false},
        {"divide by zero", 10, 0, 0, true},
    }
    
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            got, err := Divide(tt.a, tt.b)
            
            // Check error expectation
            if (err != nil) != tt.wantErr {
                t.Errorf("error = %v, wantErr = %v", err, tt.wantErr)
                return
            }
            
            // Only check result if no error expected
            if !tt.wantErr && got != tt.want {
                t.Errorf("got %d, want %d", got, tt.want)
            }
        })
    }
}

// Testing for specific error types
func TestSpecificError(t *testing.T) {
    _, err := OpenFile("nonexistent.txt")
    
    if !errors.Is(err, os.ErrNotExist) {
        t.Errorf("expected ErrNotExist, got %v", err)
    }
}

// Testing for custom error types
func TestCustomError(t *testing.T) {
    _, err := Validate(data)
    
    var validErr *ValidationError
    if !errors.As(err, &validErr) {
        t.Fatalf("expected ValidationError, got %T", err)
    }
    
    if validErr.Field != "email" {
        t.Errorf("wrong field: got %s, want email", validErr.Field)
    }
}
```

## Test Helpers

Extract common setup/assertions into helpers. Mark them with `t.Helper()`.

*Helper functions*

```go
// t.Helper() makes errors report the caller's line, not the helper's
func assertEqual(t *testing.T, got, want int) {
    t.Helper()  // IMPORTANT: marks this as helper
    if got != want {
        t.Errorf("got %d, want %d", got, want)
    }
}

func assertNoError(t *testing.T, err error) {
    t.Helper()
    if err != nil {
        t.Fatalf("unexpected error: %v", err)
    }
}

func assertError(t *testing.T, err error) {
    t.Helper()
    if err == nil {
        t.Fatal("expected error, got nil")
    }
}

// Setup helper that returns cleanup function
func setupTestDB(t *testing.T) (*DB, func()) {
    t.Helper()
    
    db, err := NewTestDB()
    if err != nil {
        t.Fatalf("failed to create test db: %v", err)
    }
    
    cleanup := func() {
        db.Close()
    }
    
    return db, cleanup
}

// Usage
func TestWithDB(t *testing.T) {
    db, cleanup := setupTestDB(t)
    defer cleanup()
    
    // ... test code ...
}
```

## t.Cleanup (Go 1.14+)

Modern alternative to returning cleanup functions.

*Using t.Cleanup*

```go
func setupTestDB(t *testing.T) *DB {
    t.Helper()
    
    db, err := NewTestDB()
    if err != nil {
        t.Fatalf("failed to create test db: %v", err)
    }
    
    // Automatically called when test finishes
    t.Cleanup(func() {
        db.Close()
    })
    
    return db
}

// Cleaner usage
func TestWithDB(t *testing.T) {
    db := setupTestDB(t)  // No defer needed!
    
    // ... test code ...
}
```

## Testing with Interfaces (Mocking)

Design for testability: depend on interfaces, not concrete types.

*service.go*

```go
// Define interface for what you need
type UserStore interface {
    GetUser(id string) (*User, error)
    SaveUser(u *User) error
}

// Service depends on interface, not concrete DB
type UserService struct {
    store UserStore
}

func NewUserService(store UserStore) *UserService {
    return &UserService{store: store}
}

func (s *UserService) GetUserName(id string) (string, error) {
    user, err := s.store.GetUser(id)
    if err != nil {
        return "", err
    }
    return user.Name, nil
}
```

*service_test.go*

```go
// Mock implementation for testing
type mockUserStore struct {
    users map[string]*User
    err   error  // Force error if set
}

func (m *mockUserStore) GetUser(id string) (*User, error) {
    if m.err != nil {
        return nil, m.err
    }
    user, ok := m.users[id]
    if !ok {
        return nil, fmt.Errorf("user not found")
    }
    return user, nil
}

func (m *mockUserStore) SaveUser(u *User) error {
    if m.err != nil {
        return m.err
    }
    m.users[u.ID] = u
    return nil
}

func TestGetUserName(t *testing.T) {
    // Setup mock with test data
    store := &mockUserStore{
        users: map[string]*User{
            "123": {ID: "123", Name: "Alice"},
        },
    }
    
    svc := NewUserService(store)
    
    name, err := svc.GetUserName("123")
    if err != nil {
        t.Fatalf("unexpected error: %v", err)
    }
    if name != "Alice" {
        t.Errorf("got %q, want %q", name, "Alice")
    }
}

func TestGetUserName_NotFound(t *testing.T) {
    store := &mockUserStore{users: map[string]*User{}}
    svc := NewUserService(store)
    
    _, err := svc.GetUserName("unknown")
    if err == nil {
        t.Error("expected error for unknown user")
    }
}

func TestGetUserName_StoreError(t *testing.T) {
    store := &mockUserStore{err: fmt.Errorf("db down")}
    svc := NewUserService(store)
    
    _, err := svc.GetUserName("123")
    if err == nil {
        t.Error("expected error when store fails")
    }
}
```

## Test Coverage

*Coverage commands*

```bash
# Show coverage percentage
$ go test -cover
PASS
coverage: 80.0% of statements

# Generate coverage profile
$ go test -coverprofile=coverage.out

# View coverage in browser (visual!)
$ go tool cover -html=coverage.out

# View coverage by function
$ go tool cover -func=coverage.out
github.com/you/pkg/math.go:5:    Add         100.0%
github.com/you/pkg/math.go:9:    Divide      75.0%
total:                           (statements) 80.0%
```

> **Coverage isn't everything:** 100% coverage doesn't mean bug-free. Test behavior, not lines. Focus on edge cases and error paths.

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

## Module 16 Summary

- **_test.go files** — tests live alongside code
- **TestXxx(t *testing.T)** — test function signature
- **t.Error vs t.Fatal** — continue vs stop
- **Table-driven tests** — the Go way to test multiple cases
- **t.Run()** — subtests for better output and selective running
- **t.Helper()** — mark helper functions for better error reporting
- **t.Cleanup()** — automatic cleanup after test
- **Interface mocking** — inject test doubles
- **go test -cover** — measure coverage
