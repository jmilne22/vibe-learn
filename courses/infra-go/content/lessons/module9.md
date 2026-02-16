You've used HTTP. Now go deeper. TCP, UDP, DNS wire format, and gRPC. This is what separates infra developers from people who call APIs.

---

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

## The DNS Wire Format

DNS is the protocol every infra person should understand at the byte level.

### Packet Structure

Every DNS message (query and response) has the same format:

```
+--+--+--+--+--+--+--+
|        Header       |   12 bytes: ID, flags, counts
+--+--+--+--+--+--+--+
|       Question      |   What are you asking?
+--+--+--+--+--+--+--+
|       Answer        |   The response records
+--+--+--+--+--+--+--+
```

### Header (12 bytes)

```go
type DNSHeader struct {
    ID      uint16 // transaction ID
    Flags   uint16 // QR, Opcode, AA, TC, RD, RA, RCODE
    QDCount uint16 // number of questions
    ANCount uint16 // number of answers
    NSCount uint16 // authority records (usually 0)
    ARCount uint16 // additional records (usually 0)
}
```

### Encoding with encoding/binary

```go
import "encoding/binary"

// Parse header from raw bytes
func parseHeader(data []byte) DNSHeader {
    var h DNSHeader
    h.ID = binary.BigEndian.Uint16(data[0:2])
    h.Flags = binary.BigEndian.Uint16(data[2:4])
    h.QDCount = binary.BigEndian.Uint16(data[4:6])
    h.ANCount = binary.BigEndian.Uint16(data[6:8])
    h.NSCount = binary.BigEndian.Uint16(data[8:10])
    h.ARCount = binary.BigEndian.Uint16(data[10:12])
    return h
}

// Serialize header to bytes
func (h DNSHeader) bytes() []byte {
    buf := make([]byte, 12)
    binary.BigEndian.PutUint16(buf[0:2], h.ID)
    binary.BigEndian.PutUint16(buf[2:4], h.Flags)
    binary.BigEndian.PutUint16(buf[4:6], h.QDCount)
    binary.BigEndian.PutUint16(buf[6:8], h.ANCount)
    binary.BigEndian.PutUint16(buf[8:10], h.NSCount)
    binary.BigEndian.PutUint16(buf[10:12], h.ARCount)
    return buf
}
```

DNS uses big-endian (network byte order). `encoding/binary` is your tool for all binary protocols.

### Domain Name Encoding

DNS encodes domain names as length-prefixed labels:

```
example.com → [7]example[3]com[0]
```

```go
// Encode domain name to DNS wire format
func encodeDomain(domain string) []byte {
    var buf []byte
    for _, label := range strings.Split(domain, ".") {
        buf = append(buf, byte(len(label)))
        buf = append(buf, []byte(label)...)
    }
    buf = append(buf, 0) // null terminator
    return buf
}

// Decode domain name from DNS wire format
func decodeDomain(data []byte, offset int) (string, int) {
    var labels []string
    for {
        length := int(data[offset])
        if length == 0 {
            offset++
            break
        }
        offset++
        labels = append(labels, string(data[offset:offset+length]))
        offset += length
    }
    return strings.Join(labels, "."), offset
}
```

### Building a DNS Response

```go
func buildResponse(query []byte, ip net.IP) []byte {
    // Copy the query ID
    id := binary.BigEndian.Uint16(query[0:2])

    header := DNSHeader{
        ID:      id,
        Flags:   0x8180, // Response, no error, recursion available
        QDCount: 1,
        ANCount: 1,
    }

    // Copy the question section from the query
    questionStart := 12
    questionEnd := questionStart
    for query[questionEnd] != 0 {
        questionEnd += int(query[questionEnd]) + 1
    }
    questionEnd += 5 // null byte + QTYPE (2) + QCLASS (2)
    question := query[questionStart:questionEnd]

    // Build answer: name pointer + type A + class IN + TTL + IP
    var answer []byte
    answer = append(answer, 0xC0, 0x0C)                            // pointer to name in question
    answer = append(answer, 0, 1)                                   // type A
    answer = append(answer, 0, 1)                                   // class IN
    answer = append(answer, 0, 0, 0, 60)                            // TTL 60 seconds
    answer = append(answer, 0, 4)                                   // data length
    answer = append(answer, ip.To4()...)                             // IP address

    var resp []byte
    resp = append(resp, header.bytes()...)
    resp = append(resp, question...)
    resp = append(resp, answer...)
    return resp
}
```

## Building a DNS Server

Combine UDP + DNS parsing to build a working DNS server:

```go
func main() {
    // Static records
    records := map[string]net.IP{
        "web.local":   net.ParseIP("10.0.0.1"),
        "api.local":   net.ParseIP("10.0.0.2"),
        "redis.local": net.ParseIP("10.0.0.3"),
    }

    pc, err := net.ListenPacket("udp", ":5353")
    if err != nil {
        log.Fatal(err)
    }
    defer pc.Close()
    slog.Info("DNS server listening", "addr", ":5353")

    buf := make([]byte, 512)
    for {
        n, addr, err := pc.ReadFrom(buf)
        if err != nil {
            continue
        }
        go handleDNSQuery(pc, addr, buf[:n], records)
    }
}

func handleDNSQuery(pc net.PacketConn, addr net.Addr, query []byte, records map[string]net.IP) {
    // Parse the question
    domain, _ := decodeDomain(query, 12)

    ip, found := records[domain]
    if !found {
        // Send NXDOMAIN response
        resp := buildNXDomain(query)
        pc.WriteTo(resp, addr)
        return
    }

    resp := buildResponse(query, ip)
    pc.WriteTo(resp, addr)
    slog.Info("resolved", "domain", domain, "ip", ip, "client", addr)
}
```

Test it: `dig @localhost -p 5353 web.local`

## gRPC & Protocol Buffers

### Why gRPC?

| Feature | REST/JSON | gRPC/Protobuf |
|---|---|---|
| Encoding | Text (JSON) | Binary (protobuf) |
| Schema | OpenAPI (optional) | .proto (required) |
| Code gen | Optional | Built-in |
| Streaming | Websockets/SSE | Native bidirectional |
| Performance | Good | Great (2-10x smaller, faster) |

gRPC is the standard for internal service communication in K8s, Envoy, Istio, and most CNCF projects.

### Defining a Service (.proto)

```protobuf
syntax = "proto3";
package infra;

option go_package = "github.com/example/infra/pb";

message Pod {
  string name = 1;
  string namespace = 2;
  string status = 3;
  int32 replicas = 4;
}

message ListPodsRequest {
  string namespace = 1;
}

message ListPodsResponse {
  repeated Pod pods = 1;
}

service PodService {
  rpc ListPods(ListPodsRequest) returns (ListPodsResponse);
  rpc WatchPods(ListPodsRequest) returns (stream Pod);  // server-side streaming
}
```

### Generating Go Code

```bash
# Install: go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
#          go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest
protoc --go_out=. --go-grpc_out=. pod.proto
```

This generates `pod.pb.go` (message types) and `pod_grpc.pb.go` (service interface).

### Implementing the Server

```go
type podServer struct {
    pb.UnimplementedPodServiceServer
    pods []pb.Pod
}

func (s *podServer) ListPods(ctx context.Context, req *pb.ListPodsRequest) (*pb.ListPodsResponse, error) {
    var filtered []*pb.Pod
    for i := range s.pods {
        if req.Namespace == "" || s.pods[i].Namespace == req.Namespace {
            filtered = append(filtered, &s.pods[i])
        }
    }
    return &pb.ListPodsResponse{Pods: filtered}, nil
}

// Server-side streaming
func (s *podServer) WatchPods(req *pb.ListPodsRequest, stream pb.PodService_WatchPodsServer) error {
    for i := range s.pods {
        if req.Namespace == "" || s.pods[i].Namespace == req.Namespace {
            if err := stream.Send(&s.pods[i]); err != nil {
                return err
            }
        }
    }
    return nil
}

func main() {
    lis, _ := net.Listen("tcp", ":50051")
    grpcServer := grpc.NewServer()
    pb.RegisterPodServiceServer(grpcServer, &podServer{})
    grpcServer.Serve(lis)
}
```

### Building the Client

```go
conn, err := grpc.Dial("localhost:50051", grpc.WithTransportCredentials(insecure.NewCredentials()))
if err != nil {
    log.Fatal(err)
}
defer conn.Close()

client := pb.NewPodServiceClient(conn)

// Unary call
resp, err := client.ListPods(context.Background(), &pb.ListPodsRequest{Namespace: "production"})
if err != nil {
    log.Fatal(err)
}
for _, pod := range resp.Pods {
    fmt.Printf("%s/%s: %s\n", pod.Namespace, pod.Name, pod.Status)
}

// Server-side streaming
stream, err := client.WatchPods(context.Background(), &pb.ListPodsRequest{})
if err != nil {
    log.Fatal(err)
}
for {
    pod, err := stream.Recv()
    if err == io.EOF {
        break
    }
    if err != nil {
        log.Fatal(err)
    }
    fmt.Printf("got pod: %s\n", pod.Name)
}
```

### gRPC Streaming Patterns

```
Unary:         Client ---request--> Server ---response--> Client
Server stream: Client ---request--> Server ---stream of responses--> Client
Client stream: Client ---stream of requests--> Server ---response--> Client
Bidirectional: Client <---stream--> Server
```

**Real uses:**
- **Server streaming:** Watch for resource changes (like `kubectl get pods -w`)
- **Client streaming:** Upload logs, send batched metrics
- **Bidirectional:** Chat, real-time sync, terminal sessions

---

## Exercises

Practice individual concepts with quick drills, then tackle multi-step challenges.

<div id="warmups-container">
    <noscript><p class="js-required">JavaScript is required for the interactive exercises.</p></noscript>
</div>

### Challenges

Apply what you learned to infra-themed problems. Each challenge has multiple variants — shuffle to keep things fresh.

<div id="challenges-container">
    <noscript><p class="js-required">JavaScript is required for the interactive exercises.</p></noscript>
</div>
