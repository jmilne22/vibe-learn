#!/usr/bin/env bash
set -euo pipefail
# One OTLP/HTTP request with one log record. First argument labels the record.
label=${1:-one}
curl --silent --show-error --fail-with-body \
  -H 'Content-Type: application/json' \
  http://127.0.0.1:14318/v1/logs \
  --data-binary "{\"resourceLogs\":[{\"scopeLogs\":[{\"logRecords\":[{\"timeUnixNano\":\"$(date +%s)000000000\",\"body\":{\"stringValue\":\"lab-$label\"}}]}]}]}"
