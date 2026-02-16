## Error Handling for HTTP

### Status Code Checking

```go
// err != nil only means "couldn't connect."
// A 500 response is NOT an error — it's a successful HTTP response with a bad status.
resp, err := client.Do(req)
if err != nil {
    return fmt.Errorf("request failed: %w", err)  // network error
}
defer resp.Body.Close()

if resp.StatusCode != http.StatusOK {
    body, _ := io.ReadAll(resp.Body)
    return fmt.Errorf("API error (status %d): %s", resp.StatusCode, string(body))
}
```

This is the #1 mistake Go beginners make with HTTP. `err != nil` only catches network failures. A 404 or 500 comes back as `err == nil` with a non-200 status code.

### Decoding Error Bodies

```go
type APIError struct {
    StatusCode int
    Message    string `json:"message"`
    Code       string `json:"code"`
}

func (e *APIError) Error() string {
    return fmt.Sprintf("API error %d (%s): %s", e.StatusCode, e.Code, e.Message)
}

func checkResponse(resp *http.Response) error {
    if resp.StatusCode >= 200 && resp.StatusCode < 300 {
        return nil
    }
    var apiErr APIError
    apiErr.StatusCode = resp.StatusCode
    json.NewDecoder(resp.Body).Decode(&apiErr) // best effort
    return &apiErr
}
```

### Retry with Backoff

```go
func withRetry(ctx context.Context, maxRetries int, fn func() (*http.Response, error)) (*http.Response, error) {
    var lastErr error
    for attempt := 0; attempt <= maxRetries; attempt++ {
        resp, err := fn()
        if err == nil && resp.StatusCode < 500 {
            return resp, nil
        }
        if err != nil {
            lastErr = err
        } else {
            resp.Body.Close()
            lastErr = fmt.Errorf("server error: %d", resp.StatusCode)
        }

        backoff := time.Duration(1<<attempt) * 100 * time.Millisecond // 100ms, 200ms, 400ms...
        select {
        case <-ctx.Done():
            return nil, ctx.Err()
        case <-time.After(backoff):
        }
    }
    return nil, fmt.Errorf("max retries exceeded: %w", lastErr)
}
```

Only retry on transient failures (5xx, timeouts). Never retry 4xx — those are your bug.

---
