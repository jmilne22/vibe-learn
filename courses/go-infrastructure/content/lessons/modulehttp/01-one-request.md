## Separate an HTTP response from a failed request

You ask `/ready` whether a service can accept work. It returns 503. The network request succeeded: you received an HTTP response. The service's answer says it is not ready. If DNS resolution fails instead, there is no HTTP status to report.

That distinction determines our first API:

```go
func Check(ctx context.Context, client *http.Client, target string) (int, error)
```

A received response produces its status and nil. A failed request produces zero and an error. Do not return 500 for a DNS failure; that invents a server response.

### Build one request, then send it

```go
request, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
if err != nil {
    return 0, err
}
response, err := client.Do(request)
if err != nil {
    return 0, err
}
defer response.Body.Close()
return response.StatusCode, nil
```

A context carries cancellation and deadlines across calls. It is not a replacement for an HTTP client. The request attaches the context so the transport can stop work when cancellation arrives.

`defer` schedules a call when the surrounding function returns. Place the body close after the successful request, when a response exists. Closing matters even when you only need the status. For reliable connection reuse, callers may also need to consume the response body; blindly reading an unlimited body just to reuse a connection is another resource problem. This exercise closes without making a reuse guarantee.

Pass the client in. A caller can choose transport settings and timeouts once, and tests can supply a controlled transport. Constructing a new client inside every check hides those choices.

### Make failure local and reproducible

A test should not depend on a public website being reachable:

```go
server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
    w.WriteHeader(http.StatusServiceUnavailable)
}))
defer server.Close()

status, err := Check(context.Background(), server.Client(), server.URL)
if err != nil || status != 503 {
    t.Fatalf("got status=%d error=%v", status, err)
}
```

This test fragment belongs inside a test function and uses `net/http`, `net/http/httptest`, `context`, and `testing`. `httptest` binds a local test server to an available port. The handler function is the service's behavior. You control it, so the expected response is known.

**Exercise: Check one endpoint.** The supplied checks cover a 503 response, body closure, cancellation, an invalid target, and a transport error. Add a 204 case yourself. Read the test transport as a small substitute for the network, not as a general mocking framework.

### Check a cancellation without waiting for a real outage

```go
ctx, cancel := context.WithCancel(context.Background())
cancel()
_, err := Check(ctx, server.Client(), server.URL)
```

Check with `errors.Is(err, context.Canceled)`. HTTP errors often wrap another error; exact string comparisons lose that structure. A timeout and cancellation are related but different: a timeout sets an upper bound, while a parent can cancel because the work is no longer wanted.

A practical client might set `Timeout: 2 * time.Second`. A request's earlier context deadline can still stop it first. Default clients do not give every request a finite overall deadline for you.

References: [http.Client](https://pkg.go.dev/net/http#Client), [httptest](https://pkg.go.dev/net/http/httptest), and [context](https://pkg.go.dev/context).
