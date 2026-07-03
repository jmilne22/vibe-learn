## Build: Ship the DNS Server — Milestones 4–5

Your server answers hardcoded A records. This module's material — binary protocols, UDP, concurrency at the socket level — finishes it.

### Milestone 4 — Real zone, real answers

1. **Zone file loader:** parse the `zones.conf` format from the [project page](project-dns-server.html) into `map[string][]Record` at startup.
2. **NXDOMAIN:** RCODE 3 for domains not in the zone.
3. **All five record types:** A, AAAA, CNAME, MX, TXT — each has its RDATA format in the project page's table.
4. **Name compression:** handle pointer bytes (`0xC0 ...`) when decoding, use `0xC00C` when encoding answers.

**Done when** every `dig` example in the project page's Usage section returns the right records, and `dig nope.local` returns status NXDOMAIN.

### Milestone 5 — Concurrent + forwarding

1. **One goroutine per query.** Prove it holds up:

   ```bash
   for i in $(seq 50); do dig @localhost -p 5353 web.local A & done; wait
   ```

   Fifty clean answers, and `go test -race ./...` stays green.
2. **Upstream forwarding:** `--upstream 8.8.8.8:53` relays unknown domains and returns the upstream answer.
3. **README with a real dig session transcript.** Push it.

**Shipped: three of five.** "I built a DNS server in Go from scratch" — that sentence is now true, and you have the repo to prove it.
