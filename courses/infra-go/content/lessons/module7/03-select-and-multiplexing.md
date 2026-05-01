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

<variations runner="go">
template: |
  package main
  import "fmt"
  func main() {
      ch := make(chan int)
      select {
      case v := <-ch:
          fmt.Println("got", v)
      {{DEFAULT}}
      }
      fmt.Println("done")
  }
cases:
  - name: with default
    DEFAULT: |2-
      default:
              fmt.Println("nothing ready")
  - name: without default
    DEFAULT: ''
</variations>

`default` is what makes a `select` non-blocking. With it, the runtime picks the default branch the instant no other case is ready. Without it, `select` blocks until *some* case becomes ready — and since this channel has no senders, every goroutine is asleep, and Go's runtime detects the deadlock and panics. Use `default` when you want polling semantics ("send if you can, otherwise drop"); leave it off when you genuinely want to wait.

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
