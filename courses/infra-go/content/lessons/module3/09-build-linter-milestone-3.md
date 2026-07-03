## Build: Config Linter — Milestone 3

Your linter works when everything goes right. This milestone makes it survive everything going wrong — and puts it under test, where it stays forever.

### The assignment

1. **Wrap every file error with its filename:**

   ```go
   fmt.Errorf("lint %s: %w", path, err)
   ```

   An unreadable file must not crash the run — lint the rest, report the failure at the end, and keep going.

2. **Table-driven tests for both rules** in `rules_test.go` — the exact pattern from this module's lessons. At minimum: a clean input, a violating input, and an edge case per rule (e.g. `image: nginx` — no tag at all — for `latest-tag`).

3. **Add a third rule, test-first.** Pick one from the project's rules table (`missing-labels` is a good line-based candidate). Write its failing test before its code.

### Done when

- `go test ./...` passes.
- Running against a directory containing one unreadable file (`chmod 000 bad.yaml`) still lints the others and reports the error without crashing.

Commit. From this milestone on, **a passing test suite is the definition of done** — for the linter and for every challenge in the rest of this course.

> **Where this ends up:** [Config Linter project page](project-config-linter.html). After the next module, all of it is your job.
