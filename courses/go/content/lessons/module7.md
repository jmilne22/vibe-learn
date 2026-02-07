## Choosing Your Argument Parser

Before diving into code, here's the deal: Go gives you three main ways to handle command-line arguments, and picking the wrong one means rewriting later. Use this as your guide:

| Approach | When to Use | Example |
|----------|-------------|---------|
| `os.Args` | 1-2 positional args, quick scripts, no flags needed | `myutil <filename>` |
| `flag` | Named flags, simple CLIs, stdlib-only (no dependencies) | `mytool -port=8080 -verbose` |
| `Cobra` | Subcommands, complex CLIs, auto-generated help/completion | `myapp serve --port=8080` |

> **Rule of thumb:** Start with the simplest option that fits. You can always graduate to Cobra later, but don't reach for it when `os.Args` would do the job in five lines.

Here's how to think about it: if your program takes a filename and maybe one flag, `os.Args` is your friend. Once you need `--help` output or multiple named flags, reach for `flag`. When your CLI starts looking like `git` with subcommands, that's Cobra territory.

Now let's walk through each approach, starting from the simplest.

## Basic Arguments with os.Args

The most basic approach is `os.Args` — a raw string slice of everything the user typed. This is perfect when you just need a filename or a single positional argument and don't want any extra machinery.

*os.Args basics*

```go
package main

import (
    "fmt"
    "os"
)

func main() {
    // os.Args[0] = program name
    // os.Args[1:] = actual arguments
    fmt.Println("Program:", os.Args[0])
    fmt.Println("Args:", os.Args[1:])
    
    if len(os.Args) < 2 {
        fmt.Fprintln(os.Stderr, "Usage: program <name>")
        os.Exit(1)
    }
}
```

*Terminal*

```bash
$ go run main.go hello world
Program: /tmp/go-build.../main
Args: [hello world]
```

## The flag Package

Once your tool needs named options — think `--port`, `--verbose`, `--output` — raw `os.Args` parsing gets ugly fast. The `flag` package is in the standard library and handles all of this with zero dependencies.

*Using flag*

```go
package main

import (
    "flag"
    "fmt"
)

func main() {
    // Define flags (returns pointers!)
    name := flag.String("name", "World", "Name to greet")
    count := flag.Int("count", 1, "Times to greet")
    verbose := flag.Bool("verbose", false, "Verbose output")
    
    // Parse command line
    flag.Parse()
    
    // Access values (dereference pointers)
    for i := 0; i < *count; i++ {
        if *verbose {
            fmt.Printf("[%d] Hello, %s!\n", i+1, *name)
        } else {
            fmt.Printf("Hello, %s!\n", *name)
        }
    }
    
    // Remaining args (non-flag)
    fmt.Println("Remaining:", flag.Args())
}
```

*Usage*

```bash
$ go run main.go -name=Gopher -count=3 -verbose
[1] Hello, Gopher!
[2] Hello, Gopher!
[3] Hello, Gopher!

$ go run main.go -help
Usage of main:
  -count int
        Times to greet (default 1)
  -name string
        Name to greet (default "World")
  -verbose
        Verbose output
```

## Cobra for Subcommands

When your CLI grows beyond a flat list of flags — when you need `myapp serve`, `myapp migrate`, `myapp config set` — that's when Cobra shines. It's the library behind `kubectl`, `hugo`, and `gh`. Don't use it for a simple single-purpose tool, but for anything with subcommands, it's the industry standard.

*Install Cobra*

```bash
$ go get github.com/spf13/cobra@latest
```

*Cobra structure*

```go
// cmd/root.go
package cmd

import "github.com/spf13/cobra"

var rootCmd = &cobra.Command{
    Use:   "myapp",
    Short: "My awesome CLI app",
}

func Execute() error {
    return rootCmd.Execute()
}

// cmd/greet.go
var greetCmd = &cobra.Command{
    Use:   "greet [name]",
    Short: "Greet someone",
    Args:  cobra.ExactArgs(1),
    Run: func(cmd *cobra.Command, args []string) {
        loud, _ := cmd.Flags().GetBool("loud")
        name := args[0]
        if loud {
            fmt.Printf("HELLO, %s!!!\n", strings.ToUpper(name))
        } else {
            fmt.Printf("Hello, %s!\n", name)
        }
    },
}

func init() {
    greetCmd.Flags().BoolP("loud", "l", false, "Shout the greeting")
    rootCmd.AddCommand(greetCmd)
}
```

## stdin, stdout, stderr

Here's where Go really shows its strength as a systems language. Every CLI program has three streams: stdin (input), stdout (normal output), and stderr (errors and diagnostics). Understanding these is essential because they're how your programs talk to each other in pipelines.

*Working with streams*

```go
package main

import (
    "bufio"
    "fmt"
    "os"
    "strings"
)

func main() {
    // Write to stdout (normal output)
    fmt.Println("This goes to stdout")
    
    // Write to stderr (errors/progress)
    fmt.Fprintln(os.Stderr, "This goes to stderr")
    
    // Read from stdin line by line
    scanner := bufio.NewScanner(os.Stdin)
    for scanner.Scan() {
        line := scanner.Text()
        fmt.Println(strings.ToUpper(line))
    }
    
    if err := scanner.Err(); err != nil {
        fmt.Fprintln(os.Stderr, "Error:", err)
        os.Exit(1)
    }
}
```

*Piping*

```bash
# Pipe input
$ echo "hello world" | go run main.go
HELLO WORLD

# Redirect stderr
$ go run main.go 2>/dev/null

# Combine with other tools
$ cat file.txt | go run main.go | grep pattern
```

### Building a Unix Filter

The Unix philosophy says: write programs that do one thing well, read from stdin, write to stdout, and compose with other tools via pipes. Go makes this easy. Here's a practical filter that extracts email addresses from input:

*Email extractor filter*

```go
package main

import (
    "bufio"
    "fmt"
    "os"
    "regexp"
)

func main() {
    re := regexp.MustCompile(`[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}`)
    scanner := bufio.NewScanner(os.Stdin)
    for scanner.Scan() {
        matches := re.FindAllString(scanner.Text(), -1)
        for _, m := range matches {
            fmt.Println(m)
        }
    }
    if err := scanner.Err(); err != nil {
        fmt.Fprintln(os.Stderr, "read error:", err)
        os.Exit(1)
    }
}
```

*Composing with other tools*

```bash
# Extract emails from a log, sort unique, count them
$ cat server.log | go run emailgrep.go | sort -u | wc -l

# Chain with curl to scrape a page
$ curl -s https://example.com | go run emailgrep.go
```

> **Unix Philosophy:** Your Go program doesn't need to do everything. Write small filters, send errors to stderr (so they don't pollute the pipeline), and let the shell glue things together.

## Exit Codes

Your CLI needs to tell the shell whether it succeeded or failed. Other programs, scripts, and CI pipelines depend on this. Don't just print an error message — set the exit code too, or your tool will silently break automation.

*Proper exit handling*

```go
func main() {
    if err := run(); err != nil {
        fmt.Fprintln(os.Stderr, "Error:", err)
        os.Exit(1)
    }
}

func run() error {
    // Your actual logic here
    // Return errors instead of os.Exit()
    return nil
}

// Common exit codes:
// 0 = success
// 1 = general error
// 2 = misuse of command
```

> **Pattern:** Keep main() thin. Put logic in run() that returns errors. Easier to test!

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

## Module 7 Summary

- **Decision framework** — pick os.Args, flag, or Cobra based on complexity
- **os.Args** — raw argument access for simple positional args
- **flag package** — built-in flag parsing for named options
- **Cobra** — for complex subcommand CLIs (kubectl, docker style)
- **os.Stdin/Stdout/Stderr** — standard streams and Unix filter pattern
- **os.Exit(code)** — 0 = success, 1+ = error; keep main() thin
