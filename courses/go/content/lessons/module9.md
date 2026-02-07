## Errors Are Values

Here's the deal: Go doesn't have exceptions. No `try/catch`, no stack unwinding. Instead, errors are just values — you return them, check them, and pass them around like any other data.

This is the `error` interface — the entire thing:

*The error interface*

```go
type error interface {
    Error() string
}
```

That's it. Any type with an `Error() string` method is an error. This simplicity is intentional — it means you can create errors that carry whatever data you need.

The basic pattern you'll write hundreds of times:

*The fundamental pattern*

```go
result, err := doSomething()
if err != nil {
    return fmt.Errorf("doing something: %w", err)
}
// use result
```

> **The Mantra:** Check errors immediately. Don't defer it. Don't ignore it with `_`. The `if err != nil` pattern will feel repetitive — that's by design. Explicit error handling makes control flow obvious.

## Creating Errors

You have two tools for creating simple errors:

*errors.New vs fmt.Errorf*

```go
import (
    "errors"
    "fmt"
)

// errors.New — for fixed error messages
var ErrNotFound = errors.New("not found")

// fmt.Errorf — when you need dynamic context
func openFile(path string) error {
    return fmt.Errorf("open %s: permission denied", path)
}
```

When to use which?
- **`errors.New`** — for sentinel errors (more on this below) and simple static messages
- **`fmt.Errorf`** — when you need to include variable data, or when wrapping another error

## Sentinel Errors

A sentinel error is a package-level variable that callers can check against. Think of them as named error constants.

*Defining sentinels*

```go
// By convention, sentinel names start with Err
var (
    ErrNotFound   = errors.New("not found")
    ErrForbidden  = errors.New("forbidden")
    ErrOutOfRange = errors.New("index out of range")
)
```

The standard library is full of sentinels you'll use regularly:

*Common stdlib sentinels*

```go
import (
    "io"
    "os"
)

io.EOF           // end of input — not really an "error", more a signal
os.ErrNotExist   // file doesn't exist
os.ErrPermission // permission denied
os.ErrExist      // file already exists
```

To check if an error matches a sentinel, **always** use `errors.Is` — never compare strings:

*Checking sentinels with errors.Is*

```go
_, err := os.Open("/no/such/file")
if errors.Is(err, os.ErrNotExist) {
    fmt.Println("file not found, using defaults")
}

// BAD — don't do this!
// if err.Error() == "file not found" { ... }
```

> **Why not `==`?** Because errors get wrapped (next section). A wrapped error is not `==` to the original, but `errors.Is` unwraps the chain and finds it. Always use `errors.Is`.

## Custom Error Types

When callers need more than just "what went wrong" — when they need structured data to decide how to respond — create a custom error type:

*Custom error with structured data*

```go
type ValidationError struct {
    Field   string
    Message string
}

// Pointer receiver — important for errors.As to work correctly
func (e *ValidationError) Error() string {
    return fmt.Sprintf("%s: %s", e.Field, e.Message)
}

func validateAge(age int) error {
    if age < 0 {
        return &ValidationError{
            Field:   "age",
            Message: "must be non-negative",
        }
    }
    return nil
}
```

To extract a custom error type from an error chain, use `errors.As`:

*Extracting with errors.As*

```go
err := validateAge(-5)

var ve *ValidationError
if errors.As(err, &ve) {
    fmt.Println("Bad field:", ve.Field)   // "age"
    fmt.Println("Problem:", ve.Message)   // "must be non-negative"
}
```

> **Pointer Receiver Gotcha:** If `Error()` is defined on `*ValidationError`, you must return `&ValidationError{}` (a pointer). Returning `ValidationError{}` (a value) means `errors.As` won't find it. This is the #1 custom error bug.

## Error Wrapping

Wrapping is how you add context as errors bubble up through your call stack. Use `fmt.Errorf` with the `%w` verb:

*Wrapping with %w*

```go
func repository() error {
    return errors.New("connection refused")
}

func service() error {
    err := repository()
    if err != nil {
        return fmt.Errorf("querying users: %w", err)
    }
    return nil
}

func handler() error {
    err := service()
    if err != nil {
        return fmt.Errorf("handling request: %w", err)
    }
    return nil
}
```

Each layer adds context. The final error reads like a breadcrumb trail:

```
handling request: querying users: connection refused
```

Here's what the wrapping chain looks like:

```
┌─────────────────────────────┐
│ "handling request: ..."     │
│   Unwrap() ─────────────────┼──▶ ┌──────────────────────────┐
└─────────────────────────────┘    │ "querying users: ..."    │
                                   │   Unwrap() ──────────────┼──▶ ┌─────────────────────┐
                                   └──────────────────────────┘    │ "connection refused" │
                                                                   └─────────────────────┘
```

`errors.Is` and `errors.As` walk this entire chain. That's why they work even through multiple layers of wrapping:

*Walking the chain*

```go
var ErrTimeout = errors.New("operation timed out")

// Three layers deep...
err := handler() // wraps service() wraps ErrTimeout

// errors.Is walks: handler error → service error → ErrTimeout ✓
if errors.Is(err, ErrTimeout) {
    fmt.Println("timed out — will retry")
}
```

> **`%w` vs `%v`:** Use `%w` when you want callers to be able to inspect the wrapped error. Use `%v` when you want to include the error message but **hide** the original error from `errors.Is`/`errors.As`. Hiding is useful when an internal implementation detail shouldn't leak to callers.

## When to Use What

Choosing the right error strategy matters. Here's a decision framework:

| Situation | Use | Example |
|---|---|---|
| Caller checks identity | Sentinel (`errors.Is`) | `ErrNotFound`, `io.EOF` |
| Caller needs error data | Custom type (`errors.As`) | `ValidationError{Field, Message}` |
| Adding context while propagating | Wrapping (`%w`) | `fmt.Errorf("save user: %w", err)` |
| Simple failure, no inspection needed | `errors.New` or `fmt.Errorf` | `errors.New("invalid input")` |

> **Start simple.** Most errors just need wrapping as they propagate. Only create sentinels or custom types when callers actually need to distinguish between different error conditions.

## Common Anti-Patterns

Don't do these:

*BAD: Comparing error strings*

```go
// BAD — fragile, breaks when messages change
if err.Error() == "not found" {
    // ...
}

// GOOD — stable, works through wrapping
if errors.Is(err, ErrNotFound) {
    // ...
}
```

*BAD: Returning bare errors without context*

```go
// BAD — when this shows up in logs, where did it come from?
func getUser(id string) (*User, error) {
    return db.Query(id) // just passes the raw DB error up
}

// GOOD — adds context so you can trace the error
func getUser(id string) (*User, error) {
    user, err := db.Query(id)
    if err != nil {
        return nil, fmt.Errorf("getUser %s: %w", id, err)
    }
    return user, nil
}
```

*BAD: log.Fatal in library code*

```go
// BAD — kills the entire program! The caller can't recover
func ParseConfig(path string) *Config {
    data, err := os.ReadFile(path)
    if err != nil {
        log.Fatal(err) // don't do this in library code!
    }
    // ...
}

// GOOD — return the error, let the caller decide
func ParseConfig(path string) (*Config, error) {
    data, err := os.ReadFile(path)
    if err != nil {
        return nil, fmt.Errorf("parse config %s: %w", path, err)
    }
    // ...
}
```

*BAD: Silently ignoring errors*

```go
// BAD — if this fails, you'll never know why things break later
data, _ := os.ReadFile("config.yaml")

// GOOD — handle or propagate
data, err := os.ReadFile("config.yaml")
if err != nil {
    return fmt.Errorf("reading config: %w", err)
}
```

> **The only acceptable `_` for errors:** When you genuinely don't care about the result AND failure has no impact. Example: `fmt.Fprintf(w, ...)` in an HTTP handler where the client already disconnected. These cases are rare.

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

### Core Concepts

- **Errors are values** — the `error` interface is just `Error() string`
- **Always check errors** — `if err != nil` immediately after the call
- **Sentinel errors** — package-level `var ErrX = errors.New(...)` for identity checks
- **Custom error types** — structs with `Error() string` for carrying structured data
- **Error wrapping** — `fmt.Errorf("context: %w", err)` to add breadcrumbs

### Key Functions

- **`errors.New`** — create a simple error
- **`fmt.Errorf`** — create an error with formatting, use `%w` to wrap
- **`errors.Is`** — check if any error in the chain matches a sentinel
- **`errors.As`** — extract a custom error type from the chain

### Common Gotchas

- **Pointer receivers on custom errors** — `Error()` on `*T` means return `&T{}`
- **`%w` vs `%v`** — `%w` allows unwrapping, `%v` hides the original
- **Never compare error strings** — use `errors.Is` instead
- **Don't `log.Fatal` in libraries** — return errors, let callers decide
