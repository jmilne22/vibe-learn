## Putting It Together

Production worker pool with context, rate limiting, and clean shutdown:

<attempt type="worked">

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

</attempt>

<attempt type="gaps">

<gaps prompt="The worker's inner loop, from memory — two ways out, one throttle.">
```go
for {
    select {
    case <-ctx.Done():
        return
    case job, «ok» := <-jobs:
        if «!ok» {
            return // no more work coming
        }
        «<-limiter.C»
        results <- processJob(job)
    }
}
```
</gaps>

</attempt>

---

> **Next:** the Build section — ship the reporter. Second repo of five.
