Most infra tools talk to APIs: cloud providers, K8s API server, GitHub, monitoring systems. This module teaches you to build proper API clients, not just copy-paste curl into Go.

---

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

## JSON Round-Tripping

### Decoding Response Bodies

```go
// Option 1: json.NewDecoder (streaming, preferred for HTTP)
var pods []Pod
if err := json.NewDecoder(resp.Body).Decode(&pods); err != nil {
    return fmt.Errorf("decoding response: %w", err)
}

// Option 2: read all, then unmarshal (when you need the raw bytes too)
body, err := io.ReadAll(resp.Body)
if err != nil {
    return fmt.Errorf("reading body: %w", err)
}
var pods []Pod
if err := json.Unmarshal(body, &pods); err != nil {
    return fmt.Errorf("parsing JSON: %w", err)
}
```

### Building Request Bodies

```go
// POST with JSON body
payload := map[string]any{
    "name":      "web-1",
    "namespace": "production",
    "replicas":  3,
}
body, err := json.Marshal(payload)
if err != nil {
    return fmt.Errorf("encoding body: %w", err)
}

req, err := http.NewRequest("POST", url, bytes.NewReader(body))
req.Header.Set("Content-Type", "application/json")
```

## Building an API Client

Real API clients are structs with methods per endpoint:

```go
type CloudClient struct {
    baseURL    string
    apiKey     string
    httpClient *http.Client
}

func NewCloudClient(baseURL, apiKey string) *CloudClient {
    return &CloudClient{
        baseURL: strings.TrimRight(baseURL, "/"),
        apiKey:  apiKey,
        httpClient: &http.Client{
            Timeout: 30 * time.Second,
        },
    }
}

// Helper: make a request with auth
func (c *CloudClient) do(ctx context.Context, method, path string, body io.Reader) (*http.Response, error) {
    url := c.baseURL + path
    req, err := http.NewRequestWithContext(ctx, method, url, body)
    if err != nil {
        return nil, fmt.Errorf("creating request: %w", err)
    }
    req.Header.Set("Authorization", "Bearer "+c.apiKey)
    req.Header.Set("Accept", "application/json")
    if body != nil {
        req.Header.Set("Content-Type", "application/json")
    }
    return c.httpClient.Do(req)
}
```

### Methods Per Endpoint

```go
func (c *CloudClient) ListInstances(ctx context.Context) ([]Instance, error) {
    resp, err := c.do(ctx, "GET", "/v1/instances", nil)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()

    if resp.StatusCode != http.StatusOK {
        return nil, fmt.Errorf("unexpected status: %d", resp.StatusCode)
    }

    var result struct {
        Instances []Instance `json:"instances"`
    }
    if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
        return nil, fmt.Errorf("decoding instances: %w", err)
    }
    return result.Instances, nil
}
```

### Handling Pagination

```go
func (c *CloudClient) ListAllInstances(ctx context.Context) ([]Instance, error) {
    var all []Instance
    cursor := ""

    for {
        path := "/v1/instances"
        if cursor != "" {
            path += "?cursor=" + cursor
        }

        resp, err := c.do(ctx, "GET", path, nil)
        if err != nil {
            return nil, err
        }

        var page struct {
            Instances  []Instance `json:"instances"`
            NextCursor string     `json:"next_cursor"`
        }
        json.NewDecoder(resp.Body).Decode(&page)
        resp.Body.Close()

        all = append(all, page.Instances...)

        if page.NextCursor == "" {
            break
        }
        cursor = page.NextCursor
    }
    return all, nil
}
```

## Authentication Patterns

### Loading Credentials

```go
// From environment (preferred in containers)
apiKey := os.Getenv("CLOUD_API_KEY")
if apiKey == "" {
    return fmt.Errorf("CLOUD_API_KEY environment variable is required")
}

// From config file
type Config struct {
    APIKey  string `yaml:"api_key"`
    BaseURL string `yaml:"base_url"`
}
```

**Never hardcode secrets.** You know this from ops. In Go code, enforce it: read from env or file, fail loudly if missing.

### Token Types

```go
// Bearer token (most common)
req.Header.Set("Authorization", "Bearer "+token)

// API key in header
req.Header.Set("X-API-Key", apiKey)

// Basic auth
req.SetBasicAuth(username, password)
```

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
