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
