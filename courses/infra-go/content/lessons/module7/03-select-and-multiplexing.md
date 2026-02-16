## Select & Multiplexing

`select` waits on multiple channel operations. The first one ready wins.

### Basic Select

```go
select {
case msg := <-ch1:
    fmt.Println("from ch1:", msg)
case msg := <-ch2:
    fmt.Println("from ch2:", msg)
}
```

### Timeout

```go
select {
case result := <-ch:
    fmt.Println("got result:", result)
case <-time.After(5 * time.Second):
    fmt.Println("timed out")
}
```

### Non-Blocking Operations

```go
// Try to send, but don't block
select {
case ch <- value:
    fmt.Println("sent")
default:
    fmt.Println("channel full, dropping")
}

// Try to receive, but don't block
select {
case val := <-ch:
    fmt.Println("received:", val)
default:
    fmt.Println("nothing ready")
}
```

### Select in a Loop

```go
for {
    select {
    case job := <-jobs:
        process(job)
    case <-ticker.C:
        reportMetrics()
    case <-ctx.Done():
        fmt.Println("shutting down")
        return
    }
}
```

This is what every long-running Go service looks like: a select loop handling multiple event sources.

<div class="inline-exercises" data-concept="Select"></div>
