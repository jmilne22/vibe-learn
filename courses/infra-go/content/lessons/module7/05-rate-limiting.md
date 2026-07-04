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

<attempt type="worked">

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

</attempt>

<attempt type="gaps">

<gaps prompt="Throttle a burst of requests to a steady 10 per second — from memory.">
```go
limiter := time.«NewTicker»(100 * time.Millisecond) // 1 tick per 100ms = 10/sec
defer «limiter.Stop()»

for _, req := range requests {
    «<-limiter.C»   // pace: one launch per tick
    go send(req)
}
```
</gaps>

</attempt>

<attempt type="scratch">

<div class="inline-exercises" data-concept="Rate Limiting"></div>

</attempt>
