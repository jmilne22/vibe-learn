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

<div class="inline-exercises" data-concept="Errors as Values"></div>
<div class="inline-exercises" data-concept="Sentinel Errors"></div>
