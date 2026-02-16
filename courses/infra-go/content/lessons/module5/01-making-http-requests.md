## Making HTTP Requests

### Simple GET

```go
// Quick and dirty — fine for scripts, not for production
resp, err := http.Get("https://api.example.com/pods")
if err != nil {
    return fmt.Errorf("fetching pods: %w", err)
}
defer resp.Body.Close()
```

### Real Requests with http.Client

```go
client := &http.Client{
    Timeout: 10 * time.Second,
}

req, err := http.NewRequest("GET", "https://api.example.com/pods", nil)
if err != nil {
    return fmt.Errorf("creating request: %w", err)
}
req.Header.Set("Accept", "application/json")
req.Header.Set("Authorization", "Bearer "+token)

resp, err := client.Do(req)
if err != nil {
    return fmt.Errorf("executing request: %w", err)
}
defer resp.Body.Close()
```

**Always set a timeout.** The default `http.Client` has no timeout — a hanging server will block your goroutine forever.

*Python comparison*

```python
# Python: requests.get(url, headers={...}, timeout=10)
# Go: more verbose, but you control every aspect of the request.
# The tradeoff: Go makes the timeout, headers, and body explicit.
```

### Context-Aware Requests

```go
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()

req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
// ... request will be cancelled if context expires
```

Use context for request-scoped timeouts, especially in servers where you're making outbound calls.

<div class="inline-exercises" data-concept="HTTP Requests"></div>
<div class="inline-exercises" data-concept="HTTP Errors"></div>
