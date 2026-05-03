Use this page when you want the map, not a tutorial.

No install checklist, no hello world, no generic onboarding. Module 0 is the control panel for this course: what to do first, when to drill, when to build, and where to look when Go-specific details get noisy.

---

## What This Page Is For

This page is not a setup checklist. It is the operating manual for the path through the course.

Use it to answer four questions:

- What should I focus on first?
- When should I drill versus build?
- Where should my project code live?
- Which Go commands and errors are worth keeping close?

The useful parts are the course rhythm, the early progression, the workspace conventions, and the quick references.

---

## How This Course Works

Treat each module as a practice loop:

1. Read a lesson section.
2. Do the inline practice under that section.
3. Use warmups until the concept feels familiar.
4. Use challenges when you want multi-step pressure.
5. Build the project when the module introduces one.

Warmups are reps. They isolate one concept. Challenges are integration practice. They are less tidy on purpose.

### Self-Rating

After viewing a solution, rate yourself honestly:

| Rating | Use it when |
| --- | --- |
| `Got it` | You could solve a close variant without looking |
| `Struggled` | You got there, but the path was shaky |
| `Needed solution` | You needed the answer or copied the shape |

Daily Practice uses those ratings. Honest ratings make review useful; generous ratings hide the exact reps you need.

### Difficulty

Use this as your default path:

| Situation | Best move |
| --- | --- |
| New concept feels vague | Re-read the lesson section, then do warmups |
| Warmups feel easy | Move to challenges |
| Challenges feel impossible | Step down difficulty or return to warmups |
| You solved it slowly | Rate `Struggled` and keep going |
| Project feels too large | Build the smallest working version first |

Difficulty 3 challenges are depth, not gates. Skip them when they would stall momentum.

---

## The Early Progression

The first three modules are deliberately drill-heavy because they become the muscle memory for every later tool.

| Step | What you practice | What you build |
| --- | --- | --- |
| Module 1 | slices, maps, strings, parsing, sorting | P0.1 Log Summary Reporter |
| Module 2 | structs, pointers, methods, interfaces | P0.2 Resource Modeler |
| Module 3 | errors, wrapping, tests, table-driven cases | P0.3 Tested Config Parser |
| Module 4 | CLI shape and config files | P1 Config Linter |

Projects are where syntax drills become deliverables. They are not extra decoration; they are the proof that the module stuck.

---

## Recommended Workspace

Keep your course projects in normal local folders. Do not build them inside this static course repo unless you are working on the course platform itself.

```txt
~/code/infra-go/
  playground/
  p0-log-summary-reporter/
  p0-resource-modeler/
  p0-tested-config-parser/
  p1-config-linter/
```

For small projects, start flat:

```txt
p0-log-summary-reporter/
  go.mod
  main.go
```

Only add folders when the code asks for them:

```txt
config-linter/
  go.mod
  cmd/
    config-linter/
      main.go
  internal/
    config/
    rules/
    report/
```

Rules of thumb:

- Start with one `main.go` until it gets uncomfortable.
- Use `cmd/` when you have multiple binaries or a larger CLI.
- Use `internal/` for packages that belong only to this program.
- Avoid `pkg/` unless you intentionally want other projects to import your code.

---

## Command Survival Kit

Use these constantly:

| Command | What it does |
| --- | --- |
| `go run .` | Compile and run the current package |
| `go build -o myapp .` | Build a binary |
| `go test ./...` | Run all tests under the module |
| `go test -v ./...` | Show each test name |
| `go test -run TestName` | Run one test or matching group |
| `go test -count=1 ./...` | Ignore cached test results |
| `go fmt ./...` | Format Go files |
| `go vet ./...` | Catch common suspicious code |
| `go mod tidy` | Sync `go.mod` and `go.sum` with imports |
| `go doc fmt.Sprintf` | Show docs for one symbol |
| `go doc -all net/http` | Show full package docs |

Useful project commands:

```bash
# Add a dependency
go get github.com/spf13/cobra@latest

# Cross-compile for Linux from another OS
GOOS=linux GOARCH=amd64 go build -o myapp .

# Run tests with the race detector
go test -race ./...
```

`go.mod` records your direct dependencies. `go.sum` records checksums. Commit both.

---

## Editor Setup

You only need three things from your editor:

1. Format on save.
2. Import cleanup.
3. Jump-to-definition and inline errors.

Install the Go language server and import formatter:

```bash
go install golang.org/x/tools/gopls@latest
go install golang.org/x/tools/cmd/goimports@latest
```

### VS Code

Install the official **Go** extension by the Go team. It handles `gopls`, formatting, tests, and debugging.

### Helix

Helix has built-in LSP support. A minimal Go setup:

```toml
[[language]]
name = "go"
auto-format = true
formatter = { command = "goimports" }
```

### Neovim

With `nvim-lspconfig`:

```lua
require("lspconfig").gopls.setup({})
```

Add format-on-save however your Neovim config normally handles LSP formatting.

---

## When Go Complains

Go compiler errors are blunt, but usually precise. Start with the file and line number, then fix the first error first.

### `imported and not used`

Go will not compile with unused imports. Delete the import or let `goimports` clean it up.

```go
import _ "net/http/pprof" // only for intentional side-effect imports
```

### `declared and not used`

Unused variables are compile errors. Use the variable, delete it, or temporarily assign it to `_` while debugging:

```go
_ = value
```

### `cannot use X as Y`

Go does not do implicit conversions:

```go
var x int = 42
var y int64 = int64(x)

var b []byte = []byte("hello")
var s string = string(b)
```

### `invalid memory address or nil pointer dereference`

Something is `nil`, and you tried to use it. The stack trace points to the line. Check where that value should have been initialized.

```go
var counts map[string]int
counts["api"] = 1 // panic

counts = make(map[string]int)
counts["api"] = 1 // ok
```

### `multiple-value in single-value context`

You ignored one of a function's return values:

```go
// Wrong
file := os.Open("config.yaml")

// Right
file, err := os.Open("config.yaml")
if err != nil {
	return err
}
_ = file
```

### `:= not allowed at package level`

Short declaration only works inside functions:

```go
var version = "1.0.0"

func main() {
	name := "config-linter"
	_ = name
}
```

---

## Python To Go Survival Guide

<details>
<summary>Open this when your hands want to write Python</summary>

### Membership

```python
if x in items:
    print("found")
```

Go has no `in` keyword for slices. Loop, or use a map as a set.

```go
for _, item := range items {
	if item == x {
		fmt.Println("found")
		break
	}
}

seen := map[string]bool{"api": true, "worker": true}
if seen["api"] {
	fmt.Println("found")
}
```

### Append And Last Element

```python
items.append("api")
last = items[-1]
```

Go requires reassignment after `append`, and it has no negative indexing.

```go
items = append(items, "api")
last := items[len(items)-1]
```

### Strings

```python
", ".join(items)
s.split(",")
s.strip()
f"hello {name}"
```

```go
strings.Join(items, ", ")
strings.Split(s, ",")
strings.TrimSpace(s)
fmt.Sprintf("hello %s", name)
```

### Errors

```python
try:
    f = open("config.yaml")
except FileNotFoundError:
    print("missing")
```

Go returns errors as values:

```go
f, err := os.Open("config.yaml")
if err != nil {
	fmt.Println("missing")
	return
}
_ = f
```

### Dictionary Access

```python
value = ages.get("dave", 0)
```

Go uses the comma-ok pattern:

```go
value, ok := ages["dave"]
if !ok {
	value = 0
}
```

### Loops And Sorting

```python
for i, value in enumerate(items):
    print(i, value)

sorted(items, key=lambda x: x.age)
```

```go
for i, value := range items {
	fmt.Println(i, value)
}

sort.Slice(items, func(i, j int) bool {
	return items[i].Age < items[j].Age
})
```

### Missing Pythonisms

- No list comprehensions: use a loop with `append`.
- No `None`: use `nil` for pointers, interfaces, maps, slices, and channels.
- No `@dataclass`: define a `struct` and write the constructor you need.
- No `isinstance`: use a type assertion or type switch.

</details>

---

## Useful Links

| Resource | When to use it |
| --- | --- |
| [Go Playground](https://go.dev/play/) | Quick experiments and shareable snippets |
| [Package Docs](https://pkg.go.dev/) | Look up package APIs |
| [Effective Go](https://go.dev/doc/effective_go) | Go idioms and style |
| [Go by Example](https://gobyexample.com/) | Small examples for language features |
| [Go Blog](https://go.dev/blog/) | Official announcements and deep dives |
| [Go Spec](https://go.dev/ref/spec) | Exact language rules |

Now go to Module 1. Come back here when the toolchain, editor, or compiler gets noisy.
