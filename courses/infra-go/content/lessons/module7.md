Module 6 gave you the primitives. This module gives you the patterns that production infrastructure actually uses. These come up constantly in interviews and in real codebases.

---

## Fan-Out / Fan-In

Fan-out: distribute work across multiple goroutines. Fan-in: collect results into one channel.

```go
// Fan-out: launch N workers reading from the same input channel
func fanOut(input <-chan string, workers int) []<-chan Result {
    channels := make([]<-chan Result, workers)
    for i := 0; i < workers; i++ {
        channels[i] = worker(input)
    }
    return channels
}

func worker(input <-chan string) <-chan Result {
    out := make(chan Result)
    go func() {
        defer close(out)
        for item := range input {
            out <- process(item)
        }
    }()
    return out
}

// Fan-in: merge multiple result channels into one
func fanIn(channels ...<-chan Result) <-chan Result {
    var wg sync.WaitGroup
    merged := make(chan Result)

    for _, ch := range channels {
        wg.Add(1)
        go func(c <-chan Result) {
            defer wg.Done()
            for val := range c {
                merged <- val
            }
        }(ch)
    }

    go func() {
        wg.Wait()
        close(merged)
    }()
    return merged
}
```

**Real uses:** Checking N servers in parallel, validating N config files, downloading N artifacts.

## Worker Pools

A fixed number of goroutines processing jobs from a shared queue:

```go
func workerPool(jobs <-chan Job, results chan<- Result, numWorkers int) {
    var wg sync.WaitGroup
    for i := 0; i < numWorkers; i++ {
        wg.Add(1)
        go func(id int) {
            defer wg.Done()
            for job := range jobs {
                results <- processJob(id, job)
            }
        }(i)
    }
    wg.Wait()
    close(results)
}

// Usage
jobs := make(chan Job, 100)
results := make(chan Result, 100)

go workerPool(jobs, results, 5) // 5 workers

// Send jobs
for _, j := range allJobs {
    jobs <- j
}
close(jobs)

// Collect results
for r := range results {
    fmt.Println(r)
}
```

**Why not one goroutine per job?** If you have 10,000 HTTP requests, launching 10,000 goroutines will overwhelm the target server. A pool of 20 workers is controlled and predictable.

## Select & Multiplexing

`select` waits on multiple channel operations. The first one ready wins.

### Basic Select

```go
select {
case msg := <-ch1:
    fmt.Println("from ch1:", msg)
case msg := <-ch2:
    fmt.Println("from ch2:", msg)
}
```

### Timeout

```go
select {
case result := <-ch:
    fmt.Println("got result:", result)
case <-time.After(5 * time.Second):
    fmt.Println("timed out")
}
```

### Non-Blocking Operations

```go
// Try to send, but don't block
select {
case ch <- value:
    fmt.Println("sent")
default:
    fmt.Println("channel full, dropping")
}

// Try to receive, but don't block
select {
case val := <-ch:
    fmt.Println("received:", val)
default:
    fmt.Println("nothing ready")
}
```

### Select in a Loop

```go
for {
    select {
    case job := <-jobs:
        process(job)
    case <-ticker.C:
        reportMetrics()
    case <-ctx.Done():
        fmt.Println("shutting down")
        return
    }
}
```

This is what every long-running Go service looks like: a select loop handling multiple event sources.

## Context: Cancellation & Timeouts

Context is how Go propagates cancellation and deadlines through a call chain.

### Creating Contexts

```go
// Root context — start here
ctx := context.Background()

// With timeout — auto-cancels after duration
ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
defer cancel() // always defer cancel to release resources

// With manual cancellation
ctx, cancel := context.WithCancel(context.Background())
// call cancel() when you want to stop everything
```

### Passing Context

```go
// Every function that does I/O should take context as first param
func fetchPods(ctx context.Context, namespace string) ([]Pod, error) {
    req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
    // ...
}

// Checking for cancellation in loops
func processItems(ctx context.Context, items []string) error {
    for _, item := range items {
        select {
        case <-ctx.Done():
            return ctx.Err() // "context canceled" or "context deadline exceeded"
        default:
        }
        if err := process(item); err != nil {
            return err
        }
    }
    return nil
}
```

### Graceful Shutdown

```go
import "os/signal"

func main() {
    // Create context that cancels on SIGINT/SIGTERM
    ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
    defer stop()

    // Start server
    srv := &http.Server{Addr: ":8080"}
    go srv.ListenAndServe()

    // Wait for signal
    <-ctx.Done()
    fmt.Println("shutting down...")

    // Give in-flight requests 10 seconds to finish
    shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
    defer cancel()
    srv.Shutdown(shutdownCtx)
}
```

This is critical for K8s — when a pod gets terminated, K8s sends SIGTERM. Your service needs to finish in-flight work before the SIGKILL arrives (default 30s later).

## Rate Limiting

### time.Ticker

```go
// Process at most 10 items per second
limiter := time.NewTicker(100 * time.Millisecond) // 1 tick per 100ms = 10/sec
defer limiter.Stop()

for _, item := range items {
    <-limiter.C // wait for next tick
    go process(item)
}
```

### Token Bucket (More Flexible)

```go
// Allow bursts but maintain average rate
type RateLimiter struct {
    tokens chan struct{}
}

func NewRateLimiter(rate int, interval time.Duration) *RateLimiter {
    rl := &RateLimiter{
        tokens: make(chan struct{}, rate),
    }
    // Fill tokens at the specified rate
    go func() {
        ticker := time.NewTicker(interval / time.Duration(rate))
        defer ticker.Stop()
        for range ticker.C {
            select {
            case rl.tokens <- struct{}{}:
            default: // bucket full, discard
            }
        }
    }()
    return rl
}

func (rl *RateLimiter) Wait(ctx context.Context) error {
    select {
    case <-rl.tokens:
        return nil
    case <-ctx.Done():
        return ctx.Err()
    }
}
```

## Putting It Together

Production worker pool with context, rate limiting, and clean shutdown:

```go
func processQueue(ctx context.Context, jobs <-chan Job, workers int, ratePerSec int) <-chan Result {
    results := make(chan Result)
    limiter := time.NewTicker(time.Second / time.Duration(ratePerSec))

    var wg sync.WaitGroup
    for i := 0; i < workers; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            for {
                select {
                case <-ctx.Done():
                    return
                case job, ok := <-jobs:
                    if !ok {
                        return // jobs channel closed
                    }
                    <-limiter.C // rate limit
                    results <- processJob(job)
                }
            }
        }()
    }

    go func() {
        wg.Wait()
        limiter.Stop()
        close(results)
    }()

    return results
}
```

This combines everything: bounded workers, rate limiting, context cancellation, and clean channel lifecycle.

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
