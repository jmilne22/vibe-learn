## Review what the tool can claim

A passing test suite establishes the checked behaviors. It does not establish that the tool measures availability accurately under every network condition. Review the claims you would make to somebody using its report.

### Why preserve input order?

Completion order varies. Stable output makes reports easier to compare and ties each result to the corresponding configuration entry. A result includes its target anyway, so order is a usability choice, not a substitute for identity. Indexed output also avoids locking concurrent append operations.

### Why avoid automatic redirects and retries?

A redirect can move the request to another service. A retry can hide an intermittent failure or exceed the expected request budget. Both can be useful, but this command deliberately reports one response from each configured endpoint. If you add either behavior later, change the contract and output so the extra work is visible.

### Why cancel the whole report instead of printing half?

The CLI's JSON array represents one completed run. Parent cancellation returns an error with no partial report. A streaming interface could be a better choice for thousands of targets, but it needs a way to represent incomplete runs. Printing half a JSON array is not such a protocol.

An output write can fail after some bytes were written. The program cannot undo those bytes. It should return failure and explain it on stderr. A file-output mode could write a temporary file and rename it after successful completion, but stdout cannot be made transactional that way.

### Why is this not yet a monitoring system?

It has no observation history, repeated sampling, alert policy, or assessment of where the probe runs relative to users. One successful request from your laptop does not prove the service is healthy for another network. One timeout does not prove the server did nothing.

The configuration size and report size are also unbounded in this teaching implementation. A remote service accepting untrusted target URLs would need additional network restrictions and resource limits. Those are separate requirements from a local command operated by a trusted user.

### Explain one failure without guessing

Try this constructed interview-style prompt:

> After changing worker count from 4 to 100, reports finish more slowly and show more timeouts. What would you inspect?

<details><summary>A reasoned answer</summary>

First confirm what changed besides the configured worker count. Inspect in-flight requests, server capacity, client/transport limits, CPU, network errors, and request durations. Higher concurrency can overload the target or introduce contention; it does not guarantee higher throughput. Compare a controlled run at several bounds against a known local server. Keep error classes separate so DNS failures, connection failures, and response delays do not collapse into “slow.” Choose a new bound from evidence rather than assuming 100 is intrinsically wrong.

</details>

A useful answer names a hypothesis and an observation that could disprove it. Listing every observability tool you know does not establish a diagnosis.

### Optional extensions, in order of interest

These are outside the 30-hour core. Choose one or two; doing all is roughly another ten hours.

- **Profile before changing code (2 hours).** Generate a large local input, add a benchmark for parsing/report assembly, collect CPU/allocation profiles, and explain one measured bottleneck. Keep network latency out of a CPU benchmark. [Go diagnostics](https://go.dev/doc/diagnostics).
- **Add a bounded retry policy (2 hours).** Extend the retry-budget exercise with an injected wait function, capped exponential delay, cancellation while waiting, and a documented retryable-error policy. Explain duplicate-operation risk before using it for writes.
- **Review a Helm upgrade (2 hours).** Render two configurations, compare the resulting Deployment, and observe which changes replace Pods. Inspect Helm history and roll back one local revision. Explain why rolling back manifests does not necessarily roll back external data changes.
- **Move into a project (up to 4 hours to begin).** Pick an early stage of the [Ingest Relay](#/read/project%3Aingest-relay/overview) for a small service, [Gossip Glomers](#/read/project%3Agossip-glomers/overview) for message handling, or [Tiny TSDB](#/read/project%3Atiny-tsdb/session-1) for data representation. These estimates are for starting a stage, not finishing a whole project. The [Relay Operator](#/read/project%3Arelay-operator/overview) needs a working relay and remains guided rather than app-graded.

You should leave with a few pieces of code and investigations you can explain precisely. Use your actual work when discussing them; the course's constructed scenarios are not employment experience.
