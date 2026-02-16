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

<div class="inline-exercises" data-concept="Context"></div>
