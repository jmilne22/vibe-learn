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

<div class="inline-exercises" data-concept="Validation"></div>
