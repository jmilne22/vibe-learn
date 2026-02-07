## HTTP Client Basics

*Making HTTP requests*

```go
package main

import (
    "encoding/json"
    "io"
    "net/http"
)

// Simple GET
resp, err := http.Get("https://api.github.com/users/golang")
if err != nil {
    panic(err)
}
defer resp.Body.Close()

body, _ := io.ReadAll(resp.Body)
fmt.Println(string(body))

// JSON response into struct
type User struct {
    Login     string `json:"login"`
    Name      string `json:"name"`
    Followers int    `json:"followers"`
}

var user User
json.NewDecoder(resp.Body).Decode(&user)

// Custom request with headers
req, _ := http.NewRequest("GET", "https://api.github.com/user", nil)
req.Header.Set("Authorization", "Bearer "+token)
req.Header.Set("Accept", "application/json")

client := &http.Client{Timeout: 10 * time.Second}
resp, err = client.Do(req)
```

## Building an API Client

*GitHub API client*

```go
type GitHubClient struct {
    baseURL    string
    token      string
    httpClient *http.Client
}

func NewGitHubClient(token string) *GitHubClient {
    return &GitHubClient{
        baseURL:    "https://api.github.com",
        token:      token,
        httpClient: &http.Client{Timeout: 30 * time.Second},
    }
}

func (c *GitHubClient) request(method, path string, body any) (*http.Response, error) {
    var bodyReader io.Reader
    if body != nil {
        data, _ := json.Marshal(body)
        bodyReader = bytes.NewReader(data)
    }
    
    req, err := http.NewRequest(method, c.baseURL+path, bodyReader)
    if err != nil {
        return nil, err
    }
    
    req.Header.Set("Authorization", "Bearer "+c.token)
    req.Header.Set("Accept", "application/vnd.github+json")
    if body != nil {
        req.Header.Set("Content-Type", "application/json")
    }
    
    return c.httpClient.Do(req)
}

func (c *GitHubClient) GetUser(username string) (*User, error) {
    resp, err := c.request("GET", "/users/"+username, nil)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()
    
    if resp.StatusCode != http.StatusOK {
        return nil, fmt.Errorf("API error: %s", resp.Status)
    }
    
    var user User
    if err := json.NewDecoder(resp.Body).Decode(&user); err != nil {
        return nil, err
    }
    return &user, nil
}
```

## Building HTTP Servers

*Simple HTTP server*

```go
package main

import (
    "encoding/json"
    "net/http"
)

type Response struct {
    Message string `json:"message"`
}

func main() {
    http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(http.StatusOK)
        w.Write([]byte("OK"))
    })
    
    http.HandleFunc("/api/greet", func(w http.ResponseWriter, r *http.Request) {
        name := r.URL.Query().Get("name")
        if name == "" {
            name = "World"
        }
        
        resp := Response{Message: "Hello, " + name}
        
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(resp)
    })
    
    fmt.Println("Server running on :8080")
    http.ListenAndServe(":8080", nil)
}
```

## Middleware Pattern

*Middleware*

```go
// Middleware wraps a handler
type Middleware func(http.Handler) http.Handler

// Logging middleware
func LoggingMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        start := time.Now()
        next.ServeHTTP(w, r)
        fmt.Printf("%s %s %v\n", r.Method, r.URL.Path, time.Since(start))
    })
}

// Auth middleware
func AuthMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        token := r.Header.Get("Authorization")
        if token == "" {
            http.Error(w, "Unauthorized", http.StatusUnauthorized)
            return
        }
        next.ServeHTTP(w, r)
    })
}

// Chain middleware
func Chain(h http.Handler, middlewares ...Middleware) http.Handler {
    for _, m := range middlewares {
        h = m(h)
    }
    return h
}

// Usage
handler := Chain(myHandler, LoggingMiddleware, AuthMiddleware)
```

### 🔨 Project: GitHub CLI Tool

Put your skills to work! Build a CLI that interacts with the GitHub API.

Start Project →

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

## Module 11 Summary

- **http.Get/Post** — simple requests
- **http.NewRequest** — custom requests with headers
- **json.Decoder** — stream JSON from response
- **http.HandleFunc** — register routes
- **Middleware** — wrap handlers for cross-cutting concerns
