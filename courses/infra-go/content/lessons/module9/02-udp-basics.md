## UDP Basics

UDP is connectionless — send a packet, don't wait for acknowledgment.

### Sending and Receiving

```go
// Server: listen for packets
pc, err := net.ListenPacket("udp", ":5000")
if err != nil {
    log.Fatal(err)
}
defer pc.Close()

buf := make([]byte, 1024)
for {
    n, addr, err := pc.ReadFrom(buf)
    if err != nil {
        log.Println(err)
        continue
    }
    msg := string(buf[:n])
    slog.Info("received", "from", addr, "msg", msg)
    pc.WriteTo([]byte("ACK: "+msg), addr) // respond to sender
}
```

```go
// Client: send a packet
conn, err := net.Dial("udp", "localhost:5000")
if err != nil {
    log.Fatal(err)
}
defer conn.Close()

conn.Write([]byte("hello"))
buf := make([]byte, 1024)
n, _ := conn.Read(buf)
fmt.Println(string(buf[:n])) // "ACK: hello"
```

### When to Use UDP

| Use Case | Why UDP |
|---|---|
| DNS queries | Single request/response, low latency |
| Metrics (StatsD) | Losing a metric is fine, speed matters |
| Service discovery | Quick broadcast, no connection overhead |
| Game servers | Latency > reliability |
| Health pings | Simple, fast, stateless |

TCP guarantees delivery and ordering. UDP doesn't — but it's faster and simpler for fire-and-forget patterns.

<div class="inline-exercises" data-concept="UDP"></div>
