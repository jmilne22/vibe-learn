## Build: Cloud Reporter — Milestone 2

You measured Milestone 1's sequential fetch. Now make it concurrent — with the exact tools from this module — and prove the output didn't change.

### The assignment

1. **Discover, then fan out.** First request learns how many pages exist (`Link` header, or fetch until short page once and remember). Then fetch all remaining pages **concurrently**: one goroutine per page, results into a channel, `sync.WaitGroup` to know when you're done.
2. **Identical output.** Collect everything, *then* sort — result order must not depend on goroutine timing. The report must be byte-identical to Milestone 1's (pipe both to files and `diff` them).
3. **Race-clean.** `go test -race ./...` — every mistake this module's "Common Mistakes" section warned you about will attempt to happen in this code.

### Done when

- `diff <(git stash && go run . repos --org kubernetes --format json) <(git stash pop && go run . repos --org kubernetes --format json)` — or just save the old output first — shows no difference.
- `go test -race ./...` is clean.
- The wall-clock number you wrote down in Milestone 1 just dropped by roughly the page count. Update the comment with the new time — that ratio is this module's lesson in one number.

Commit.
