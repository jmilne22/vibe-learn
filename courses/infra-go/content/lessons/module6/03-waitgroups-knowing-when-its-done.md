## WaitGroups: Knowing When It's Done

`sync.WaitGroup` tracks a count of goroutines and blocks until all are done.

<attempt type="worked">

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

</attempt>

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

<attempt type="gaps">

<gaps prompt="The three-call pattern, from memory — and mind where each call goes.">
```go
var wg sync.WaitGroup

for _, url := range urls {
    wg.«Add(1)»          // before the launch, not inside it
    go func(u string) {
        defer wg.«Done()»
        check(u)
    }(url)
}

wg.«Wait()»
fmt.Println("all checks complete")
```
</gaps>

</attempt>

<attempt type="scratch">

<div class="inline-exercises" data-concept="WaitGroups"></div>

</attempt>
