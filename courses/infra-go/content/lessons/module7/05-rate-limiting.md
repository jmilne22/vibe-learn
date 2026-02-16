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

<div class="inline-exercises" data-concept="Rate Limiting"></div>
