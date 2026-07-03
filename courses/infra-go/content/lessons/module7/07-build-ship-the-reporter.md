## Build: Ship the Cloud Reporter

Milestone 2's fan-out is fast but rude — unbounded goroutines, no cancellation, no respect for rate limits. This module taught you production manners. Apply them and ship tool two.

### The assignment

The full spec is on the [Cloud Reporter project page](project-cloud-reporter.html) — all of it is now your job:

1. **Bounded worker pool:** cap concurrent requests at 5 (semaphore channel or worker pool — you've built both in this module's exercises).
2. **Context everywhere:** `--timeout` creates a `context.WithTimeout` that cancels all in-flight requests cleanly. A 1-second timeout against a big org must exit promptly with an error — no panics, no leaked goroutines.
3. **Rate-limit awareness:** check `X-RateLimit-Remaining`; warn and slow down under 10.
4. **Remaining formats:** JSON and CSV output, plus the aggregation summary (total stars, repos per language, recently updated).
5. **README, push, ship.**

### Done when

- Every command in the project page's Usage section works.
- `go test -race ./...` passes.
- `--timeout 1` on a large org exits fast and clean.
- Repo pushed with README. **Shipped: two of five** — and this one has bounded concurrency and graceful cancellation in it, which is the sentence you'll say in interviews.
