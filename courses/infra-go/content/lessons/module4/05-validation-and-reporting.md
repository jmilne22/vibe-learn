## Validation & Reporting

### Building a Validation Pipeline

<attempt type="worked">

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

</attempt>

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

<attempt type="gaps">

<gaps prompt="From memory — each check contributes a slice, and human vs machine output go to different streams.">
```go
var results []LintResult
results = append(results, checkAPIVersion(path, data)«...»)  // each check returns a slice

// human-readable diagnostics
for _, r := range results {
    fmt.Fprintf(«os.Stderr», "%s:%d [%s] %s\n", r.File, r.Line, r.Severity, r.Message)
}

// machine-readable report
if outputJSON {
    enc := json.NewEncoder(«os.Stdout»)
    enc.SetIndent("", "  ")
    enc.«Encode(results)»
}
```
</gaps>

</attempt>

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

<attempt type="scratch">

<div class="inline-exercises" data-concept="Validation"></div>

</attempt>

---

> **Next:** the Build section — ship the linter. First repo of five.
