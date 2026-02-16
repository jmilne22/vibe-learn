## net/http Server Basics

### The Simplest Server

```go
package main

import (
    "fmt"
    "net/http"
)

func main() {
    http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
        fmt.Fprintf(w, "Hello, %s", r.URL.Path[1:])
    })
    http.ListenAndServe(":8080", nil)
}
```

### The Handler Interface

Everything in net/http revolves around one interface:

```go
type Handler interface {
    ServeHTTP(ResponseWriter, *Request)
}
```

Any type with `ServeHTTP` is a handler. `http.HandlerFunc` adapts a regular function:

```go
// These are equivalent:
http.Handle("/healthz", http.HandlerFunc(healthCheck))
http.HandleFunc("/healthz", healthCheck)
```

### Routing with ServeMux (Go 1.22+)

Go 1.22 added method and path parameter support to the standard mux:

```go
mux := http.NewServeMux()

mux.HandleFunc("GET /api/pods", listPods)
mux.HandleFunc("GET /api/pods/{name}", getPod)
mux.HandleFunc("POST /api/pods", createPod)
mux.HandleFunc("DELETE /api/pods/{name}", deletePod)

http.ListenAndServe(":8080", mux)
```

No third-party router needed for most use cases.

<div class="inline-exercises" data-concept="Handler Basics"></div>
