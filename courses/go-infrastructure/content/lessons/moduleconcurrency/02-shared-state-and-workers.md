## Decide who owns each result

This looks like one operation:

```go
count++
```

It is a read, a calculation, and a write. Two goroutines can both read 5 and both write 6, losing an increment. A map can also be unsafe under concurrent access. Merely putting data inside a struct does not synchronize it.

A mutex makes a critical section exclusive:

```go
mu.Lock()
count++
mu.Unlock()
```

Readers must follow the same synchronization rule. Locking only writes does not make an unsynchronized read safe. Keep the lock close to the data it protects; use pointer receivers so methods operate on the same lock and state.

**Exercise: Protect a read-modify-write.** The zero value of your Counter should work. Do not require a constructor to allocate a mutex. After ordinary tests pass, use a host Go toolchain with a C compiler to run:

```sh
go test -race ./...
```

The app's bundled exercise checks run with cgo disabled and do not run the race detector. A race detector finds races on executed paths; a clean run is evidence, not a proof about all schedules.

### Bound the expensive operation

Starting one goroutine per target allows an input file to create thousands of concurrent requests. Adding a buffer to the results channel does not bound that request count.

Use a fixed number of workers receiving jobs:

```text
indices 0, 1, 2, ... -> jobs -> worker 1 -> results[index]
                           -> worker 2 -> results[index]
```

Each job carries the input index. Each worker writes only the corresponding result slot. No worker appends to a shared slice. The caller waits for all workers before reading results, so it sees the completed values in input order rather than completion order.

**Exercise: Bound concurrent work.** Its callback represents an endpoint check. The exercise is about scheduling and ownership; the earlier HTTP exercise already tests network behavior.

Read the cancellation contract carefully. On cancellation, stop scheduling and wait for started callbacks. The callbacks must themselves honor the context. Go cannot safely kill an arbitrary goroutine that refuses to stop.

### Throughput is not just the worker count

Suppose one check takes 250 ms and you allow four in flight. Ignoring overhead and variability, the capacity is roughly 4 / 0.25 = 16 checks per second. If targets arrive at 40 per second, adding a queue stores the difference; it does not erase it.

A bounded queue forces a policy when full: reject, block producers, or discard something deliberately. An unbounded queue delays the decision until memory runs out. We will revisit that choice with actual Collector metrics.

### Review question: mutex or channel?

<details><summary>Reasoning</summary>

Use a mutex when several operations need coordinated access to shared state, such as the counter. Use a channel when transferring work or signaling an event makes ownership clearer, such as the jobs channel. Neither is inherently more “Go-like.” A dedicated goroutine with a channel for every integer update can add complexity without improving the ownership rule.

</details>

References: [Go race detector](https://go.dev/doc/articles/race_detector), [Go memory model](https://go.dev/ref/mem).
