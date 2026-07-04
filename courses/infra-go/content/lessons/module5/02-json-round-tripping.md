## JSON Round-Tripping

<attempt type="pretest">

<predict prompt="What does this print?">
```go
payload := map[string]any{
    "replicas":  3,
    "namespace": "production",
    "name":      "web-1",
}
body, _ := json.Marshal(payload)
fmt.Println(string(body))
```
```
{"name":"web-1","namespace":"production","replicas":3}
```
</predict>

Commit to the exact bytes — including the key order — before reading on.

</attempt>

That pretest hides a guarantee worth knowing: `json.Marshal` always emits map keys in sorted order, no matter how the literal was written. Insertion order is gone; alphabetical order is what hits the wire. That's what makes JSON output diffable in tests.

### Decoding Response Bodies

<attempt type="worked">

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

</attempt>

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

<attempt type="gaps">

<gaps prompt="The outbound half again, from memory — data to wire bytes, wrapped for the request, plus the header APIs check.">
```go
payload := map[string]any{"name": "web-1", "replicas": 3}

body, err := json.«Marshal(payload)»
if err != nil {
    return fmt.Errorf("encoding body: %w", err)
}

req, err := http.NewRequest("POST", url, «bytes.NewReader(body)»)
if err != nil {
    return fmt.Errorf("creating request: %w", err)
}
req.Header.Set(«"Content-Type"», "application/json")
```
</gaps>

</attempt>

<attempt type="scratch">

<div class="inline-exercises" data-concept="JSON Round-Tripping"></div>

</attempt>
