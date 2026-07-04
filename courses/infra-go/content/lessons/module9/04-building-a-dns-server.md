## Building a DNS Server

<attempt type="worked">

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

</attempt>

Test it: `dig @localhost -p 5353 web.local`

<attempt type="gaps">

<gaps prompt="The query handler, from memory — where does the question start, and what if the domain is unknown?">
```go
func handleDNSQuery(pc net.PacketConn, addr net.Addr, query []byte, records map[string]net.IP) {
    domain, _ := decodeDomain(query, «12»)

    ip, found := records[domain]
    if !«found» {
        pc.WriteTo(buildNXDomain(query), addr)
        «return»
    }

    pc.WriteTo(«buildResponse(query, ip)», addr)
}
```
</gaps>

</attempt>
