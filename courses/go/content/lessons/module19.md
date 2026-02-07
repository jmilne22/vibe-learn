## Unit vs Integration Tests

Quick distinction:

- **Unit tests** — test one function/component in isolation, mocked dependencies, fast
- **Integration tests** — test multiple components together, real dependencies, slower

Both are valuable. Unit tests catch logic bugs fast. Integration tests catch wiring bugs.

## Testing HTTP Handlers

Go's `net/http/httptest` package lets you test handlers without starting a real server.

*server.go*

```go
package main

import (
    "encoding/json"
    "net/http"
)

type Response struct {
    Message string `json:"message"`
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(Response{Message: "ok"})
}

func echoHandler(w http.ResponseWriter, r *http.Request) {
    name := r.URL.Query().Get("name")
    if name == "" {
        http.Error(w, "name required", http.StatusBadRequest)
        return
    }
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(Response{Message: "hello " + name})
}
```

*server_test.go*

```go
package main

import (
    "encoding/json"
    "net/http"
    "net/http/httptest"
    "testing"
)

func TestHealthHandler(t *testing.T) {
    // Create a request
    req := httptest.NewRequest("GET", "/health", nil)
    
    // Create a ResponseRecorder to capture the response
    rr := httptest.NewRecorder()
    
    // Call the handler directly
    healthHandler(rr, req)
    
    // Check status code
    if rr.Code != http.StatusOK {
        t.Errorf("got status %d, want %d", rr.Code, http.StatusOK)
    }
    
    // Check response body
    var resp Response
    if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
        t.Fatalf("failed to decode response: %v", err)
    }
    
    if resp.Message != "ok" {
        t.Errorf("got message %q, want %q", resp.Message, "ok")
    }
}

func TestEchoHandler(t *testing.T) {
    tests := []struct {
        name       string
        query      string
        wantStatus int
        wantMsg    string
    }{
        {"valid", "?name=World", http.StatusOK, "hello World"},
        {"missing name", "", http.StatusBadRequest, ""},
    }
    
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            req := httptest.NewRequest("GET", "/echo"+tt.query, nil)
            rr := httptest.NewRecorder()
            
            echoHandler(rr, req)
            
            if rr.Code != tt.wantStatus {
                t.Errorf("status = %d, want %d", rr.Code, tt.wantStatus)
            }
            
            if tt.wantStatus == http.StatusOK {
                var resp Response
                json.NewDecoder(rr.Body).Decode(&resp)
                if resp.Message != tt.wantMsg {
                    t.Errorf("message = %q, want %q", resp.Message, tt.wantMsg)
                }
            }
        })
    }
}
```

## Testing Full HTTP Server

Use `httptest.NewServer` to spin up a real test server.

*Full server test*

```go
func TestFullServer(t *testing.T) {
    // Create router/mux with all handlers
    mux := http.NewServeMux()
    mux.HandleFunc("/health", healthHandler)
    mux.HandleFunc("/echo", echoHandler)
    
    // Start test server
    server := httptest.NewServer(mux)
    defer server.Close()
    
    // Make real HTTP request
    resp, err := http.Get(server.URL + "/health")
    if err != nil {
        t.Fatalf("request failed: %v", err)
    }
    defer resp.Body.Close()
    
    if resp.StatusCode != http.StatusOK {
        t.Errorf("got status %d", resp.StatusCode)
    }
}

// Test with custom client (for timeouts, etc)
func TestWithClient(t *testing.T) {
    server := httptest.NewServer(http.HandlerFunc(healthHandler))
    defer server.Close()
    
    client := &http.Client{
        Timeout: 5 * time.Second,
    }
    
    resp, err := client.Get(server.URL)
    // ...
}
```

## Testing with Temporary Files

Use `t.TempDir()` for tests that need file system access.

*Temp directory testing*

```go
func TestConfigLoader(t *testing.T) {
    // t.TempDir() creates a temp dir, auto-cleaned after test
    dir := t.TempDir()
    
    // Create test config file
    configPath := filepath.Join(dir, "config.yaml")
    content := []byte(`
name: test
port: 8080
`)
    if err := os.WriteFile(configPath, content, 0644); err != nil {
        t.Fatalf("failed to write config: %v", err)
    }
    
    // Test your loader
    cfg, err := LoadConfig(configPath)
    if err != nil {
        t.Fatalf("LoadConfig failed: %v", err)
    }
    
    if cfg.Name != "test" {
        t.Errorf("name = %q, want %q", cfg.Name, "test")
    }
}

func TestFileWriter(t *testing.T) {
    dir := t.TempDir()
    outPath := filepath.Join(dir, "output.txt")
    
    // Test your writer
    err := WriteReport(outPath, data)
    if err != nil {
        t.Fatalf("WriteReport failed: %v", err)
    }
    
    // Verify file was written correctly
    got, err := os.ReadFile(outPath)
    if err != nil {
        t.Fatalf("failed to read output: %v", err)
    }
    
    if !bytes.Contains(got, []byte("expected content")) {
        t.Errorf("output missing expected content")
    }
}
```

## Build Tags for Integration Tests

Separate slow integration tests from fast unit tests using build tags.

*db_integration_test.go*

```go
//go:build integration

package db

import "testing"

// This test only runs when you specify the tag
func TestRealDatabaseConnection(t *testing.T) {
    db, err := Connect(os.Getenv("DATABASE_URL"))
    if err != nil {
        t.Fatalf("failed to connect: %v", err)
    }
    defer db.Close()
    
    // Test real queries...
}
```

*Running with tags*

```bash
# Run only unit tests (default)
$ go test ./...

# Run integration tests too
$ go test -tags=integration ./...

# Run ONLY integration tests
$ go test -tags=integration -run Integration ./...
```

> **CI Strategy:** Run unit tests on every commit. Run integration tests on PR merge or nightly. Keep your feedback loop fast.

## Testing with Environment Variables

*Env var testing*

```go
func TestConfigFromEnv(t *testing.T) {
    // Set env for this test
    t.Setenv("APP_PORT", "9000")
    t.Setenv("APP_DEBUG", "true")
    
    // t.Setenv automatically restores original value after test
    
    cfg := LoadConfigFromEnv()
    
    if cfg.Port != 9000 {
        t.Errorf("port = %d, want 9000", cfg.Port)
    }
    if !cfg.Debug {
        t.Error("debug should be true")
    }
}

// Skip if required env var not set
func TestExternalAPI(t *testing.T) {
    apiKey := os.Getenv("API_KEY")
    if apiKey == "" {
        t.Skip("API_KEY not set, skipping integration test")
    }
    
    // Test with real API...
}
```

## TestMain for Setup/Teardown

Need to run setup before any tests in a package? Use `TestMain`.

*db_test.go*

```go
package db

import (
    "os"
    "testing"
)

var testDB *DB

func TestMain(m *testing.M) {
    // Setup: runs before any tests
    var err error
    testDB, err = SetupTestDatabase()
    if err != nil {
        fmt.Printf("failed to setup test db: %v\n", err)
        os.Exit(1)
    }
    
    // Run all tests
    code := m.Run()
    
    // Teardown: runs after all tests
    testDB.Close()
    CleanupTestDatabase()
    
    os.Exit(code)
}

func TestCreateUser(t *testing.T) {
    // testDB is available here
    err := testDB.CreateUser(&User{Name: "Alice"})
    if err != nil {
        t.Fatalf("CreateUser failed: %v", err)
    }
}

func TestGetUser(t *testing.T) {
    // testDB is available here too
    user, err := testDB.GetUser("alice")
    // ...
}
```

> **TestMain Gotcha:** If you define `TestMain`, you MUST call `m.Run()` or no tests will execute. Don't forget `os.Exit(code)` at the end.

## Testing External Services

For external APIs, either mock them or use a test/sandbox environment.

*Mock external API*

```go
func TestPaymentProcessor(t *testing.T) {
    // Create mock server that mimics the external API
    mockAPI := httptest.NewServer(http.HandlerFunc(
        func(w http.ResponseWriter, r *http.Request) {
            // Verify request
            if r.URL.Path != "/v1/charge" {
                t.Errorf("unexpected path: %s", r.URL.Path)
            }
            
            // Return mock response
            w.Header().Set("Content-Type", "application/json")
            fmt.Fprint(w, `{"id": "ch_123", "status": "success"}`)
        },
    ))
    defer mockAPI.Close()
    
    // Point your client at the mock
    client := NewPaymentClient(mockAPI.URL)
    
    result, err := client.Charge(1000)
    if err != nil {
        t.Fatalf("Charge failed: %v", err)
    }
    
    if result.Status != "success" {
        t.Errorf("status = %q, want success", result.Status)
    }
}
```

## Parallel Tests

Speed up tests by running them in parallel (when safe to do so).

*Parallel execution*

```go
func TestA(t *testing.T) {
    t.Parallel()  // Mark as safe to run in parallel
    // ... test code ...
}

func TestB(t *testing.T) {
    t.Parallel()
    // ... test code ...
}

// Table-driven with parallel subtests
func TestParallelSubtests(t *testing.T) {
    tests := []struct{ name string; input int }{
        {"case1", 1},
        {"case2", 2},
        {"case3", 3},
    }
    
    for _, tt := range tests {
        tt := tt  // IMPORTANT: capture range variable
        t.Run(tt.name, func(t *testing.T) {
            t.Parallel()
            // ... test using tt.input ...
        })
    }
}
```

> **When NOT to parallelize:** Don't use `t.Parallel()` if tests share state, write to same files, or use shared database rows. Race conditions will ruin your day.

## Golden Files

For complex output, compare against "golden" reference files.

*Golden file testing*

```go
func TestRenderTemplate(t *testing.T) {
    output := RenderTemplate(data)
    
    goldenPath := "testdata/expected_output.golden"
    
    // Update golden file if -update flag is set
    if *update {
        os.WriteFile(goldenPath, []byte(output), 0644)
        return
    }
    
    // Compare against golden file
    expected, err := os.ReadFile(goldenPath)
    if err != nil {
        t.Fatalf("failed to read golden file: %v", err)
    }
    
    if output != string(expected) {
        t.Errorf("output doesn't match golden file\ngot:\n%s\nwant:\n%s", 
            output, expected)
    }
}

// Define flag at package level
var update = flag.Bool("update", false, "update golden files")
```

*Usage*

```bash
# Run tests normally
$ go test

# Update golden files when output changes intentionally
$ go test -update
```

## Exercises

Progress through each section in order, or jump to where you need practice.

Practice individual concepts you just learned.

<div id="warmups-container">
            <noscript><p class="js-required">JavaScript is required for the interactive exercises.</p></noscript>
            </div>

### 💪 Challenges

Combine concepts and learn patterns. Each challenge has multiple variants at different difficulties.

<div id="challenges-container">
            <noscript><p class="js-required">JavaScript is required for the interactive exercises.</p></noscript>
            </div>

## Module 17 Summary

- **httptest.NewRecorder** — test handlers without network
- **httptest.NewServer** — spin up real test server
- **t.TempDir()** — auto-cleaned temp directories
- **t.Setenv()** — set env vars that auto-restore
- **//go:build integration** — separate slow tests
- **TestMain** — package-level setup/teardown
- **t.Parallel()** — run tests concurrently
- **Golden files** — compare against reference output
