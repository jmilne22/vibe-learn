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

> **The Mantra:** Check errors immediately. Don't defer it. Don't ignore it with `_`.

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

## Module 9 Summary

- **Errors are values** -- return (result, error)
- **Always check errors** -- immediately after the call
- **Wrap errors** with fmt.Errorf("context: %w", err)
- **errors.Is/As** -- check error types
- **Sentinel errors** -- package-level `var ErrX = errors.New(...)`
- **Custom error types** -- implement the `error` interface
