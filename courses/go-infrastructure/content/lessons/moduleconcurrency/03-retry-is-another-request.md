## A retry is another operation

A server writes a record, then its response is lost. The client sees a timeout. If it retries, the server may write the record again. The timeout tells you the client did not receive the answer; it does not tell you whether the server performed the operation.

Before adding retries, decide:

- Which failures might be temporary?
- Is repeating the operation safe, or does it need an idempotency key?
- How many total attempts are allowed, and within what overall deadline?
- What happens if every client retries at once?

**Exercise: Limit retry attempts.** This isolates counting and cancellation. `attempts=1` means one call, not one initial call plus a retry. Return the last failure when the budget is exhausted. Stop immediately after success.

The exercise deliberately has no waiting and should not be copied as a complete network retry policy. A real policy generally needs bounded backoff, jitter, a retryable-error classification, and an overall budget. Per-attempt timeouts alone can multiply into a long total wait.

### Do the arithmetic

If five layers each allow three attempts, one top-level request can cause up to 3⁵ = 243 calls at the deepest layer in the worst case. The exact behavior depends on which layer fails and when, but the multiplication explains why retries need ownership across a system.

Jitter spreads retries over time. It does not make a permanently failing dependency recover or make a duplicate write safe. An idempotency key only helps if the receiver's storage and retention policy enforce its meaning.

### Optional extension: add waiting without slow tests

Allow a wait function to be supplied to a retry helper. Production code can use a timer that also selects on cancellation. A test can record requested delays and return immediately. Bound the maximum delay and the total attempts. Test that cancellation while waiting prevents another operation.

Do this after the core exercises. Do not add retries to the final endpoint report: its contract is intentionally one request per target so the reported observation stays easy to interpret.

Reference: [AWS Builders' Library: timeouts, retries, and backoff with jitter](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/).
