## Same Package, Multiple Files

This is the first thing that confuses people from Python. In Go, all files in the same directory with the same `package` declaration are ONE unit. They share everything automatically.

*main.go*

```go
package main

func main() {
    cfg := LoadConfig()  // Defined in config.go
    Process(cfg)         // Defined in process.go
}
```

*config.go*

```go
package main

type Config struct {
    Name string
}

func LoadConfig() *Config {
    return &Config{Name: "test"}
}
```

*process.go*

```go
package main

func Process(cfg *Config) {  // Can use Config from config.go
    fmt.Println(cfg.Name)
}
```

No imports between them. They just... work together. The compiler sees them as one blob.

*Running it*

```bash
# Compiles ALL .go files in current directory
$ go run .

# Or explicitly
$ go run main.go config.go process.go
```

## When to Split Files

There's no hard rule, but here's what works:

- **By type** — one file per major struct/type and its methods
- **By responsibility** — config stuff in config.go, HTTP stuff in http.go
- **When it gets long** — if you're scrolling forever, split it

Don't over-split. A 200-line file is fine. Ten 20-line files is annoying.

## Packages = Directories

When your project gets bigger, you'll want separate packages. Each directory is a package.

*Directory structure*

```go
myproject/
├── go.mod              # module github.com/you/myproject
├── main.go             # package main
└── stuff/
    └── stuff.go        # package stuff
```

*stuff/stuff.go*

```go
package stuff

func DoThing() string {
    return "did the thing"
}
```

*main.go*

```go
package main

import "github.com/you/myproject/stuff"

func main() {
    result := stuff.DoThing()
    fmt.Println(result)
}
```

> **Import Path:** The import path is your module name (from go.mod) + the directory path. Not the file path. Not the package name. The directory.

## Uppercase = Exported (Public)

This is Go's visibility system. Dead simple once you get it.

*Visibility rules*

```go
package stuff

// Exported — visible outside this package
func PublicFunc() {}      // ✓ Uppercase first letter
type PublicType struct{} // ✓
var PublicVar = 42       // ✓

// Unexported — only visible inside this package
func privateFunc() {}     // ✗ Lowercase first letter
type privateType struct{} // ✗
var privateVar = 42      // ✗
```

From another package, you can only access the uppercase stuff:

*main.go*

```go
import "github.com/you/myproject/stuff"

stuff.PublicFunc()   // ✓ Works
stuff.privateFunc()  // ✗ Compile error
```

## The internal/ Directory

Go has one magic directory name: `internal/`

Code inside `internal/` can only be imported by code in the parent directory tree. The compiler enforces this.

*internal/ example*

```go
myproject/
├── go.mod
├── main.go                 # Can import internal/secret
├── cmd/
│   └── tool/
│       └── main.go         # Can import internal/secret
└── internal/
    └── secret/
        └── secret.go       # package secret
```

If someone else imports your module, they **cannot** import anything from your internal/ directory. Compiler stops them.

> **When to use internal/:** Put implementation details you don't want to be part of your public API. You can refactor internal code freely without breaking anyone.

## Common Project Layouts

### Small CLI tool

*Simple layout*

```go
mytool/
├── go.mod
├── main.go         # Everything in one package
├── config.go
└── commands.go
```

### Medium project

*With packages*

```go
mytool/
├── go.mod
├── main.go
├── cmd/            # CLI command definitions
│   ├── root.go
│   └── serve.go
└── internal/       # Private implementation
    ├── config/
    └── server/
```

### Library + CLI

*Dual-purpose*

```go
mylib/
├── go.mod
├── mylib.go        # Public library API (package mylib)
├── cmd/
│   └── mylib/
│       └── main.go # CLI that uses the library
└── internal/       # Shared private code
```

## Circular Import = Compile Error

Go doesn't allow circular imports. If package A imports B, B cannot import A.

*This won't compile*

```go
// a/a.go
package a
import "myproject/b"  // A imports B

// b/b.go
package b
import "myproject/a"  // B imports A — ERROR!
```

**Solutions:**

- Merge the packages if they're that intertwined
- Extract shared types into a third package both can import
- Use interfaces to break the dependency

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

## Module 13 Summary

- **Same package, multiple files** — share everything, no imports needed
- **Package = directory** — import path is module + directory
- **Uppercase = exported** — visible outside package
- **internal/** — compiler-enforced private packages
- **No circular imports** — design around it
