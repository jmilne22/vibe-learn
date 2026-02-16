Every infra tool starts as a CLI. This module teaches you to build real ones — not scripts, but tools with proper argument parsing, config loading, and exit codes.

---

## os.Args & the Flag Package

### Raw Arguments

```go
// os.Args[0] is the program name, rest are arguments
fmt.Println(os.Args[0])  // "./mytool"
fmt.Println(os.Args[1:]) // ["--config", "/etc/app.yaml"]
```

Fine for throwaway scripts. Not fine for real tools.

### The flag Package

Standard library, no dependencies:

```go
import "flag"

func main() {
    config := flag.String("config", "config.yaml", "path to config file")
    verbose := flag.Bool("verbose", false, "enable verbose output")
    port := flag.Int("port", 8080, "server port")
    flag.Parse()

    fmt.Printf("config=%s verbose=%t port=%d\n", *config, *verbose, *port)
    // Remaining positional args
    fmt.Println("files:", flag.Args())
}
```

```bash
./mytool --config /etc/app.yaml --verbose --port 9090 file1.yaml file2.yaml
```

**When flag is enough:** Single-command tools with a few options. `go test` itself uses the flag package.

**When you need more:** Subcommands (`mytool lint`, `mytool validate`), nested flags, shell completion. That's Cobra.

## Cobra for Real CLIs

Cobra is what kubectl, docker, gh, helm, and hugo use. It's the de facto standard for Go CLIs.

```bash
go get github.com/spf13/cobra@latest
```

### Project Structure

```
mytool/
├── cmd/
│   ├── root.go      # root command, global flags
│   ├── lint.go       # mytool lint
│   └── validate.go   # mytool validate
├── main.go           # just calls cmd.Execute()
└── go.mod
```

### Root Command

```go
// cmd/root.go
package cmd

import (
    "fmt"
    "os"
    "github.com/spf13/cobra"
)

var cfgFile string

var rootCmd = &cobra.Command{
    Use:   "mytool",
    Short: "Infrastructure config toolkit",
    Long:  "Validate, lint, and transform infrastructure configuration files.",
}

func Execute() {
    if err := rootCmd.Execute(); err != nil {
        fmt.Fprintln(os.Stderr, err)
        os.Exit(1)
    }
}

func init() {
    rootCmd.PersistentFlags().StringVar(&cfgFile, "config", "", "config file path")
}
```

### Subcommands

```go
// cmd/lint.go
package cmd

import (
    "fmt"
    "github.com/spf13/cobra"
)

var strict bool

var lintCmd = &cobra.Command{
    Use:   "lint [files...]",
    Short: "Lint config files for common issues",
    Args:  cobra.MinimumNArgs(1),
    RunE: func(cmd *cobra.Command, args []string) error {
        for _, file := range args {
            if err := lintFile(file); err != nil {
                return fmt.Errorf("linting %s: %w", file, err)
            }
        }
        return nil
    },
}

func init() {
    lintCmd.Flags().BoolVar(&strict, "strict", false, "treat warnings as errors")
    rootCmd.AddCommand(lintCmd)
}
```

### Key Concepts

| Concept | What it means |
|---------|--------------|
| `PersistentFlags()` | Available to this command AND all subcommands |
| `Flags()` | Only available to this specific command |
| `RunE` vs `Run` | `RunE` returns error (preferred). `Run` doesn't. |
| `Args: cobra.MinimumNArgs(1)` | Validates at least 1 positional argument |
| `cobra.ExactArgs(2)` | Exactly 2 arguments required |

*Python comparison*

```python
# Python: argparse or click
# Go: flag for simple, Cobra for real CLIs
# The patterns are nearly identical — subcommands, flags, validation.
# Cobra just has better shell completion and help generation.
```

## Parsing YAML & JSON

Infrastructure is YAML and JSON all the way down. K8s manifests, Terraform configs, CI pipelines, Helm values.

### JSON with encoding/json

```go
import "encoding/json"

type Pod struct {
    Name      string `json:"name"`
    Namespace string `json:"namespace"`
    Image     string `json:"image,omitempty"` // omit if empty
    Replicas  int    `json:"replicas"`
}

// Unmarshal: JSON bytes → struct
data := []byte(`{"name":"web","namespace":"prod","replicas":3}`)
var pod Pod
if err := json.Unmarshal(data, &pod); err != nil {
    return fmt.Errorf("parsing JSON: %w", err)
}

// Marshal: struct → JSON bytes
out, err := json.MarshalIndent(pod, "", "  ")
if err != nil {
    return fmt.Errorf("encoding JSON: %w", err)
}
fmt.Println(string(out))
```

### Struct Tags

Tags control how fields map to JSON/YAML keys:

```go
type Config struct {
    APIVersion string            `json:"apiVersion" yaml:"apiVersion"`
    Kind       string            `json:"kind" yaml:"kind"`
    Metadata   Metadata          `json:"metadata" yaml:"metadata"`
    Spec       map[string]any    `json:"spec" yaml:"spec"`
}
```

### YAML with gopkg.in/yaml.v3

```go
import "gopkg.in/yaml.v3"

// Same patterns as JSON
data, err := os.ReadFile("deployment.yaml")
if err != nil { ... }

var config Config
if err := yaml.Unmarshal(data, &config); err != nil {
    return fmt.Errorf("parsing YAML: %w", err)
}
```

### Handling Unknown Fields

K8s manifests have many fields you might not care about:

```go
// Option 1: use map[string]any for flexible parsing
var raw map[string]any
yaml.Unmarshal(data, &raw)

// Option 2: define only the fields you need — unknown fields are silently ignored
type Minimal struct {
    APIVersion string `yaml:"apiVersion"`
    Kind       string `yaml:"kind"`
}

// Option 3: strict mode — reject unknown fields (json only)
decoder := json.NewDecoder(bytes.NewReader(data))
decoder.DisallowUnknownFields()
```

## File I/O Patterns

### Read Entire File

```go
// Simple: read whole file into memory
data, err := os.ReadFile("config.yaml")
if err != nil {
    return fmt.Errorf("reading file: %w", err)
}
```

### Line-by-Line (For Large Files)

```go
file, err := os.Open("access.log")
if err != nil {
    return fmt.Errorf("opening log: %w", err)
}
defer file.Close()

scanner := bufio.NewScanner(file)
for scanner.Scan() {
    line := scanner.Text()
    // process line
}
if err := scanner.Err(); err != nil {
    return fmt.Errorf("reading log: %w", err)
}
```

### Walking Directories

```go
// Find all YAML files in a directory tree
err := filepath.WalkDir("./manifests", func(path string, d fs.DirEntry, err error) error {
    if err != nil {
        return err
    }
    if d.IsDir() {
        return nil
    }
    if filepath.Ext(path) == ".yaml" || filepath.Ext(path) == ".yml" {
        fmt.Println(path)
    }
    return nil
})
```

### Reading from stdin

For piping: `cat config.yaml | mytool lint -`

```go
import "io"

var input io.Reader
if filename == "-" {
    input = os.Stdin
} else {
    f, err := os.Open(filename)
    if err != nil {
        return err
    }
    defer f.Close()
    input = f
}

data, err := io.ReadAll(input)
```

## Validation & Reporting

### Building a Validation Pipeline

```go
type LintResult struct {
    File     string
    Line     int
    Severity string // "error", "warning"
    Message  string
}

func lintFile(path string) ([]LintResult, error) {
    data, err := os.ReadFile(path)
    if err != nil {
        return nil, fmt.Errorf("reading %s: %w", path, err)
    }

    var results []LintResult
    results = append(results, checkAPIVersion(path, data)...)
    results = append(results, checkLabels(path, data)...)
    results = append(results, checkResources(path, data)...)
    return results, nil
}
```

### Formatting Output

```go
// Plain text (default)
for _, r := range results {
    fmt.Fprintf(os.Stderr, "%s:%d [%s] %s\n", r.File, r.Line, r.Severity, r.Message)
}

// JSON (for machine consumption)
if outputJSON {
    enc := json.NewEncoder(os.Stdout)
    enc.SetIndent("", "  ")
    enc.Encode(results)
}
```

### Exit Codes

```go
func main() {
    results, err := runLint(files)
    if err != nil {
        fmt.Fprintln(os.Stderr, err)
        os.Exit(1)  // runtime error
    }

    hasErrors := false
    for _, r := range results {
        if r.Severity == "error" {
            hasErrors = true
        }
    }

    if hasErrors {
        os.Exit(2)  // validation failures found
    }
    os.Exit(0)  // all clean
}
```

Convention: 0 = success, 1 = runtime error, 2 = validation failures. This lets CI scripts distinguish "tool crashed" from "found problems."

---

## Exercises

Practice individual concepts with quick drills, then tackle multi-step challenges.

<div id="warmups-container">
    <noscript><p class="js-required">JavaScript is required for the interactive exercises.</p></noscript>
</div>

### Challenges

Apply what you learned to infra-themed problems. Each challenge has multiple variants — shuffle to keep things fresh.

<div id="challenges-container">
    <noscript><p class="js-required">JavaScript is required for the interactive exercises.</p></noscript>
</div>
