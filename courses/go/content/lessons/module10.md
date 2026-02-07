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

### Challenges

Combine concepts and learn patterns. Each challenge has multiple variants at different difficulties.

<div id="challenges-container">
            <noscript><p class="js-required">JavaScript is required for the interactive exercises.</p></noscript>
            </div>

## Module 10 Summary

- **Test files** end in `_test.go`, same package
- **testing.T** -- `t.Errorf`, `t.Fatal`, `t.Run`
- **Table-driven tests** -- the Go standard pattern
- **Subtests** with `t.Run` for organized output
- **Test coverage** with `go test -cover`
- **Interfaces for mocking** -- easy dependency injection
