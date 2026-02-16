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
