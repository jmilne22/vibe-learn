- [📦 Standard Library](https://pkg.go.dev/std)
- [📖 Official Docs](https://go.dev/doc/)
- [📝 Go Blog](https://go.dev/blog/)
- [🎮 Go Playground](https://go.dev/play/)

## Go Commands

*Common commands*

```bash
# Run code
go run main.go
go run .                      # Run all files in current dir

# Build binary
go build -o myapp .
go build -o myapp main.go

# Testing
go test ./...                 # All tests in all subdirs
go test -v ./...              # Verbose
go test -run TestName         # Run specific test
go test -cover ./...          # Show coverage

# Dependencies
go mod init github.com/user/project
go mod tidy                   # Clean up go.mod
go get github.com/pkg/name    # Add dependency
go get -u ./...               # Update all deps

# Code quality
go fmt ./...                  # Format all code
go vet ./...                  # Find suspicious code
staticcheck ./...             # Advanced linting

# Documentation
go doc strings                # Package docs
go doc strings.Split          # Function docs
go doc -all strings           # Everything

# Other
go install                    # Install binary to $GOPATH/bin
go clean                      # Remove build artifacts
go version                    # Show Go version
```

## Essential Resources

### Documentation

- [Standard Library](https://pkg.go.dev/std)
- [Language Specification](https://go.dev/ref/spec)
- [Effective Go](https://go.dev/doc/effective_go)
- [Go FAQ](https://go.dev/doc/faq)

### Common Packages

- [fmt](https://pkg.go.dev/fmt) - Formatting I/O
- [os](https://pkg.go.dev/os) - OS interface
- [strings](https://pkg.go.dev/strings) - String operations
- [strconv](https://pkg.go.dev/strconv) - String conversions
- [io](https://pkg.go.dev/io) - I/O primitives
- [net/http](https://pkg.go.dev/net/http) - HTTP client/server

### Tools & Libraries

- [cobra](https://github.com/spf13/cobra) - CLI apps
- [bubbletea](https://github.com/charmbracelet/bubbletea) - TUI framework
- [viper](https://github.com/spf13/viper) - Configuration
- [testify](https://github.com/stretchr/testify) - Testing toolkit

### Learning

- [Tour of Go](https://go.dev/tour/)
- [Go by Example](https://gobyexample.com)
- [Go Blog](https://go.dev/blog/)
- [r/golang](https://www.reddit.com/r/golang/)

## Quick Syntax Reference

*Common patterns*

```go
// Variables
var name string = "value"
name := "value"              // Short declaration (inside functions only)

// If statement
if x > 10 {
    // do something
}

// If with initialization
if err := doSomething(); err != nil {
    return err
}

// For loop (the only loop)
for i := 0; i < 10; i++ { }
for key, val := range myMap { }
for index, item := range mySlice { }
for { // infinite loop }

// Functions
func add(a, b int) int {
    return a + b
}

// Multiple returns
func divide(a, b float64) (float64, error) {
    if b == 0 {
        return 0, errors.New("division by zero")
    }
    return a / b, nil
}

// Error handling
result, err := doSomething()
if err != nil {
    return err
}

// Slices
nums := []int{1, 2, 3}
nums = append(nums, 4)

// Maps
ages := map[string]int{
    "alice": 30,
    "bob":   25,
}

// Check if key exists
age, ok := ages["charlie"]
if ok {
    fmt.Println(age)
}

// Structs
type Person struct {
    Name string
    Age  int
}

p := Person{Name: "Alice", Age: 30}

// Pointers
x := 5
ptr := &x              // Get address
val := *ptr            // Dereference
```

## Editor Setup

Most editors support Go through **gopls** (Go language server). Install it:

*Install gopls*

```bash
go install golang.org/x/tools/gopls@latest
```

### Helix

Already works out of the box with gopls. Add to `~/.config/helix/languages.toml` for customization:

*languages.toml*

```toml
[[language]]
name = "go"
auto-format = true
formatter = { command = "goimports" }

[language-server.gopls]
command = "gopls"
config = { "gofumpt" = true }
```

### Useful Tools

*Install formatting/linting tools*

```bash
# Better imports (includes gofmt)
go install golang.org/x/tools/cmd/goimports@latest

# Advanced linter
go install honnef.co/go/tools/cmd/staticcheck@latest

# Stricter formatting (optional)
go install mvdan.cc/gofumpt@latest
```

> **Format on save:** <p>Enable auto-formatting in your editor. Running `gofmt` or `goimports` on save prevents most style-related issues.</p>
