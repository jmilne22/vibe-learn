## Count what is waiting

A telemetry pipeline has several places where “accepted” can mean different things:

```text
application -> receiver -> queue -> exporter -> storage -> query
```

A receiver can acknowledge a request before storage has persisted it. A queue may be in memory. A successful storage write may still not be immediately visible to a particular query path. When somebody says “we delivered the logs,” ask which boundary they measured.

### A queue buys time

Suppose input is 1,000 records per second and export manages 800. The backlog grows by about 200 records per second. A buffer with room for 10,000 more records buys about 50 seconds at those rates. Once export recovers to 1,500 while input stays at 1,000, draining those 10,000 records takes about 20 seconds.

These calculations assume stable rates and record sizes. A Collector queue may be configured in requests, items, or bytes depending on component/version/configuration; do not substitute a request count for a byte bound. Our lab explicitly uses four queued export requests and one consumer. One request can contain many records.

If arrival exceeds service capacity indefinitely, no finite queue solves the problem. Options include increasing effective processing capacity, reducing incoming work, rejecting producers, or dropping according to a documented policy. Each has a cost.

### Retries preserve some work and duplicate some work

A temporary export failure can be retried. If the receiver persisted a batch but lost its response, a retry can repeat it. “Retry enabled” is not an exactly-once delivery guarantee. Persistence of the queue, retry expiration, restart behavior, receiver idempotency, and source behavior all matter.

An in-memory queue disappears on process exit. A persistent queue can survive some restarts, but still needs storage capacity and a defined failure model. Replication and durable acknowledgment are different from putting a queue on disk.

The local lab deliberately uses an in-memory queue and a receiver that counts accepted requests in memory. It demonstrates buffering and backpressure; it does not demonstrate durable storage or deduplication.

### Observe rates and pressure together

Useful observations include received records, exported records, failed exports, queue size/capacity, refused input, CPU, and memory. Queue growth with stable CPU can suggest a downstream bottleneck. High CPU and falling export throughput can suggest work inside the Collector. These are starting hypotheses, not conclusions.

A cumulative failure counter does not prove there is an active outage. Compare its rate of change, the queue trend, and current successful exports. Beware resets when the process restarts.

**Guided lab:** make the receiver unavailable, observe bounded buffering, then restore it and watch queued work drain. Notice what the producer receives when the queue fills.

Reference: [OpenTelemetry Collector resiliency](https://opentelemetry.io/docs/collector/resiliency/).
