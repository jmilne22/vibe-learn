## Structured Logging

### log/slog (Standard Library)

```go
import "log/slog"

// Text output (development)
slog.Info("server starting", "port", 8080)
// 2024-01-15T10:30:00Z INFO server starting port=8080

// JSON output (production)
logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
slog.SetDefault(logger)
slog.Info("request handled", "method", "GET", "path", "/api/pods", "status", 200)
// {"time":"2024-01-15T10:30:00Z","level":"INFO","msg":"request handled","method":"GET","path":"/api/pods","status":200}
```

### Adding Context

```go
// Create a logger with common fields
reqLogger := slog.With(
    "request_id", requestID,
    "remote_addr", r.RemoteAddr,
)

reqLogger.Info("handling request", "method", r.Method, "path", r.URL.Path)
reqLogger.Error("failed to fetch pod", "error", err)
```
