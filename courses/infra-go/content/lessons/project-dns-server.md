## Project Goals

Build a DNS server from scratch. Parse binary DNS packets, resolve queries from a local zone file, and handle concurrent requests over UDP.

Your program should:

1. Listen on UDP port 5353 for DNS queries
2. Parse the DNS wire format binary protocol
3. Look up records from a zone file (A, AAAA, CNAME, MX, TXT)
4. Build and send properly formatted DNS response packets
5. Handle concurrent queries with goroutines
6. Optionally forward unknown queries to an upstream resolver

## Why This Project

DNS is the backbone of all infrastructure. Every service discovery system, every load balancer, every cloud provider relies on DNS. Building one from scratch teaches you binary protocol parsing, UDP networking, and concurrent request handling — skills that transfer directly to infra development.

This is also a project that will stop interviewers in their tracks. "I built a DNS server in Go from scratch" changes the conversation.

## How You Got Here

This server was built across Modules 8–9, five milestones in those modules' final **Build** sections. This page is the complete spec of the finished server; shipping it is Module 9's Build assignment.

## Usage

```bash
# Start with a zone file
dnsserver --zone zones.conf --port 5353

# With upstream forwarding for unknown domains
dnsserver --zone zones.conf --port 5353 --upstream 8.8.8.8:53

# Test with dig
dig @localhost -p 5353 web.local A
dig @localhost -p 5353 mail.local MX
dig @localhost -p 5353 web.local TXT
```

## Zone File Format

Keep it simple — one record per line:

```
# zones.conf
# domain    type  value

web.local      A     10.0.0.1
api.local      A     10.0.0.2
redis.local    A     10.0.0.3
db.local       A     10.0.0.4
db.local       A     10.0.0.5
web.local      AAAA  ::1
mail.local     MX    10 smtp.local
smtp.local     A     10.0.0.10
web.local      TXT   "v=spf1 include:_spf.local ~all"
cdn.local      CNAME web.local
```

## Requirements

### Core

- **UDP server:** Listen on a configurable port using `net.ListenPacket("udp", addr)`.
- **DNS header parsing:** Parse the 12-byte header (ID, flags, question/answer counts) using `encoding/binary.BigEndian`.
- **Domain name decoding:** Parse length-prefixed labels (`[7]example[3]com[0]`). Handle pointer compression (bytes starting with `0xC0`).
- **Question parsing:** Extract domain name, query type (QTYPE), and query class (QCLASS).
- **Response building:** Construct valid DNS responses with:
  - Header: copy query ID, set QR=1 (response), AA=1 (authoritative)
  - Question: copy from query
  - Answers: one resource record per matching zone entry
- **Zone file loader:** Parse the zone file at startup into a `map[string][]Record`.
- **Concurrent handling:** Process each query in a goroutine.

### Record Types to Support

| Type | Value | Format |
|---|---|---|
| A | 1 | 4-byte IPv4 address |
| AAAA | 28 | 16-byte IPv6 address |
| CNAME | 5 | Domain name in wire format |
| MX | 15 | 2-byte preference + domain name |
| TXT | 16 | Length-prefixed text strings |

### Response Codes

| RCODE | Meaning | When |
|---|---|---|
| 0 | No Error | Record found |
| 3 | NXDOMAIN | Domain not in zone file |
| 4 | Not Implemented | Unsupported query type |

### DNS Packet Layout Reference

```
+--+--+--+--+--+--+--+--+
|          Header         |  12 bytes
+--+--+--+--+--+--+--+--+
|        Question         |  Variable length
+--+--+--+--+--+--+--+--+
|         Answer          |  Variable length (0 or more RRs)
+--+--+--+--+--+--+--+--+

Header (12 bytes):
  Bytes 0-1:  ID (transaction identifier)
  Bytes 2-3:  Flags (QR, Opcode, AA, TC, RD, RA, Z, RCODE)
  Bytes 4-5:  QDCOUNT (questions)
  Bytes 6-7:  ANCOUNT (answers)
  Bytes 8-9:  NSCOUNT (authority, set to 0)
  Bytes 10-11: ARCOUNT (additional, set to 0)

Resource Record:
  Name:     Domain name (or pointer 0xC0 0x0C)
  Type:     2 bytes (A=1, AAAA=28, CNAME=5, MX=15, TXT=16)
  Class:    2 bytes (IN=1)
  TTL:      4 bytes (seconds)
  RDLength: 2 bytes (length of RDATA)
  RDATA:    Variable (the actual data)
```

## Suggested Structure

```
dnsserver/
├── main.go           ← CLI entry point, start UDP listener
├── server.go         ← Accept loop, dispatch to handlers
├── parser.go         ← Parse DNS query packets
├── parser_test.go    ← Test parsing with known-good packets
├── builder.go        ← Build DNS response packets
├── builder_test.go   ← Test building with expected bytes
├── zone.go           ← Load and query zone file
├── zone_test.go      ← Zone file parsing tests
└── zones.conf        ← Example zone file
```

## Hints

> **Suggested approach:**
>
> 1. Start with zone file parsing — it's the easiest piece and testable in isolation
> 2. Build the DNS header parser/builder — test with known byte sequences
> 3. Add domain name encoding/decoding
> 4. Wire up the UDP listener — read a packet, parse it, print what you got
> 5. Build responses for A records only first
> 6. Add NXDOMAIN for unknown domains
> 7. Add support for other record types one at a time
> 8. Add upstream forwarding last

### Testing with dig

```bash
# Query an A record
dig @localhost -p 5353 web.local A

# Expect:
# ;; ANSWER SECTION:
# web.local.    60    IN    A    10.0.0.1

# Query a non-existent domain
dig @localhost -p 5353 nope.local A
# Expect: status: NXDOMAIN
```

### Capturing Real DNS Packets for Testing

```bash
# Capture a real DNS query to use as test input
dig @8.8.8.8 example.com A +noedns | xxd
```

Save the raw bytes and use them in tests to verify your parser handles real-world packets.

## Testing

Test each layer independently:

```go
func TestParseHeader(t *testing.T) {
    // Known DNS header bytes
    raw := []byte{0xAA, 0xBB, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00}
    h := parseHeader(raw)
    if h.ID != 0xAABB { t.Errorf("ID: got %x, want 0xAABB", h.ID) }
    if h.QDCount != 1  { t.Errorf("QDCount: got %d, want 1", h.QDCount) }
}

func TestEncodeDomain(t *testing.T) {
    got := encodeDomain("example.com")
    want := []byte{7, 'e', 'x', 'a', 'm', 'p', 'l', 'e', 3, 'c', 'o', 'm', 0}
    if !bytes.Equal(got, want) {
        t.Errorf("got %v, want %v", got, want)
    }
}

func TestZoneLoad(t *testing.T) {
    zone, err := loadZone("testdata/zones.conf")
    if err != nil { t.Fatal(err) }
    records := zone.Lookup("web.local", TypeA)
    if len(records) != 1 { t.Errorf("got %d records, want 1", len(records)) }
}
```

## Stretch Goals

- **Upstream forwarding:** If a domain isn't in the zone file, forward the query to an upstream resolver (e.g., 8.8.8.8) and relay the response back
- **TTL-based caching:** Cache upstream responses with proper TTL expiration
- **TCP support:** Handle DNS queries over TCP (required for responses > 512 bytes)
- **Wildcard records:** Support `*.local` wildcard entries
- **Metrics:** Count queries per domain, queries per type, NXDOMAIN rate
- **Hot reload:** Watch the zone file for changes and reload without restart

> **Skills Used:** UDP networking, binary protocol parsing (encoding/binary), goroutines, maps, structs, file I/O, byte slice manipulation, bit operations (flags), net.IP parsing, concurrent request handling.
