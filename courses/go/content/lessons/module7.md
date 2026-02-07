## Basic Arguments with os.Args

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

For complex CLIs with subcommands (like git, docker), use Cobra.

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

## Exit Codes

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

## Module 6 Summary

- **os.Args** — raw argument access
- **flag package** — built-in flag parsing
- **Cobra** — for complex subcommand CLIs
- **os.Stdin/Stdout/Stderr** — standard streams
- **os.Exit(code)** — 0 = success, 1+ = error
