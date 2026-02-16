## Request Handling

### Reading Request Data

```go
func getPod(w http.ResponseWriter, r *http.Request) {
    // Path parameter (Go 1.22+)
    name := r.PathValue("name")

    // Query parameters
    namespace := r.URL.Query().Get("namespace")
    if namespace == "" {
        namespace = "default"
    }

    // Headers
    token := r.Header.Get("Authorization")

    // Method
    if r.Method != http.MethodGet {
        http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
        return
    }
}
```

### Parsing JSON Request Bodies

```go
func createPod(w http.ResponseWriter, r *http.Request) {
    var req struct {
        Name      string `json:"name"`
        Namespace string `json:"namespace"`
        Image     string `json:"image"`
    }

    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
        return
    }

    // validate...
    if req.Name == "" {
        http.Error(w, "name is required", http.StatusBadRequest)
        return
    }
}
```

### Writing JSON Responses

```go
func writeJSON(w http.ResponseWriter, status int, data any) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(status)
    json.NewEncoder(w).Encode(data)
}

// Usage
func listPods(w http.ResponseWriter, r *http.Request) {
    pods := []Pod{{Name: "web-1"}, {Name: "web-2"}}
    writeJSON(w, http.StatusOK, map[string]any{
        "pods":  pods,
        "count": len(pods),
    })
}
```

> **Gotcha:** Call `w.WriteHeader()` *after* setting headers, but *before* writing the body. Once you write the body, headers are already sent.
