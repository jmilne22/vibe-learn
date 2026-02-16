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
