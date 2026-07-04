## Common Mistakes

<attempt type="pretest">

<predict prompt="What happens when this runs?">
```go
ch := make(chan int)
close(ch)
close(ch)
fmt.Println("done")
```
```
panic: close of closed channel
```
</predict>

Commit before reading — this is mistake #1 of four.

</attempt>

### Closing a Channel Twice

That pretest is the first mistake. Only close once, and only from the sender.

### Writing to a Closed Channel

```go
ch := make(chan int)
close(ch)
ch <- 42 // PANIC: send on closed channel
```

### The Loop Variable Trap

<attempt type="worked">

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

</attempt>

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

<attempt type="gaps">

<gaps prompt="A version-proof fan-out: each goroutine must get its own copy, and every result must be drained.">
```go
results := make(chan string, len(hosts))

for _, host := range hosts {
    go func(h string) {
        results <- ping(«h»)
    }(«host»)
}

for range hosts {
    fmt.Println(«<-results»)
}
```
</gaps>

</attempt>

---

> **Next:** the Build section — make your reporter concurrent. Every mistake above will try to happen there.
