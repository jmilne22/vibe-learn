Module 5 taught you to consume APIs. Now you build them. Every K8s sidecar, webhook, health endpoint, and metrics exporter is an HTTP server.

---

## net/http Server Basics

### The Simplest Server

```go
package main

import (
    "fmt"
    "net/http"
)

func main() {
    http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
        fmt.Fprintf(w, "Hello, %s", r.URL.Path[1:])
    })
    http.ListenAndServe(":8080", nil)
}
```

### The Handler Interface

Everything in net/http revolves around one interface:

```go
type Handler interface {
    ServeHTTP(ResponseWriter, *Request)
}
```

Any type with `ServeHTTP` is a handler. `http.HandlerFunc` adapts a regular function:

```go
// These are equivalent:
http.Handle("/healthz", http.HandlerFunc(healthCheck))
http.HandleFunc("/healthz", healthCheck)
```

### Routing with ServeMux (Go 1.22+)

Go 1.22 added method and path parameter support to the standard mux:

```go
mux := http.NewServeMux()

mux.HandleFunc("GET /api/pods", listPods)
mux.HandleFunc("GET /api/pods/{name}", getPod)
mux.HandleFunc("POST /api/pods", createPod)
mux.HandleFunc("DELETE /api/pods/{name}", deletePod)

http.ListenAndServe(":8080", mux)
```

No third-party router needed for most use cases.

## Request Handling

### Reading Request Data

```go
func getPod(w http.ResponseWriter, r *http.Request) {
    // Path parameter (Go 1.22+)
    name := r.PathValue("name")

    // Query parameters
    namespace := r.URL.Query().Get("namespace")
    if namespace == "" {
        namespace = "default"
    }

    // Headers
    token := r.Header.Get("Authorization")

    // Method
    if r.Method != http.MethodGet {
        http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
        return
    }
}
```

### Parsing JSON Request Bodies

```go
func createPod(w http.ResponseWriter, r *http.Request) {
    var req struct {
        Name      string `json:"name"`
        Namespace string `json:"namespace"`
        Image     string `json:"image"`
    }

    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
        return
    }

    // validate...
    if req.Name == "" {
        http.Error(w, "name is required", http.StatusBadRequest)
        return
    }
}
```

### Writing JSON Responses

```go
func writeJSON(w http.ResponseWriter, status int, data any) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(status)
    json.NewEncoder(w).Encode(data)
}

// Usage
func listPods(w http.ResponseWriter, r *http.Request) {
    pods := []Pod{{Name: "web-1"}, {Name: "web-2"}}
    writeJSON(w, http.StatusOK, map[string]any{
        "pods":  pods,
        "count": len(pods),
    })
}
```

> **Gotcha:** Call `w.WriteHeader()` *after* setting headers, but *before* writing the body. Once you write the body, headers are already sent.

## Middleware Pattern

Middleware wraps a handler, adding behavior before/after the request:

```go
// The pattern: func(next http.Handler) http.Handler
func loggingMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        start := time.Now()
        next.ServeHTTP(w, r) // call the next handler
        slog.Info("request",
            "method", r.Method,
            "path", r.URL.Path,
            "duration", time.Since(start),
        )
    })
}
```

### Auth Middleware

```go
func authMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        token := r.Header.Get("Authorization")
        if token == "" {
            http.Error(w, "unauthorized", http.StatusUnauthorized)
            return // don't call next
        }
        if !strings.HasPrefix(token, "Bearer ") {
            http.Error(w, "invalid auth format", http.StatusUnauthorized)
            return
        }
        next.ServeHTTP(w, r)
    })
}
```

### Recovery Middleware

Convert panics to 500 responses instead of crashing the server:

```go
func recoveryMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        defer func() {
            if err := recover(); err != nil {
                slog.Error("panic recovered", "error", err, "path", r.URL.Path)
                http.Error(w, "internal server error", http.StatusInternalServerError)
            }
        }()
        next.ServeHTTP(w, r)
    })
}
```

### Chaining Middleware

```go
// Apply middleware in order: recovery → logging → auth → handler
handler := recoveryMiddleware(
    loggingMiddleware(
        authMiddleware(mux),
    ),
)
http.ListenAndServe(":8080", handler)
```

## Health & Readiness Endpoints

K8s probes two endpoints on your pods:

```go
// /healthz — liveness probe
// "Is this process alive?" Return 200 if yes, anything else restarts the pod.
func healthz(w http.ResponseWriter, r *http.Request) {
    w.WriteHeader(http.StatusOK)
    w.Write([]byte("ok"))
}

// /readyz — readiness probe
// "Can this pod handle traffic?" Return 200 if yes, 503 removes from service.
func readyz(w http.ResponseWriter, r *http.Request) {
    if !isReady() {
        w.WriteHeader(http.StatusServiceUnavailable)
        w.Write([]byte("not ready"))
        return
    }
    w.WriteHeader(http.StatusOK)
    w.Write([]byte("ready"))
}
```

### Dependency Checks

```go
func readyz(w http.ResponseWriter, r *http.Request) {
    checks := map[string]func() error{
        "database": checkDB,
        "cache":    checkRedis,
        "upstream": checkUpstreamAPI,
    }

    status := http.StatusOK
    results := make(map[string]string)

    for name, check := range checks {
        if err := check(); err != nil {
            status = http.StatusServiceUnavailable
            results[name] = "unhealthy: " + err.Error()
        } else {
            results[name] = "healthy"
        }
    }

    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(status)
    json.NewEncoder(w).Encode(results)
}
```

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

## Graceful Shutdown

```go
func main() {
    mux := http.NewServeMux()
    mux.HandleFunc("GET /healthz", healthz)
    mux.HandleFunc("GET /api/pods", listPods)

    srv := &http.Server{
        Addr:    ":8080",
        Handler: mux,
    }

    // Start server in goroutine
    go func() {
        slog.Info("server starting", "addr", srv.Addr)
        if err := srv.ListenAndServe(); err != http.ErrServerClosed {
            slog.Error("server error", "error", err)
        }
    }()

    // Wait for SIGTERM
    ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
    defer stop()
    <-ctx.Done()

    // Graceful shutdown with 10s deadline
    slog.Info("shutting down...")
    shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
    defer cancel()

    if err := srv.Shutdown(shutdownCtx); err != nil {
        slog.Error("shutdown error", "error", err)
    }
    slog.Info("server stopped")
}
```

`Shutdown` stops accepting new connections and waits for in-flight requests to complete. This is mandatory for K8s — without it, you drop requests during rolling deployments.

---

## Exercises

Practice individual concepts with quick drills, then tackle multi-step challenges.

<div id="warmups-container">
    <noscript><p class="js-required">JavaScript is required for the interactive exercises.</p></noscript>
</div>

### Challenges

Apply what you learned to infra-themed problems. Each challenge has multiple variants — shuffle to keep things fresh.

<div id="challenges-container">
    <noscript><p class="js-required">JavaScript is required for the interactive exercises.</p></noscript>
</div>
