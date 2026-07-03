## Build: Ship the Config Linter

This module handed you the last pieces — real YAML parsing, CLI frameworks, exit codes. Time to finish tool number one of five.

### The assignment

The full specification is the next page in the sidebar: the [Config Linter project page](project-config-linter.html). As of this milestone, **everything on it is your job.** The work, in order:

1. **Port your rules to parsed YAML.** Swap raw-line checks for `gopkg.in/yaml.v3` into `map[string]any` and walk the tree (the project page shows the navigation pattern). Your tests from Milestone 3 are the safety net — they should keep passing with only their inputs changed.
2. **Implement the full six-rule table** from the project page, each rule tested.
3. **CLI:** Cobra or `flag` — `--format`, `--severity`, `--rules`, directory walking, exit codes 0/1/2.
4. **README** with install, usage, and example output. This page is what makes it a portfolio repo instead of a homework folder.

### Done when

- Every command in the project page's Usage section works.
- `go test ./...` passes.
- Exit codes match the spec (`echo $?` after a clean run, a violation run, and a bad-args run).
- The repo is pushed with its README. **Shipped: one of five.**

> If any step here feels out of reach, the gap is behind you, not ahead — find the module section it belongs to, re-read, do two or three of its exercises, and come back.
