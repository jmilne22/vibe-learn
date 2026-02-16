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

<div class="inline-exercises" data-concept="DNS Wire Format"></div>
