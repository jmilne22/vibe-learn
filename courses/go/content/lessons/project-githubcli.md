## Project Goals

Build a CLI that interacts with GitHub API:

1. `gh user <username>` — show user info
2. `gh repos <username>` — list repositories
3. `gh star <owner/repo>` — star a repo
4. `gh issues <owner/repo>` — list open issues

## Components to Use

- `cobra` — for CLI structure
- `net/http` — for API requests
- `lipgloss` — for pretty output

## API Endpoints

*GitHub API*

```go
// User info
GET https://api.github.com/users/{username}

// User repos
GET https://api.github.com/users/{username}/repos

// Star a repo (requires auth)
PUT https://api.github.com/user/starred/{owner}/{repo}

// List issues
GET https://api.github.com/repos/{owner}/{repo}/issues
```

## Example Output

*Terminal output*

```bash
$ gh user golang
┌─────────────────────────────────────┐
│  golang                             │
│  The Go Programming Language        │
│  ────────────────────────────────   │
│  📍 Location: n/a                   │
│  👥 Followers: 23,456               │
│  📦 Public repos: 42                │
└─────────────────────────────────────┘
```

> **Skills Used:** <p>HTTP clients, JSON decoding, Cobra CLI, environment variables for API tokens, lipgloss styling.</p>
