## Start concurrency with a stop condition

If checking one endpoint takes a second, checking ten sequentially can take roughly ten seconds. Concurrent checks can reduce the wait. They also introduce questions the sequential program did not have: who owns the results, how much work may run, and what happens when the user cancels?

Keep the sequential version working first. A concurrency bug is easier to isolate when the request logic already has tests.

```go
go doWork()
```

`go` starts a goroutine. The caller continues immediately. It does not wait for the function, collect its result, or propagate its error. If main returns, other goroutines do not keep the process alive.

### A channel can block

```go
values := make(chan int)
values <- 7
```

On an unbuffered channel, sending waits for a receiver. In this fragment there is none, so the send cannot complete. A buffered channel can accept values until its buffer fills; it does not create a consumer.

A context cannot unblock that send unless the operation listens to it:

```go
select {
case values <- 7:
    return nil
case <-ctx.Done():
    return ctx.Err()
}
```

`select` waits for a channel operation that can proceed. If multiple cases are ready, it chooses one; it does not prioritize the first case or cancellation. If your contract says a pre-canceled context starts no work, check `ctx.Err()` before entering select.

**Exercise: Cancel a blocked send.** Do not close the caller's channel. A sender closing a channel it does not own can break other senders; sending to a closed channel panics.

### Assign responsibility for stopping

For every goroutine, name the event that ends it. A worker might stop when its jobs channel closes, when its context is canceled, or both. The function that starts it should usually wait for it before returning.

A WaitGroup records outstanding work:

```go
var wg sync.WaitGroup
wg.Add(1)
go func() {
    defer wg.Done()
    doWork()
}()
wg.Wait()
```

Add before launching. Otherwise Wait can observe no outstanding work and return before the goroutine registers itself. Do not use `time.Sleep` to guess when work has finished.

### Test events, not scheduling luck

Use a channel to let a test know when a callback starts. Then cancel, and wait for a completion signal. A short timeout can prevent a broken test from hanging forever, but it should be a deadlock guard, not evidence that a worker “must have started by now.”

References: [Go pipelines and cancellation](https://go.dev/blog/pipelines), [sync.WaitGroup](https://pkg.go.dev/sync#WaitGroup).
