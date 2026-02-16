This is Go's superpower and it comes up in every Go interview. If you can explain goroutines and channels clearly and write concurrent code confidently, you're ahead of most candidates.

---

## Goroutines: Lightweight Threads

A goroutine is a function running concurrently. That's it.

```go
go func() {
    fmt.Println("running in a goroutine")
}()
```

The `go` keyword launches the function on a separate goroutine. The main goroutine continues immediately.

### Cost

Each goroutine starts with ~2-4KB stack (grows as needed). You can run thousands — even millions — without breaking a sweat. OS threads cost ~1MB each. This is why Go concurrency scales so well for infra tools: checking 10,000 endpoints in parallel is trivial.

*Python comparison*

```python
# Python: threading.Thread is an OS thread. GIL prevents true parallelism.
# Python: asyncio is single-threaded, cooperative multitasking.
# Go: goroutines are M:N scheduled — many goroutines on few OS threads.
# Go: true parallelism on multi-core. No GIL equivalent.
```

### The Main Goroutine Problem

```go
func main() {
    go doWork()
    // main exits immediately — doWork never finishes!
}
```

`main()` doesn't wait for goroutines. If main returns, everything stops. You need synchronization.

## Channels: Communication

Channels are typed conduits for sending data between goroutines.

### Creating and Using

```go
ch := make(chan string)    // unbuffered channel of strings

// Send (blocks until someone receives)
go func() {
    ch <- "hello from goroutine"
}()

// Receive (blocks until something is sent)
msg := <-ch
fmt.Println(msg) // "hello from goroutine"
```

### Unbuffered Channels

Unbuffered channels synchronize sender and receiver. The sender blocks until someone reads:

```go
ch := make(chan int) // unbuffered

go func() {
    ch <- 42  // blocks here until main reads
    fmt.Println("sent!")
}()

val := <-ch // unblocks the sender
fmt.Println(val) // 42
```

Use unbuffered channels when you need synchronization — "don't proceed until the other side is ready."

### Buffered Channels

Buffered channels hold up to N values. Sends only block when full:

```go
ch := make(chan string, 3) // buffer of 3

ch <- "first"   // doesn't block (buffer has space)
ch <- "second"  // doesn't block
ch <- "third"   // doesn't block
// ch <- "fourth" // WOULD block — buffer full

fmt.Println(<-ch) // "first"
```

Use buffered channels when the producer and consumer run at different speeds.

### Closing Channels

```go
ch := make(chan int, 5)
for i := 0; i < 5; i++ {
    ch <- i
}
close(ch) // signals "no more values"

// Range reads until channel is closed
for val := range ch {
    fmt.Println(val)
}
// prints 0, 1, 2, 3, 4 then exits the loop
```

**Only the sender closes.** Never close from the receiver side. Closing a closed channel panics.

### Direction-Restricted Channels

```go
// Send-only channel (in function signature)
func producer(out chan<- string) {
    out <- "data"
}

// Receive-only channel
func consumer(in <-chan string) {
    msg := <-in
    fmt.Println(msg)
}
```

This prevents accidentally sending on a receive channel (or vice versa). Use in function signatures for clarity.

## WaitGroups: Knowing When It's Done

`sync.WaitGroup` tracks a count of goroutines and blocks until all are done.

```go
import "sync"

var wg sync.WaitGroup

urls := []string{"https://api-1.example.com", "https://api-2.example.com", "https://api-3.example.com"}

for _, url := range urls {
    wg.Add(1)
    go func(u string) {
        defer wg.Done()
        resp, err := http.Get(u)
        if err != nil {
            fmt.Printf("%s: error %v\n", u, err)
            return
        }
        resp.Body.Close()
        fmt.Printf("%s: %d\n", u, resp.StatusCode)
    }(url)
}

wg.Wait() // blocks until all goroutines call Done()
fmt.Println("all checks complete")
```

### The Pattern

1. `wg.Add(1)` before launching the goroutine
2. `defer wg.Done()` as the first line inside the goroutine
3. `wg.Wait()` after the loop

> **Gotcha:** Call `Add(1)` *before* `go func()`, not inside it. Otherwise there's a race between `Wait()` and `Add()`.

### Goroutine Leak

```go
// BAD: this goroutine never exits if nobody reads from ch
go func() {
    result := expensiveWork()
    ch <- result  // blocks forever if nobody reads
}()
// If the caller gives up (timeout), this goroutine leaks
```

Every goroutine you launch must have a way to exit. Channels, context cancellation, or WaitGroups — use at least one.

## Your First Concurrent Pattern

Check N health endpoints in parallel, collect results:

```go
type HealthResult struct {
    URL     string
    Healthy bool
    Latency time.Duration
    Err     error
}

func checkAll(urls []string) []HealthResult {
    results := make(chan HealthResult, len(urls))

    for _, url := range urls {
        go func(u string) {
            start := time.Now()
            resp, err := http.Get(u)
            latency := time.Since(start)
            if err != nil {
                results <- HealthResult{URL: u, Err: err, Latency: latency}
                return
            }
            resp.Body.Close()
            results <- HealthResult{
                URL:     u,
                Healthy: resp.StatusCode == 200,
                Latency: latency,
            }
        }(url)
    }

    // Collect all results
    all := make([]HealthResult, 0, len(urls))
    for i := 0; i < len(urls); i++ {
        all = append(all, <-results)
    }
    return all
}
```

**Key decisions:**
- Buffered channel (`len(urls)`) so goroutines never block on send
- We know exactly how many results to expect (`len(urls)`)
- Each goroutine sends exactly one result

## Common Mistakes

### Closing a Channel Twice

```go
ch := make(chan int)
close(ch)
close(ch) // PANIC: close of closed channel
```

Only close once, and only from the sender.

### Writing to a Closed Channel

```go
ch := make(chan int)
close(ch)
ch <- 42 // PANIC: send on closed channel
```

### The Loop Variable Trap

```go
// BAD: all goroutines share the same loop variable
for _, url := range urls {
    go func() {
        fmt.Println(url) // prints the LAST url, multiple times
    }()
}

// GOOD: pass as parameter
for _, url := range urls {
    go func(u string) {
        fmt.Println(u) // correct: each goroutine gets its own copy
    }(url)
}
```

> **Note:** Go 1.22+ changed loop variable semantics, so the bad version now works correctly. But passing as a parameter is still clearer and works in all versions.

### Race Conditions

```go
// BAD: concurrent writes to shared variable
counter := 0
for i := 0; i < 1000; i++ {
    go func() {
        counter++ // DATA RACE
    }()
}
```

Detect with `go test -race`. Fix with channels, sync.Mutex, or sync/atomic.

---

## Exercises

Practice individual concepts with quick drills, then tackle multi-step challenges.

<div id="warmups-container">
    <noscript><p class="js-required">JavaScript is required for the interactive exercises.</p></noscript>
</div>

### Challenges

Apply what you learned to infra-themed problems. Each challenge has multiple variants — shuffle to keep things fresh.

<div id="challenges-container">
    <noscript><p class="js-required">JavaScript is required for the interactive exercises.</p></noscript>
</div>
