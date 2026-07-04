## Sentinel & Custom Errors

*A pod lookup that returns `ErrNotFound` lets the caller branch on it with `errors.Is` — "missing pod, create it" vs "transient failure, retry". A `*ValidationError` carrying `Field` and `Message` lets the caller render the failure to the user. Pick the shape based on what the caller will do.*

<attempt type="pretest">

<predict prompt="What does this print?">
```go
err1 := errors.New("not found")
err2 := errors.New("not found")
fmt.Println(err1 == err2)
fmt.Println(errors.Is(err1, err1))
```
```
false
true
```
</predict>

Wrong is fine — the first line is exactly why sentinels must be shared package-level variables, never re-created at the call site.

</attempt>

### Sentinel Errors

Package-level variables for well-known error conditions:

<attempt type="worked">

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

</attempt>

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

<attempt type="gaps">

<gaps prompt="A custom type when the caller needs structured data out of the failure.">
```go
type ValidationError struct {
    Field   string
    Message string
}

// one method makes it an error
func (e *ValidationError) «Error() string» {
    return fmt.Sprintf("validation failed on %s: %s", e.Field, e.Message)
}

// return it
return «&ValidationError»{Field: "port", Message: "must be 1-65535"}

// extract it
var valErr *ValidationError
if errors.«As»(err, &valErr) {
    fmt.Println(valErr.Field)
}
```
</gaps>

</attempt>

### When to Use Which

| Approach | When |
|----------|------|
| `fmt.Errorf("message")` | One-off errors with no special handling |
| `fmt.Errorf("context: %w", err)` | Adding context while preserving the original |
| `var ErrFoo = errors.New(...)` | Callers need to check for this specific condition |
| `type FooError struct{...}` | Callers need structured data from the error |

<attempt type="scratch">

<div class="inline-exercises" data-concept="Sentinel Errors"></div>

</attempt>
