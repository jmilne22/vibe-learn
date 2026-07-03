## Build: Config Linter — Milestone 2

Milestone 1 left you with loose counters and no shape. This is where the linter becomes a linter — by putting this module's types to work.

### The assignment

In your `configlint` repo, restructure around three types:

```go
type Violation struct {
    File     string
    Line     int
    Severity string // "error" or "warning"
    RuleID   string
    Message  string
}

type Rule struct {
    ID       string
    Severity string
    Check    func(lines []string) []Violation
}

type Linter struct {
    Rules []Rule
}
```

(`Check` works on raw lines for now. It moves to parsed YAML in Milestone 4 — don't build for that yet.)

1. **`latest-tag` rule:** flag any line containing `image:` whose value ends in `:latest` or has no tag at all.
2. **`duplicate-env` rule:** inside an `env:` block, flag repeated `name:` values.
3. **A `Run` method on `Linter`** that applies every rule to a file's lines and collects all violations.
4. **Print violations** in this format:

```
deployment.yaml:14 [WARN] latest-tag: container image uses :latest
```

### Done when

`go run . deployment.yaml` (the Milestone 1 test file) reports the `:latest` image that's really in it, and a file with two `PORT` entries under `env:` trips `duplicate-env`. Commit.

As you refactor, notice what the types buy you: adding a third rule is now "append one struct to a slice" instead of "weave another counter through the loop." That's the module's whole argument, made by your own code.

> **Where this ends up:** [Config Linter project page](project-config-linter.html) — the full spec. Still not your job.
