## Read a stream without hiding failures

A configuration is one document. Logs often arrive as a sequence of records. Newline-delimited JSON gives each physical line one JSON value:

```text
{"service":"api","level":"info"}
{"service":"worker","level":"error"}
{"service":"api","level":"info"}
```

Our report counts records per service. It does not count only errors, and it does not deduplicate repeated events. Start by writing the expected answer: api=2, worker=1. A requirement about retry deduplication would need an event identity; it cannot be inferred from these fields.

### Process one line at a time

```go
scanner := bufio.NewScanner(reader)
line := 0
for scanner.Scan() {
    line++
    text := strings.TrimSpace(scanner.Text())
    if text == "" {
        continue
    }
    // Decode one record, validate it, then update the count.
}
if err := scanner.Err(); err != nil {
    return nil, err
}
```

`Scan` returning false can mean end-of-input or failure. Ignoring `Err` makes a truncated read look like a complete report. For a tool used during an incident, a confident but incomplete count can be worse than an explicit failure.

Scanner's default token limit is about 64 KiB; the exact usable record length is slightly smaller because of buffering and delimiters. Our exercise rejects oversized lines. If the product needs larger records, set a documented bound with `Scanner.Buffer` or use a reader with explicit size accounting. “Unlimited” is not a free choice: somebody pays for the memory.

Decode a line into the fields you need:

```go
var record struct {
    Service string `json:"service"`
}
if err := json.Unmarshal([]byte(text), &record); err != nil {
    return nil, fmt.Errorf("line %d: %w", line, err)
}
```

Unlike our configuration, log records allow extra fields. We only need service, and other producers may add fields over time. Strictness belongs to an interface's contract, not to a blanket rule for all JSON.

### Decide whether partial results are useful

Our function returns nil and an error for any bad record. It does not return counts from the valid prefix. That avoids accidentally presenting a partial report as complete.

A log exploration tool could instead return counts plus rejected-record statistics. That is a different interface: its caller must be able to show incompleteness. Silently skipping bad records is not the same design.

**Exercise: Report the line that failed.** Physical line numbers include blank lines. If line 2 is invalid after a blank first line, say line 2. Add a test for an empty input and another for a record missing service. Avoid inspecting exact decoder wording; assert your own line-number context and whether an error exists.

### From a function to a command

A command can now open the file, call ReadRecords, decide whether to print the result, and choose an exit code. Keep normal output on stdout and diagnostics on stderr. A pipeline can then consume the output without accidentally parsing an error message as data.

`os.Exit` stops the process without running deferred functions. Use it at the outermost edge, after a helper returns its status and has performed cleanup. We will use that pattern in the final exercise.

Reference: [bufio.Scanner](https://pkg.go.dev/bufio#Scanner).
