## Project Goals

Build a CLI tool that reads Kubernetes YAML files, validates them against a set of rules, and reports violations with file, line, and severity.

This project composes the earlier parsing, validation, file I/O, and CLI pieces into one tool.

Your program should:

1. Accept file paths or directories as CLI arguments
2. Recursively find and parse all `.yaml` and `.yml` files
3. Run validation rules against each parsed document
4. Report violations in a structured format
5. Exit with appropriate codes (0 = clean, 1 = error, 2 = violations found)

## Why This Project

Every infra team needs config validation. This project exercises everything from Track 1 (slices, maps, structs, error handling, testing) plus CLI and file I/O from Module 4.

## Usage

```bash
# Lint specific files
configlint deployment.yaml service.yaml

# Lint a directory recursively
configlint ./k8s/

# JSON output
configlint --format json ./k8s/

# Only show errors (not warnings)
configlint --severity error ./k8s/
```

## Expected Output

```
deployment.yaml:15 [ERROR] missing-resource-limits: container "web" has no resource limits
deployment.yaml:22 [WARN]  latest-tag: container "web" uses image tag "latest"
service.yaml:8    [WARN]  missing-labels: Service "api" missing recommended label "app.kubernetes.io/version"
configmap.yaml    [OK]    no violations

Summary: 2 files with violations, 1 clean
  1 error, 2 warnings
```

## Requirements

### Core

- **Parse YAML files** using `gopkg.in/yaml.v3` (or `encoding/json` after converting — your choice). Unmarshal into `map[string]any` for flexible access.
- **Walk directories** using `filepath.WalkDir` to find `.yaml`/`.yml` files recursively.
- **Define rules as a slice of functions** with the signature:
  ```go
  type Rule struct {
      ID       string
      Severity string // "error" or "warning"
      Check    func(doc map[string]any) []Violation
  }
  ```
- **Report violations** with file path, line (if available), severity, rule ID, and message.
- **Exit codes:** 0 = no violations, 1 = tool error (bad args, unreadable file), 2 = violations found.

### CLI Flags

- `--format` — output format: `text` (default) or `json`
- `--severity` — minimum severity to report: `warning` (default) or `error`
- `--rules` — comma-separated list of rule IDs to run (default: all)

Use the `flag` package or Cobra (your choice).

## Rules to Implement

Start with these 6 rules. Each should be a separate function:

| Rule ID | Severity | What it Checks |
|---|---|---|
| `missing-resource-limits` | error | K8s containers without `resources.limits` |
| `missing-resource-requests` | warning | K8s containers without `resources.requests` |
| `latest-tag` | warning | Container images using `:latest` or no tag |
| `missing-labels` | warning | K8s resources missing `app.kubernetes.io/name` label |
| `deprecated-api` | error | K8s resources using deprecated apiVersions (e.g., `extensions/v1beta1`) |
| `duplicate-env` | error | Containers with duplicate environment variable names |

### How to Navigate the YAML

K8s YAML parsed as `map[string]any`:

```go
// Get containers from a Deployment
spec := doc["spec"].(map[string]any)
template := spec["template"].(map[string]any)
podSpec := template["spec"].(map[string]any)
containers := podSpec["containers"].([]any)

for _, c := range containers {
    container := c.(map[string]any)
    name := container["name"].(string)
    image := container["image"].(string)
    // ...
}
```

> **Tip:** Write a helper that does safe type assertions with fallbacks — these chains panic if any key is missing.

## Test Data

Create a `testdata/` directory with sample files:

*testdata/deployment.yaml*

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels:
    app: web
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: web
          image: nginx:latest
          env:
            - name: PORT
              value: "8080"
            - name: PORT
              value: "9090"
```

*testdata/service.yaml*

```yaml
apiVersion: v1
kind: Service
metadata:
  name: api
spec:
  selector:
    app: api
  ports:
    - port: 80
```

## Suggested Structure

```
configlint/
├── main.go           ← CLI entry point, flag parsing
├── lint.go           ← Core: walk files, parse, run rules, collect violations
├── rules.go          ← All rule implementations
├── rules_test.go     ← Table-driven tests for each rule
├── output.go         ← Formatting (text, JSON)
└── testdata/         ← Sample YAML files for testing
```

## Hints

> **Suggested approach:**
>
> 1. Start with `main.go`: parse flags, collect file paths
> 2. Write `walkYAMLFiles(root string) ([]string, error)` using `filepath.WalkDir`
> 3. Write `parseYAML(path string) ([]map[string]any, error)` — note YAML files can contain multiple documents
> 4. Write one rule (e.g., `latest-tag` — it's the simplest)
> 5. Wire it together: walk → parse → check → report
> 6. Add more rules one at a time, with tests for each

## Testing

Write table-driven tests for each rule:

```go
func TestLatestTag(t *testing.T) {
    tests := []struct {
        name     string
        doc      map[string]any
        wantViol int
    }{
        {"explicit tag", makeDeployment("nginx:1.25"), 0},
        {"latest tag", makeDeployment("nginx:latest"), 1},
        {"no tag", makeDeployment("nginx"), 1},
    }
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            got := latestTagRule.Check(tt.doc)
            if len(got) != tt.wantViol {
                t.Errorf("got %d violations, want %d", len(got), tt.wantViol)
            }
        })
    }
}
```

## Stretch Goals

- **Custom rules from YAML:** Load rule definitions from a `.configlint.yaml` config file
- **--fix mode:** Auto-fix simple violations (e.g., add empty resource limits block)
- **SARIF output:** Output in SARIF format for GitHub Code Scanning integration
- **Terraform support:** Add rules for Terraform `.tf` files (parsed as HCL or JSON)
- **Git integration:** Only lint files changed since a given commit (`git diff --name-only`)

> **Skills Used:** CLI flags, file I/O, YAML parsing, directory walking, struct methods, interfaces (Rule), error handling, table-driven tests, map traversal, string parsing.
