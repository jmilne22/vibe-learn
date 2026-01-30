## Errors Are Values

Go doesn't have exceptions. Errors are just values that you return and check.

*Basic error handling*

```go
// Function that can fail returns (result, error)
func divide(a, b float64) (float64, error) {
    if b == 0 {
        return 0, errors.New("division by zero")
    }
    return a / b, nil
}

// Always handle errors!
result, err := divide(10, 0)
if err != nil {
    fmt.Println("Error:", err)
    return
}
fmt.Println(result)
```

> **The Mantra:** <p>Check errors immediately. Don't defer it. Don't ignore it with `_`.</p>

## Custom Error Types

*Custom errors*

```go
// Simple custom error
var ErrNotFound = errors.New("not found")

// Rich custom error type
type ValidationError struct {
    Field   string
    Message string
}

func (e *ValidationError) Error() string {
    return fmt.Sprintf("%s: %s", e.Field, e.Message)
}

// Using fmt.Errorf with %w for wrapping
func loadConfig(path string) (*Config, error) {
    data, err := os.ReadFile(path)
    if err != nil {
        return nil, fmt.Errorf("loading config: %w", err)
    }
    // ...
}

// Check error type
if errors.Is(err, ErrNotFound) {
    // Handle not found
}

var validErr *ValidationError
if errors.As(err, &validErr) {
    fmt.Println("Field:", validErr.Field)
}
```

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
            result := Add(tt.a, tt.b)
            if result != tt.expected {
                t.Errorf("Add(%d, %d) = %d; want %d",
                    tt.a, tt.b, result, tt.expected)
            }
        })
    }
}
```

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

## Module 9 Summary

- **Errors are values** — return (result, error)
- **Always check errors** — immediately after the call
- **Wrap errors** with fmt.Errorf("context: %w", err)
- **errors.Is/As** — check error types
- **Table-driven tests** — the Go standard
- **Interfaces for mocking** — easy dependency injection
