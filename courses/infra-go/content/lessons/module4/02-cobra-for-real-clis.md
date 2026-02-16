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
