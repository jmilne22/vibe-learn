## Build: Cloud Reporter — Milestone 1

Tool two begins. This one talks to a real API — and this milestone builds it the simple way on purpose. Modules 6 and 7 exist to make *this exact program* fast, and you'll feel why concurrency matters because you'll be waiting on your own code.

```bash
mkdir cloudreport && cd cloudreport
git init
go mod init cloudreport
```

### The assignment

A sequential client for the GitHub API (public data, no account needed):

1. **HTTP client** with a timeout and User-Agent header; fetch one page of an org's repos from `https://api.github.com/orgs/{org}/repos?per_page=100&page=1` and decode into a `[]Repo` (the struct with json tags is on the [project page](project-cloud-reporter.html)).
2. **Pagination:** loop pages sequentially until a page comes back short. One page at a time, one after another.
3. **Sort and limit:** `--sort stars` and `--limit 20` (flag package is fine here).
4. **Table output** with aligned columns.
5. **Tests with `httptest.NewServer`** — fake the API, assert pagination fetches every page and headers are set. The pattern is in this module's lessons.

### Done when

`go run . repos --org prometheus` prints a correct table, `go test ./...` passes against your httptest fake, and — this is the point — run it against a big org like `kubernetes` and *feel how slow sequential is*. Note the wall-clock time in a comment. Module 6 will cut it by an order of magnitude, and you'll diff the numbers.

Commit.
