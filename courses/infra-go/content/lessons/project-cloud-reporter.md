## Project Goals

Build a CLI tool that queries a cloud API, aggregates resource information, and outputs formatted reports in multiple formats.

Your program should:

1. Connect to a REST API (we'll use the GitHub API — free, no account needed for public data)
2. Fetch and paginate through resources
3. Aggregate data: count by category, compute statistics
4. Output reports in table, JSON, and CSV formats
5. Handle errors, rate limiting, and timeouts gracefully

## Why This Project

This is the kind of tool every infra team builds internally. Whether it's querying AWS, GCP, or an internal inventory system, the pattern is always: connect → fetch → aggregate → report. This project exercises HTTP clients, JSON handling, pagination, and data aggregation.

## How You Got Here

This tool was built across Modules 5–7, one milestone per module — each module's final **Build** section. This page is the complete spec of the finished tool; shipping it is Module 7's Build assignment.

## Usage

```bash
# Report on a GitHub org's repos
cloudreport repos --org kubernetes --format table

# Report with sorting
cloudreport repos --org hashicorp --sort stars --limit 20

# JSON output for piping to jq
cloudreport repos --org prometheus --format json | jq '.repos[].name'

# CSV for spreadsheets
cloudreport repos --org grafana --format csv > repos.csv
```

## Expected Output

*Table format (default):*

```
=== Repository Report: kubernetes ===
Total repositories: 20 (showing top 20 by stars)

NAME                     STARS    FORKS    LANG        UPDATED
kubernetes               105841   38420    Go          2024-01-15
minikube                 28102    4891     Go          2024-01-14
ingress-nginx            16421    8102     Go          2024-01-15
dashboard                13542    4021     TypeScript  2024-01-13
kops                     15520    5610     Go          2024-01-12

Summary:
  Total stars: 179,426
  Languages: Go (14), TypeScript (3), Shell (2), Python (1)
  Updated in last 7 days: 18
```

## Requirements

### Core

- **HTTP client** with configurable timeout (default 30s) and User-Agent header.
- **Pagination:** The GitHub API returns 30 items per page. Follow `Link` header or use `?page=N&per_page=100` to get all results.
- **Rate limiting:** Check the `X-RateLimit-Remaining` header. If approaching the limit (< 10), warn the user and slow down.
- **Data model:** Parse API responses into typed structs:
  ```go
  type Repo struct {
      Name        string    `json:"name"`
      Stars       int       `json:"stargazers_count"`
      Forks       int       `json:"forks_count"`
      Language    string    `json:"language"`
      UpdatedAt   time.Time `json:"updated_at"`
      Description string    `json:"description"`
  }
  ```
- **Aggregation:** Total stars, repos per language, recently updated count.
- **Output formats:** Table (aligned columns), JSON (pretty-printed), CSV (with headers).

### CLI Flags

- `--org` — GitHub organization to query (required)
- `--format` — output format: `table` (default), `json`, `csv`
- `--sort` — sort by: `stars` (default), `name`, `updated`, `forks`
- `--limit` — max repos to display (default: 20, 0 = all)
- `--timeout` — HTTP timeout in seconds (default: 30)

### API Endpoints

```
GET https://api.github.com/orgs/{org}/repos?per_page=100&page=1&sort=updated
```

Response headers to check:
- `X-RateLimit-Remaining` — requests left in the current window
- `X-RateLimit-Reset` — Unix timestamp when the window resets
- `Link` — pagination links (next, last)

## Suggested Structure

```
cloudreport/
├── main.go           ← CLI entry point
├── client.go         ← HTTP client, pagination, rate limit handling
├── client_test.go    ← Tests using httptest.NewServer
├── models.go         ← Repo struct, aggregation types
├── aggregate.go      ← Sorting, grouping, statistics
├── output.go         ← Table, JSON, CSV formatters
└── output_test.go    ← Format output tests
```

## Hints

> **Suggested approach:**
>
> 1. Start by fetching a single page from the GitHub API and parsing the JSON
> 2. Add pagination — fetch all pages into a `[]Repo`
> 3. Add sorting and limiting
> 4. Build the table formatter first (most useful for debugging)
> 5. Add JSON and CSV formatters
> 6. Add rate limit checking
> 7. Add the aggregation summary

### Pagination Helper

```go
func (c *Client) fetchAllRepos(org string) ([]Repo, error) {
    var all []Repo
    page := 1
    for {
        repos, hasNext, err := c.fetchReposPage(org, page)
        if err != nil {
            return nil, err
        }
        all = append(all, repos...)
        if !hasNext {
            break
        }
        page++
    }
    return all, nil
}
```

### Table Formatting

```go
// Compute column widths from data, then use fmt.Sprintf with padding
fmt.Sprintf("%-*s  %-*d  %-*d  %-*s", nameWidth, name, 8, stars, 8, forks, langWidth, lang)
```

## Testing

Use `httptest.NewServer` to mock the GitHub API:

```go
func TestFetchRepos(t *testing.T) {
    server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode([]Repo{
            {Name: "test-repo", Stars: 42, Language: "Go"},
        })
    }))
    defer server.Close()

    client := NewClient(server.URL, 10*time.Second)
    repos, err := client.fetchAllRepos("test-org")
    // assert...
}
```

## Stretch Goals

- **Caching:** Cache API responses to disk with TTL (avoid hitting rate limits during development)
- **Diff mode:** Compare current report with a saved previous report, show what changed
- **GitHub token:** Accept `GITHUB_TOKEN` env var for authenticated requests (higher rate limits)
- **Multiple orgs:** Accept multiple `--org` flags and merge results
- **Sparklines:** Show star history using Unicode block characters

> **Skills Used:** HTTP clients, JSON parsing, pagination, struct methods, sorting (sort.Slice), string formatting, multiple output formats, CLI flags, error handling, test mocking with httptest.
