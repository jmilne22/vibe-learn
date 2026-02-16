## Navigating Large Go Codebases

### Standard Project Layout

Most Go projects follow this structure:

```
project/
├── cmd/              ← entry points (one dir per binary)
│   ├── server/
│   │   └── main.go
│   └── cli/
│       └── main.go
├── internal/         ← private packages (can't be imported by others)
│   ├── controller/
│   ├── store/
│   └── config/
├── pkg/              ← public packages (importable by others)
│   ├── client/
│   └── api/
├── api/              ← API definitions (proto, OpenAPI, CRD schemas)
├── hack/             ← scripts for development (codegen, testing)
├── go.mod
├── go.sum
└── Makefile
```

**Start here:** `cmd/` tells you what binaries the project produces. Each `main.go` is an entry point.

### Reading go.mod

```go
module github.com/kubernetes/kubernetes

go 1.22

require (
    k8s.io/api v0.29.0
    k8s.io/apimachinery v0.29.0
    k8s.io/client-go v0.29.0
    // ...
)
```

`go.mod` tells you:
- What Go version the project uses
- What dependencies it imports (and their versions)
- The module path (how to import this project)

### Finding the Entry Point

1. Look in `cmd/` for `main.go`
2. `main()` usually calls a `Run()` or `Execute()` function
3. Follow that to the actual setup (server, CLI, controller)

```bash
# Quick way to find entry points
grep -r "func main()" cmd/
```

### Using go doc

```bash
# See package docs
go doc k8s.io/client-go/kubernetes

# See a specific type
go doc k8s.io/client-go/kubernetes.Clientset

# See all methods on a type
go doc -all k8s.io/client-go/kubernetes.Clientset
```

Or browse on pkg.go.dev — every public Go module is documented there automatically.
