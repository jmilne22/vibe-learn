## Project Goals

Build a log parser that processes server log entries and produces a summary report. You've practiced all the pieces in the exercises — now compose them into a real program.

Your program should:

1. Parse structured log lines into components (timestamp, level, message)
2. Filter logs by level
3. Count entries per level using a map
4. Detect repeated error messages
5. Print a formatted summary report

## The Log Format

Every log line follows this structure:

*Log format*

```
2024-01-15 10:30:45 ERROR connection timeout
│                 │ │     │
└─ date ──────────┘ │     └─ message
    └─ time ────────┘
        └─ level
```

Fields are space-separated. The timestamp is always the first two fields (date + time), level is the third field, and the message is everything after.

## Input Data

Since we haven't covered file I/O yet, hardcode this slice in your program:

*Test data*

```go
logs := []string{
    "2024-01-15 10:30:45 INFO server started on port 8080",
    "2024-01-15 10:31:02 INFO handling request GET /api/users",
    "2024-01-15 10:31:03 WARN slow query: 2.3s",
    "2024-01-15 10:31:15 ERROR connection timeout",
    "2024-01-15 10:31:16 ERROR connection timeout",
    "2024-01-15 10:31:20 INFO handling request POST /api/login",
    "2024-01-15 10:31:22 ERROR disk full",
    "2024-01-15 10:31:30 WARN high memory usage: 89%",
    "2024-01-15 10:31:45 ERROR connection timeout",
    "2024-01-15 10:32:00 INFO request completed 200 OK",
}
```

## Expected Output

Your program should print exactly this (level order and formatting must match):

*Expected output*

```
=== Log Report ===
Total entries: 10
  INFO: 4
  WARN: 2
  ERROR: 4
Most common: INFO

Repeated errors (more than 1 occurrence):
  - connection timeout

--- 4 Error(s) ---
  connection timeout
  connection timeout
  disk full
  connection timeout
```

## Requirements

- **Parse each log line** into timestamp, level, and message. Skip malformed lines (fewer than 4 fields) instead of crashing.
- **Count entries per level** using a `map[string]int`. Print counts in the order: INFO, WARN, ERROR (not random map order).
- **Find the most common level** by iterating the count map.
- **Detect repeated errors** — find error messages that appear more than once.
- **Filter and display errors** — show all ERROR-level messages extracted from the log lines.
- Write at least 3 separate functions besides `main`. Each function should do one thing.

## Hints

If you're stuck on how to structure this, here's a suggested function breakdown. You don't have to follow it exactly.

> **Suggested functions:**
>
> - A function that splits a log line into its 3 parts (returns timestamp, level, message, and an error)
> - A function that takes all lines and returns a `map[string]int` of level counts
> - A function that takes all lines and a threshold, returns error messages exceeding that threshold
> - `main()` calls the above and formats the output

## Stretch Goals

- **Hourly breakdown:** Extract the hour from each timestamp (characters 11-12) and print entry counts per hour
- **Keyword search:** Accept a keyword and show only lines whose message contains it
- **Top N errors:** Instead of a threshold, show the top 3 most frequent error messages
- **Aligned table:** Print level counts as an aligned table using `fmt.Sprintf("%-8s %d", level, count)`

> **Skills Used:** Variables, functions, multiple returns, error handling, slices, maps, range loops, string processing, `fmt.Sprintf`, function composition.
