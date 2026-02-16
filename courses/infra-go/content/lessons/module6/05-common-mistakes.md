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
