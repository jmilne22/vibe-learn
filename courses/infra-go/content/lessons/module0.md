Your cheat sheet. Come back here whenever you need a quick lookup.

---

## How to Use This Course

The course is five tracks. Each track builds on the last, but not every module within a track is required to move forward.

**Track 1 (Modules 1-3)** is drill-heavy on purpose. Slices, maps, structs, errors, testing — you do these until they're automatic. Don't rush through. If the warmups feel hard, re-read the lesson. If the warmups are easy but challenges are hard, that's working as intended — use the hints.

**Track 2-3 (Modules 4-7)** shift to building real things: CLIs, API clients, concurrency. Projects start appearing. Do the projects — they're portfolio pieces, not homework.

**Track 4 (Modules 8-11)** is the steepest ramp. HTTP servers → raw networking → container internals → K8s operators. If a module feels too hard, here's what's safe to skip or reorder:
- **Module 10 (Containers)** is the most independent. You can skip it and do Module 11 (K8s) without it — they use different APIs entirely. Come back to containers later.
- **Module 9 (Networking)** is needed for Project 3 (DNS server) but not for Modules 10-11.

**Track 5 (Modules 12-13)** is interview prep and open source. The algorithms plugin gives you practice throughout the course, so Module 12 is reinforcement, not a cold start.

### Working through a module

Each module has a **lesson**, **warmups**, and **challenges**. Here's the flow:

1. **Read the lesson first.** Skim the whole thing, then come back to sections you need.
2. **Do the warmups.** These are quick drills — one concept each, multiple variants. Use the concept filter to focus on areas you're shaky on, or just go through them all. If a warmup feels hard, the gap is in the lesson — go re-read that section.
3. **Move to challenges.** These are deeper, multi-step problems. Pick a difficulty mode:
   - **Easy** — only difficulty 1 variants. Start here if the module is new territory.
   - **Progressive** — starts easy, ramps up as you go. Good default for a first pass.
   - **Balanced** — weighted mix (35% easy, 40% medium, 25% hard). Best for review.
   - **Hard** — difficulty 3+ only. Use this when you're confident and want to test yourself.
   - **Mixed** — fully random. Good for simulating real-world unpredictability.
4. **Self-rate honestly.** After viewing a solution, rate yourself: *Got it*, *Struggled*, or *Needed solution*. These ratings drive spaced repetition — honest ratings mean better review scheduling.

Every exercise has multiple variants, so you can shuffle and get a fresh version of the same concept. Use the shuffle button liberally. If a challenge is too hard, hit "Get Easier Version" to step down a difficulty level (and "Get Harder Version" when you're ready to push).

### The thinking timer

When you open an exercise, you'll see a thinking timer option. It locks the hints and solution for 45 seconds, forcing you to actually think before reaching for help. Use it. The point of exercises is the struggle, not the answer.

### Daily practice and review

Your self-ratings feed into a spaced repetition system. Exercises you struggled with come back sooner; ones you nailed fade into longer intervals. Use **Daily Practice** to stay sharp across modules — it pulls exercises that are due for review or that you've historically found hard.

### When you're stuck

- **Warmups are the canary.** If warmups are hard, the gap is in the lesson, not the exercise. Re-read.
- **Difficulty 3 challenges are optional.** They exist for depth, not as gates. Skip and come back.
- **Projects aren't blockers.** If a project feels too ambitious, keep going with the next module. The project will still be there.

---

## Go Toolchain

Install from [go.dev/dl](https://go.dev/dl/) or your package manager. Verify:

```bash
go version    # go1.22+ recommended
which go      # should be in $PATH
```

On Void Linux:

```bash
sudo xbps-install -S go
```

### Module System

```bash
go mod init github.com/you/project   # create go.mod (do this first in every project)
go mod tidy                           # add missing deps, remove unused ones
go get github.com/spf13/cobra@latest  # add a dependency
```

`go.mod` tracks dependencies. `go.sum` locks checksums. Both get committed to git.

## Project Layout

```
myproject/
├── go.mod              # module definition + dependencies
├── go.sum              # dependency checksums (auto-generated)
├── main.go             # entry point (small projects)
├── cmd/                # entry points (multi-binary projects)
│   └── myapp/
│       └── main.go
├── internal/           # private packages — can't be imported by other modules
│   ├── config/
│   └── server/
├── pkg/                # public packages — can be imported (optional, some projects skip this)
└── Makefile            # build/test/lint shortcuts
```

**Rules of thumb:**
- Start flat (everything in `main.go`) until it gets painful
- Move code to `internal/` when you have multiple packages that shouldn't be imported externally
- Only use `pkg/` when you intentionally want other projects to import your library code
- One `main.go` per binary, under `cmd/` if you have multiple

## Editor Setup

### Helix

Helix has built-in LSP support. Just install `gopls`:

```bash
go install golang.org/x/tools/gopls@latest
```

Helix auto-detects `gopls` for `.go` files. Verify in `~/.config/helix/languages.toml`:

```toml
[[language]]
name = "go"
auto-format = true
formatter = { command = "goimports", args = ["-local", "github.com/you"] }
```

Install `goimports` for auto-organizing imports:

```bash
go install golang.org/x/tools/cmd/goimports@latest
```

### Neovim

If using `nvim-lspconfig`:

```lua
require('lspconfig').gopls.setup{}
```

For format-on-save, add to your config:

```lua
vim.api.nvim_create_autocmd("BufWritePre", {
    pattern = "*.go",
    callback = function()
        vim.lsp.buf.format({ async = false })
    end,
})
```

### VS Code

Install the official **Go** extension by the Go team. It handles `gopls`, formatting, testing, and debugging out of the box.

## Common Commands

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

### Build Flags You'll Use

```bash
# Cross-compile for Linux (useful on Mac)
GOOS=linux GOARCH=amd64 go build -o myapp .

# Build with version info embedded
go build -ldflags "-X main.version=1.2.3" -o myapp .

# Race detector — catches data races in tests
go test -race ./...
```

## Essential Links

| Resource | URL | When to use |
|----------|-----|-------------|
| Go Playground | [go.dev/play](https://go.dev/play/) | Quick experiments, sharing snippets |
| Package Docs | [pkg.go.dev](https://pkg.go.dev/) | Look up any package's API |
| Effective Go | [go.dev/doc/effective_go](https://go.dev/doc/effective_go) | Go idioms and style |
| Go by Example | [gobyexample.com](https://gobyexample.com/) | Concise examples of every feature |
| Go Wiki | [go.dev/wiki](https://go.dev/wiki/) | Community knowledge base |
| Go Blog | [go.dev/blog](https://go.dev/blog/) | Official announcements and deep dives |
| Go Spec | [go.dev/ref/spec](https://go.dev/ref/spec) | When you need the exact language rules |

## Common Errors & Fixes

### "imported and not used"

Go won't compile with unused imports. Fix: remove the import, or use `_` to suppress:

```go
import _ "net/http/pprof"  // side-effect import (registers handlers)
```

Better fix: use `goimports` — it adds/removes imports automatically on save.

### "declared and not used"

Same deal — unused variables are compile errors in Go. Either use the variable or delete it. During debugging, `_ = myVar` suppresses the error temporarily.

### "cannot use X as type Y"

Type mismatch. Go has no implicit conversions. Common cases:

```go
var x int = 42
var y int64 = int64(x)   // explicit conversion required

var s []byte = []byte("hello")  // string → []byte
var t string = string(s)         // []byte → string
```

### "invalid memory address or nil pointer dereference"

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

### "multiple-value in single-value context"

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

### "short variable declaration := not allowed at package level"

`:=` only works inside functions. At package level, use `var`:

```go
// Package level
var version = "1.0.0"

func main() {
    // Inside functions, := works
    name := "myapp"
}
```

## Go vs Python Quick Reference

Things you'll reach for instinctively and need the Go equivalent.

### Check membership

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

### Append, last element, negative indexing

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

### String operations

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

### Error handling

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

### Dict access

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

### Loops and sorting

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

### Things that don't exist in Go

- **List comprehensions** — use a loop with append and if
- **None** — `nil` (works for pointers, interfaces, maps, slices, channels)
- **@dataclass** — `type X struct { ... }` and write your own constructor
- **isinstance** — `v, ok := x.(T)` (type assertion)
