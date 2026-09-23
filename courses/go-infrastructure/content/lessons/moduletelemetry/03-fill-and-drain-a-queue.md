## Fill and drain a Collector queue

Build the fixture image from the setup lesson. Work in the copied `$LAB_ROOT/telemetry` directory with compose.yaml, collector.yaml, and send.sh from the file-reference section.

```sh
cd "$LAB_ROOT/telemetry"
docker compose -p vibe-course-telemetry up -d
docker compose -p vibe-course-telemetry logs collector
curl --fail http://127.0.0.1:18080/stats
bash send.sh first
```

Wait for the Collector to report it is ready before sending. Ports are bound to loopback: 14318 receives OTLP/HTTP logs, 18888 exposes Collector metrics, and 18080 controls/inspects the supplied receiver. If a port is occupied, stop the lab and choose another host port consistently in Compose and the commands.

The sender transmits one log record in one request. The Collector exports JSON without compression to the fixture. The fixture counts accepted batches and discards their contents. It is not a storage engine and does not implement full OTLP validation.

```sh
curl --fail http://127.0.0.1:18080/stats
curl --silent --fail http://127.0.0.1:18888/metrics \
  | grep -E 'queue_(size|capacity)|sent_log_records|enqueue_failed'
```

The first request should eventually increase received_batches and sent_log_records. Metrics can be observed between updates; retry the observation before assuming nothing happened.

### Make export fail

The receiver's control endpoint makes `/v1/logs` return 503 while leaving its inspection endpoint available:

```sh
curl --fail -X POST 'http://127.0.0.1:18080/control?fail=true'
for i in $(seq 1 12); do
  bash send.sh "$i" || true
done
curl --silent --fail http://127.0.0.1:18888/metrics \
  | grep -E 'queue_(size|capacity)|enqueue_failed|sent_log_records'
docker compose -p vibe-course-telemetry logs --tail 20 collector
```

The `|| true` keeps this deliberate failure loop sending so you can see both accepted and refused input; do not copy it into a producer that must handle failures correctly.

Observe a queue capacity of four and queue growth while exports retry. Once capacity is exhausted, some sends receive 503 with `sending queue is full`. The exact number of accepted requests depends on scheduling; do not grade yourself on reproducing a specific count. The refusal counter records input that could not enter the exporter queue.

### Restore the receiver promptly

The retry window is 30 seconds. To observe recovery of the same queued work, restore the receiver before that window expires:

```sh
curl --fail -X POST 'http://127.0.0.1:18080/control?fail=false'
curl --silent --fail http://127.0.0.1:18888/metrics \
  | grep -E 'queue_size|sent_log_records'
curl --fail http://127.0.0.1:18080/stats
```

Over the following seconds, queue size should fall and accepted/sent counts should increase. If you spent longer reading the logs, queued requests may already have exhausted retries. Repeat with a fresh baseline; expired work is not restored just because the receiver is healthy again.

A refused producer request is not automatically retried by send.sh. A real SDK/exporter may retry it, with its own limits. Count each boundary separately rather than subtracting unrelated counters and calling the result data loss.

### What would a restart demonstrate?

This queue is in memory. Restarting the Collector can discard pending work and resets its process counters; graceful shutdown may first attempt to drain. Restarting the receiver resets its accepted-batch count. Neither process has durable storage in this lab.

Do not call a graceful restart proof of persistent buffering. Testing persistence requires a persistent queue configuration and a failure experiment that distinguishes recovered work from work drained before exit.

### Clean up

```sh
docker compose -p vibe-course-telemetry down
```

This removes the lab containers and network. It does not delete other containers or prune downloaded images. If you no longer want the fixture image after both labs, remove only `vibe-course-fixture:1`.

Reference: [Collector resiliency](https://opentelemetry.io/docs/collector/resiliency/).
