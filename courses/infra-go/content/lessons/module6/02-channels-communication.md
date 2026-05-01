## Channels: Communication

Channels are typed conduits for sending data between goroutines.

### Creating and Using

```go
ch := make(chan string)    // unbuffered channel of strings

// Send (blocks until someone receives)
go func() {
    ch <- "hello from goroutine"
}()

// Receive (blocks until something is sent)
msg := <-ch
fmt.Println(msg) // "hello from goroutine"
```

### Unbuffered Channels

Unbuffered channels synchronize sender and receiver. The sender blocks until someone reads:

```go
ch := make(chan int) // unbuffered

go func() {
    ch <- 42  // blocks here until main reads
    fmt.Println("sent!")
}()

val := <-ch // unblocks the sender
fmt.Println(val) // 42
```

Use unbuffered channels when you need synchronization — "don't proceed until the other side is ready."

### Buffered Channels

Buffered channels hold up to N values. Sends only block when full:

```go
ch := make(chan string, 3) // buffer of 3

ch <- "first"   // doesn't block (buffer has space)
ch <- "second"  // doesn't block
ch <- "third"   // doesn't block
// ch <- "fourth" // WOULD block — buffer full

fmt.Println(<-ch) // "first"
```

Use buffered channels when the producer and consumer run at different speeds.

<variations runner="go">
template: |
  package main
  import "fmt"
  func main() {
      ch := make(chan int, {{BUF}})
      for i := 0; i < {{N}}; i++ {
          ch <- i
      }
      fmt.Println("sent", {{N}})
  }
cases:
  - name: buf 1, send 1
    BUF: 1
    N: 1
  - name: buf 3, send 3
    BUF: 3
    N: 3
  - name: buf 0, send 1
    BUF: 0
    N: 1
  - name: buf 1, send 2
    BUF: 1
    N: 2
  - name: buf 3, send 4
    BUF: 3
    N: 4
</variations>

The first two cases succeed because the buffer has room for every send. The remaining cases deadlock: with no receiver running, the goroutine fills the buffer and then blocks on the next send forever. Go's runtime detects that *every* goroutine is blocked and panics with "all goroutines are asleep - deadlock". The unbuffered case (`buf 0`) deadlocks immediately because an unbuffered channel needs a simultaneous receiver, not a buffer.

### Closing Channels

```go
ch := make(chan int, 5)
for i := 0; i < 5; i++ {
    ch <- i
}
close(ch) // signals "no more values"

// Range reads until channel is closed
for val := range ch {
    fmt.Println(val)
}
// prints 0, 1, 2, 3, 4 then exits the loop
```

**Only the sender closes.** Never close from the receiver side. Closing a closed channel panics.

<predict prompt="What does this print?">
```go
ch := make(chan int, 1)
ch <- 42
close(ch)

a := <-ch
b := <-ch
c := <-ch
fmt.Println(a, b, c)
```
```
42 0 0
```
</predict>

After a channel is closed, you can keep reading from it forever — every read returns the zero value of the element type (`0` for int, `""` for string, `nil` for pointers). No error, no panic, no signal. To distinguish "real value" from "channel drained and closed", use the comma-ok form: `v, ok := <-ch`. `ok` is `false` once you've drained a closed channel.

### Direction-Restricted Channels

```go
// Send-only channel (in function signature)
func producer(out chan<- string) {
    out <- "data"
}

// Receive-only channel
func consumer(in <-chan string) {
    msg := <-in
    fmt.Println(msg)
}
```

This prevents accidentally sending on a receive channel (or vice versa). Use in function signatures for clarity.

<div class="inline-exercises" data-concept="Channels"></div>
