## Commands & References

Day-to-day commands, the compile errors you'll hit most, and a side-by-side with Python for the reflexes that don't transfer.

### Common Commands

| Command | What it does |
|---------|-------------|
| `go run main.go` | Compile and run in one step |
| `go run .` | Run the package in the current directory |
| `go build -o myapp .` | Compile to binary |
| `go test ./...` | Run all tests recursively |
| `go test -v ./...` | Verbose test output (see each test name) |
| `go test -run TestName` | Run a specific test |
| `go test -count=1 ./...` | Skip test cache |
| `go fmt ./...` | Format all Go files |
| `go vet ./...` | Catch common mistakes (unused vars, printf mismatches) |
| `go mod tidy` | Sync go.mod with actual imports |
| `go doc fmt.Sprintf` | Show docs for a function |
| `go doc -all net/http` | Full package docs |

#### Build Flags You'll Use

```bash
# Cross-compile for Linux (useful on Mac)
GOOS=linux GOARCH=amd64 go build -o myapp .

# Build with version info embedded
go build -ldflags "-X main.version=1.2.3" -o myapp .

# Race detector — catches data races in tests
go test -race ./...
```

### Essential Links

| Resource | URL | When to use |
|----------|-----|-------------|
| Go Playground | [go.dev/play](https://go.dev/play/) | Quick experiments, sharing snippets |
| Package Docs | [pkg.go.dev](https://pkg.go.dev/) | Look up any package's API |
| Effective Go | [go.dev/doc/effective_go](https://go.dev/doc/effective_go) | Go idioms and style |
| Go by Example | [gobyexample.com](https://gobyexample.com/) | Concise examples of every feature |
| Go Wiki | [go.dev/wiki](https://go.dev/wiki/) | Community knowledge base |
| Go Blog | [go.dev/blog](https://go.dev/blog/) | Official announcements and deep dives |
| Go Spec | [go.dev/ref/spec](https://go.dev/ref/spec) | When you need the exact language rules |

### Common Errors & Fixes

#### "imported and not used"

Go won't compile with unused imports. Fix: remove the import, or use `_` to suppress:

```go
import _ "net/http/pprof"  // side-effect import (registers handlers)
```

Better fix: use `goimports` — it adds/removes imports automatically on save.

#### "declared and not used"

Same deal — unused variables are compile errors in Go. Either use the variable or delete it. During debugging, `_ = myVar` suppresses the error temporarily.

#### "cannot use X as type Y"

Type mismatch. Go has no implicit conversions. Common cases:

```go
var x int = 42
var y int64 = int64(x)   // explicit conversion required

var s []byte = []byte("hello")  // string → []byte
var t string = string(s)         // []byte → string
```

#### "invalid memory address or nil pointer dereference"

You called a method or accessed a field on a `nil` pointer. Debug steps:

1. Find which variable is nil (the stack trace tells you the line)
2. Trace back to where it was supposed to be initialized
3. Add a nil check or fix the initialization

```go
// Common cause: uninitialized map
var m map[string]int
m["key"] = 1  // PANIC — m is nil

// Fix: initialize with make
m := make(map[string]int)
m["key"] = 1  // fine
```

#### "multiple-value in single-value context"

You're ignoring an error return:

```go
// Wrong
file := os.Open("config.yaml")

// Right
file, err := os.Open("config.yaml")
if err != nil {
    log.Fatal(err)
}
```

#### "short variable declaration := not allowed at package level"

`:=` only works inside functions. At package level, use `var`:

```go
// Package level
var version = "1.0.0"

func main() {
    // Inside functions, := works
    name := "myapp"
}
```

### Go vs Python Quick Reference

Things you'll reach for instinctively and need the Go equivalent.

#### Check membership

*Python*

```python
if x in my_list:
    print("found")
```

*Go — no `in` keyword. Loop or use a map.*

```go
// Option 1: loop
for _, v := range mySlice {
    if v == x {
        fmt.Println("found")
        break
    }
}

// Option 2: use a set
seen := map[string]bool{"a": true, "b": true}
if seen["a"] { fmt.Println("found") }
```

#### Append, last element, negative indexing

*Python*

```python
nums.append(99)
last = nums[-1]
```

*Go — must reassign append, no negative indexing.*

```go
nums = append(nums, 99)    // must reassign!
last := nums[len(nums)-1]  // no negative indexing
```

#### String operations

*Python*

```python
", ".join(items)
s.split(",")
s.strip()
f"hello {name}"
```

*Go*

```go
strings.Join(items, ", ")
strings.Split(s, ",")
strings.TrimSpace(s)
fmt.Sprintf("hello %s", name)
```

#### Error handling

*Python*

```python
try:
    f = open("config.yaml")
except FileNotFoundError:
    print("missing")
```

*Go — errors are values, not exceptions.*

```go
f, err := os.Open("config.yaml")
if err != nil {
    fmt.Println("missing")
}
```

#### Dict access

*Python*

```python
val = ages.get("dave", 0)
```

*Go — comma-ok pattern.*

```go
val, ok := ages["dave"]
if !ok {
    val = 0 // handle missing key yourself
}
```

#### Loops and sorting

*Python*

```python
for i, v in enumerate(items):
    print(i, v)

sorted(items, key=lambda x: x.age)
```

*Go*

```go
for i, v := range items {
    fmt.Println(i, v)
}

sort.Slice(items, func(i, j int) bool {
    return items[i].Age < items[j].Age
})
```

#### Things that don't exist in Go

- **List comprehensions** — use a loop with append and if
- **None** — `nil` (works for pointers, interfaces, maps, slices, channels)
- **@dataclass** — `type X struct { ... }` and write your own constructor
- **isinstance** — `v, ok := x.(T)` (type assertion)
