## Project Goals

Build and test a small config parser that turns text lines into typed entries and reports clear errors.

This project combines Module 1 parsing, Module 2 structs, and Module 3 error handling/testing. It is deliberately smaller than the full Config Linter project that comes after Module 4.

Your program should:

1. Parse simple config lines
2. Return explicit errors instead of skipping important failures silently
3. Wrap lower-level errors with context
4. Use sentinel or custom errors where callers need to inspect failures
5. Add table-driven tests for success and failure paths

## Input Format

Each non-empty, non-comment line is:

```txt
key=value
```

Example:

```txt
host=checkout-api
port=8080
replicas=3

# comments are ignored
timeout_seconds=30
```

## Requirements

### Data Model

Define:

```go
type ConfigEntry struct {
    Key   string
    Value string
    Line  int
}
```

### Parser

Write:

```go
func ParseConfig(content string) ([]ConfigEntry, error)
```

Rules:

- Skip blank lines.
- Skip lines starting with `#`.
- Return an error for any non-comment line without `=`.
- Return an error for empty keys.
- Preserve the original line number in each `ConfigEntry`.
- Use `strings.SplitN(line, "=", 2)` so values may contain `=`.

### Error Handling

Define at least one sentinel error:

```go
var ErrMalformedLine = errors.New("malformed config line")
```

Use wrapping so callers can still check:

```go
errors.Is(err, ErrMalformedLine)
```

Add one custom error type:

```go
type ConfigError struct {
    Line int
    Text string
    Err  error
}
```

Its `Error()` method should include the line number, and its `Unwrap()` method should return `Err`.

## Tests

Write table-driven tests for:

- Valid config with multiple entries.
- Blank lines and comments.
- Values containing `=`.
- Missing `=`.
- Empty key.
- Error matching with `errors.Is`.
- Extracting `*ConfigError` with `errors.As`.

Use helpers where repeated assertions make the tests easier to read.

## Acceptance Criteria

- The parser never panics on malformed input.
- Invalid lines return errors with line context.
- Wrapped errors still work with `errors.Is`.
- Custom error fields are inspectable with `errors.As`.
- Tests use subtests with `t.Run`.
- `go test ./...` passes for the package.

## Hints

> **Line numbers:** `range` gives a zero-based index. Store `i + 1`.

> **Wrapping:** Use a custom error type when the caller needs structured fields such as line number.

> **Testing errors:** First check that an error exists, then use `errors.Is` or `errors.As` for the specific behavior.

## Stretch Goals

- Add `ParseIntValue(entries, key string) (int, error)` and wrap `strconv.Atoi` errors.
- Detect duplicate keys with a second sentinel error.
- Add benchmarks for parsing large config files.
- Add a `String()` method for `ConfigEntry`.

## Next Step

The full Config Linter project after Module 4 expands this shape into file walking, CLI flags, YAML parsing, and structured output.
