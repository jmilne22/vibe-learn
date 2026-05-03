## Project Goals

Build a small Go program that reads service log lines, extracts fields, and prints a stable operational summary.

This is the first applied milestone: take the slice, map, string parsing, percentage, and sorting patterns from Module 1 and turn them into a useful reporting tool.

Your program should:

1. Parse service log lines in the format `service status=CODE latency_ms=N region=REGION`
2. Count requests by service
3. Count requests by status code
4. Calculate error rate for status codes >= 500
5. Skip blank lines, comment lines, and malformed lines without panicking
6. Print deterministic output by sorting map keys before reporting

## Input

Use this sample input while building:

```txt
checkout-api status=200 latency_ms=34 region=us-east-1
ledger-worker status=500 latency_ms=91 region=eu-west-1
checkout-api status=200 latency_ms=41 region=us-east-1
edge-proxy status=404 latency_ms=12 region=us-west-2
ledger-worker status=503 latency_ms=120 region=eu-west-1

# malformed lines should be skipped
bad-line-here
metrics-relay status=oops latency_ms=40 region=us-east-1
```

## Expected Output

```txt
Requests by service:
checkout-api 2
edge-proxy 1
ledger-worker 2

Status codes:
200 2
404 1
500 1
503 1

Error rate: 40.0%
Malformed lines: 2
```

## Requirements

### Core

- Store the sample input in a multi-line string.
- Split the input into lines with `strings.Split`.
- Trim each line with `strings.TrimSpace`.
- Skip blank lines and lines beginning with `#`.
- Parse fields with `strings.Fields`.
- Parse `status=CODE` with `strings.SplitN`.
- Convert the status code with `strconv.Atoi`.
- Count services with `map[string]int`.
- Count status codes with `map[int]int`.
- Sort service names alphabetically before printing.
- Sort status codes numerically before printing.
- Count malformed lines instead of crashing.

### Suggested Functions

```go
func parseLine(line string) (service string, status int, ok bool)
func sortedServiceLines(counts map[string]int) []string
func sortedStatusLines(counts map[int]int) []string
func errorRate(total, errors int) float64
```

These signatures are suggestions, not a framework. Keep the program small enough that you understand every line.

## Acceptance Criteria

- Valid lines affect both service counts and status-code counts.
- Blank lines and comments are ignored.
- Malformed non-comment lines increment the malformed count.
- The program never indexes a slice before checking its length.
- Output order is stable across repeated runs.
- Error rate uses floating-point division and prints one decimal place.

## Hints

> **Parsing one line:** Split into fields first. The service is `fields[0]`. Then scan the remaining fields until you find one with prefix `status=`.

> **Stable output:** Maps do not preserve order. Collect the keys into a slice, sort the slice, then index back into the map.

> **Error rate:** Count status codes from 500 through 599 as errors. Use `float64(errors) / float64(total) * 100`.

## Stretch Goals

- Add a region summary.
- Track the highest latency you saw, but do not sort by latency yet.
- Accept input from a file path using `os.ReadFile`.
- Split the program into small functions and add comments above the non-obvious ones.

## Module 2 Teaser

This project can count and sort by keys, but sorting by values gets awkward fast. In Module 2, structs let you keep fields together so you can sort by count, latency, memory, or any other value without losing the label attached to it.
