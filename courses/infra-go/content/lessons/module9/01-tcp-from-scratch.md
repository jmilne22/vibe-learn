## TCP from Scratch

### Listening for Connections

```go
listener, err := net.Listen("tcp", ":9000")
if err != nil {
    log.Fatal(err)
}
defer listener.Close()

for {
    conn, err := listener.Accept() // blocks until a client connects
    if err != nil {
        log.Println("accept error:", err)
        continue
    }
    go handleConn(conn) // handle each connection concurrently
}
```

`Accept` returns a `net.Conn` — an `io.ReadWriteCloser`. Everything you know about readers and writers applies here.

### Connecting as a Client

```go
conn, err := net.Dial("tcp", "localhost:9000")
if err != nil {
    log.Fatal(err)
}
defer conn.Close()

fmt.Fprintf(conn, "PING\n")       // write to server
reply, _ := bufio.NewReader(conn).ReadString('\n')
fmt.Println("server says:", reply) // "PONG"
```

### Echo Server

The simplest TCP server — reads a line, writes it back:

```go
func handleConn(conn net.Conn) {
    defer conn.Close()
    scanner := bufio.NewScanner(conn)
    for scanner.Scan() {
        line := scanner.Text()
        if line == "QUIT" {
            fmt.Fprintln(conn, "BYE")
            return
        }
        fmt.Fprintln(conn, line) // echo back
    }
}
```

### Timeouts and Deadlines

Without deadlines, a slow or stuck client holds a connection forever:

```go
func handleConn(conn net.Conn) {
    defer conn.Close()
    conn.SetDeadline(time.Now().Add(30 * time.Second)) // read + write deadline

    scanner := bufio.NewScanner(conn)
    for scanner.Scan() {
        conn.SetDeadline(time.Now().Add(30 * time.Second)) // reset on activity
        fmt.Fprintln(conn, scanner.Text())
    }
}
```

> **Gotcha:** `SetDeadline` is an absolute time, not a duration. Reset it after each successful read/write.

### Connection Handling with Context

```go
func serveTCP(ctx context.Context, addr string) error {
    var lc net.ListenConfig
    listener, err := lc.Listen(ctx, "tcp", addr)
    if err != nil {
        return err
    }
    defer listener.Close()

    go func() {
        <-ctx.Done()
        listener.Close() // unblocks Accept
    }()

    for {
        conn, err := listener.Accept()
        if err != nil {
            if ctx.Err() != nil {
                return nil // clean shutdown
            }
            log.Println("accept:", err)
            continue
        }
        go handleConn(conn)
    }
}
```

<div class="inline-exercises" data-concept="TCP"></div>
