## Panic & Recover

Errors are values you return. **Panic** is the other failure path — it unwinds the stack, runs deferred functions, and terminates the goroutine if nothing catches it. You will see it. You should almost never reach for it.

### What Causes a Panic

Most panics are bugs, not deliberate calls:

```go
var p *Pod
fmt.Println(p.Name) // panic: nil pointer dereference

m := map[string]int{}
ch := make(chan int)
close(ch)
close(ch) // panic: close of closed channel

s := []int{1, 2, 3}
fmt.Println(s[5]) // panic: index out of range [5] with length 3
```

The runtime panics on its own. `panic("boom")` exists as a function, but you mostly hit it via these implicit paths.

### When Calling panic Yourself Is OK

The legitimate cases are narrow:

1. **`init()` failures** — if a package can't initialize, panicking is correct. There's no caller to return an error to.
2. **Programmer-error invariants** — `panic("unreachable")` in a switch default that should never hit, or a `must*` helper for tests / package-init regexes:

```go
var portRE = regexp.MustCompile(`^\d+$`) // panics if the regex is malformed at startup
```

3. **Library code that genuinely cannot continue** — and even there, prefer returning an error. Standard library `encoding/json` returns errors. So should you.

If a caller might want to handle the failure, return an error. Don't panic.

### Recover

`recover` only does anything inside a deferred function, and it stops a panic from propagating:

```go
func safeDivide(a, b int) (result int, err error) {
    defer func() {
        if r := recover(); r != nil {
            err = fmt.Errorf("panic: %v", r)
        }
    }()
    return a / b, nil // panics if b == 0
}
```

Two things to notice: the recover lives in a `defer`, and the named return value `err` is what carries the failure back. Outside of `defer`, `recover()` always returns nil.

The legitimate uses of recover are narrow too:

- **Boundary code** — an HTTP server that doesn't want one bad request to kill the whole process. The standard library's `net/http` already does this for you.
- **Goroutine supervision** — top-level recover in a worker so one bad job doesn't take down the pool.
- **Converting third-party panics to errors** — when wrapping code you don't control.

If you're using recover in normal application logic, you're probably misusing it. The right move is "fix the bug that caused the panic," not "catch and continue."

### What This Means in Practice

- A `nil pointer dereference` in production usually means a missing `if x == nil` check upstream, not a need for recover.
- `panic` propagates across goroutines only by terminating the program — a panic in goroutine A is not catchable from goroutine B. Each goroutine that might panic needs its own deferred recover.
- `defer` runs even on panic, which is why `defer file.Close()` is safe.

> The Go proverb: **"Don't panic."** Use errors.

---
