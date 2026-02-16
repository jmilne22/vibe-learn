## Reading Prometheus Source

### Repository Structure

`prometheus/prometheus`:

| Directory | What's There |
|---|---|
| `cmd/prometheus/` | Main binary |
| `scrape/` | Scrape loop (HTTP polling) |
| `storage/` | TSDB (time series database) |
| `promql/` | Query language engine |
| `web/` | HTTP API and UI |

### How Scraping Works

```
scrape/manager.go
  → Creates a scrape pool per target group
  → Each pool runs N scrapers (goroutines)
  → Each scraper:
    1. Sleeps for the scrape interval
    2. HTTP GET to the /metrics endpoint
    3. Parses Prometheus exposition format
    4. Writes samples to TSDB
```

This is a worker pool pattern (Module 7) with rate limiting (scrape interval).

### How Exporters Work

An exporter is an HTTP server (Module 8) that exposes a `/metrics` endpoint:

```go
import "github.com/prometheus/client_golang/prometheus"

var httpRequests = prometheus.NewCounterVec(
    prometheus.CounterOpts{
        Name: "http_requests_total",
        Help: "Total HTTP requests.",
    },
    []string{"method", "path", "status"},
)

func init() {
    prometheus.MustRegister(httpRequests)
}

// In your handler:
httpRequests.WithLabelValues("GET", "/api/pods", "200").Inc()
```

Everything you learned in this course comes together: structs (metrics), interfaces (collectors), HTTP servers (exporter), concurrency (scrape pools).
