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

<attempt type="worked">

```go
func main() {
    go doWork()
    // main exits immediately — doWork never finishes!
}
```

`main()` doesn't wait for goroutines. If main returns, everything stops. You need synchronization.

</attempt>

<attempt type="gaps">

<gaps prompt="Launch one restart per pod without blocking the loop — and give each goroutine its own copy of the name.">
```go
for _, pod := range pods {
    «go» func(p string) {
        fmt.Println("restarting", p)
    }(«pod»)
}
// still need to wait before main returns — that's the next section
```
</gaps>

</attempt>

<attempt type="scratch">

<div class="inline-exercises" data-concept="Goroutines"></div>

</attempt>
