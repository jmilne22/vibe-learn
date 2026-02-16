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

<div class="inline-exercises" data-concept="Middleware"></div>
