## Your First Concurrent Pattern

Check N health endpoints in parallel, collect results:

<attempt type="worked">

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

</attempt>

<attempt type="gaps">

<gaps prompt="N goroutines, N sends, N receives — no WaitGroup needed. From memory.">
```go
results := make(chan HealthResult, len(urls))   // sized so senders never block

for _, url := range urls {
    go func(u string) {
        results <- check(u)
    }(«url»)
}

var all []HealthResult
for «range urls» {
    all = append(all, «<-results»)
}
```
</gaps>

</attempt>

<attempt type="scratch">

<div class="inline-exercises" data-concept="Concurrent Patterns"></div>

</attempt>
