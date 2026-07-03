## Build: DNS Server — Milestones 1–3

Tool three drops below HTTP. It looks intimidating; it is five small programs stacked up, and the first three need nothing beyond this module plus the wire-format reference on the [project page](project-dns-server.html). Keep that reference open — it's your map.

```bash
mkdir dnsserver && cd dnsserver
git init
go mod init dnsserver
```

### Milestone 1 — UDP echo

`net.ListenPacket("udp", ":5353")`, read packets in a loop, hex-dump each (`encoding/hex.Dump`), echo it back. Then point a real query at it:

```bash
dig @localhost -p 5353 anything.local A
```

That hex dump on your screen is a real DNS query. **Done when** you can circle the ID, flags, and QDCOUNT bytes in it using the packet layout reference.

### Milestone 2 — Parse header and question

Pure functions, no networking: `parseHeader([]byte) Header` and `parseQuestion([]byte) (Question, error)`, decoding length-prefixed labels (`[3]web[5]local[0]` → `web.local`). Capture fixture packets with the project page's `dig | xxd` trick and test against them.

**Done when** `go test ./...` passes against at least three fixture packets, including one you captured yourself.

### Milestone 3 — Answer A records

`buildResponse(query, ips)`: copy the query ID, set QR/AA flags, append one A record per IP from a hardcoded `map[string][]string` zone. Wire it into the Milestone 1 loop.

**Done when:**

```bash
dig @localhost -p 5353 web.local A
# ;; ANSWER SECTION:
# web.local.   60   IN   A   10.0.0.1
```

Commit after each milestone. Module 9 finishes the job: real zone files, all record types, concurrency, forwarding.
