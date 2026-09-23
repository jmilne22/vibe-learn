## Telemetry lab files

These are the complete supplied files. Create each path relative to your isolated `LAB_ROOT`, or use the matching files under `courses/go-infrastructure/labs` in the repository. They are included here so the recipe remains readable offline. Do not paste the headings or code fences into files.

The receiver uses the same fixture image as the Kubernetes lab; its complete Go source and Dockerfile are in the Kubernetes file-reference section. You can build it without creating a cluster.

<details>
<summary>telemetry/compose.yaml</summary>

```yaml
services:
  receiver:
    image: vibe-course-fixture:1
    ports:
      - "127.0.0.1:18080:8080"
  collector:
    image: otel/opentelemetry-collector:0.148.0
    command: ["--config=/etc/otelcol/config.yaml"]
    volumes:
      - ./collector.yaml:/etc/otelcol/config.yaml:ro
    ports:
      - "127.0.0.1:14318:4318"
      - "127.0.0.1:18888:8888"
```

</details>

<details>
<summary>telemetry/collector.yaml</summary>

```yaml
receivers:
  otlp:
    protocols:
      http:
        endpoint: 0.0.0.0:4318
exporters:
  otlp_http/lab:
    endpoint: http://receiver:8080
    encoding: json
    compression: none
    timeout: 2s
    sending_queue:
      enabled: true
      num_consumers: 1
      queue_size: 4
      sizer: requests
    retry_on_failure:
      enabled: true
      initial_interval: 1s
      max_interval: 2s
      max_elapsed_time: 30s
service:
  telemetry:
    metrics:
      readers:
        - pull:
            exporter:
              prometheus:
                host: 0.0.0.0
                port: 8888
  pipelines:
    logs:
      receivers: [otlp]
      exporters: [otlp_http/lab]
```

</details>

<details>
<summary>telemetry/send.sh</summary>

```bash
#!/usr/bin/env bash
set -euo pipefail
# One OTLP/HTTP request with one log record. First argument labels the record.
label=${1:-one}
curl --silent --show-error --fail-with-body \
  -H 'Content-Type: application/json' \
  http://127.0.0.1:14318/v1/logs \
  --data-binary "{\"resourceLogs\":[{\"scopeLogs\":[{\"logRecords\":[{\"timeUnixNano\":\"$(date +%s)000000000\",\"body\":{\"stringValue\":\"lab-$label\"}}]}]}]}"
```

</details>
