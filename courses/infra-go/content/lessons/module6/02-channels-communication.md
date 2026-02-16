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
