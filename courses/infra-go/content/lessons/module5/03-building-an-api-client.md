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

<div class="inline-exercises" data-concept="API Client"></div>
