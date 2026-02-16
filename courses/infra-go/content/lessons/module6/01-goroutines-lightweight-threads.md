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

<div class="inline-exercises" data-concept="Goroutines"></div>
