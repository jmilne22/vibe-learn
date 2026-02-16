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

<div class="inline-exercises" data-concept="Health Endpoints"></div>
