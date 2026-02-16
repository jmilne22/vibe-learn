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

<div class="inline-exercises" data-concept="JSON Round-Tripping"></div>
