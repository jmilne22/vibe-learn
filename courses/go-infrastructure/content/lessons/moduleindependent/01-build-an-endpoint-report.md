## Build an endpoint report from a brief

This is the point where the course stops supplying the next function to write. You have a config file, a reporting contract, and visible checks. Decide the structure yourself.

Open **Build an endpoint reporting CLI** in Exercises. Its starter includes a main function and a Run entry point so tests can invoke the command without launching another process. All other helpers are yours. You may reuse your earlier code; you do not need to retype a configuration parser to prove you remember it.

### The useful result

Given:

```json
{
  "targets": ["http://localhost:8080/ready", "http://localhost:8080/missing"],
  "workers": 2,
  "timeout_ms": 1000
}
```

The tool makes one GET per entry and produces a JSON array in the same order. An illustrative response is:

```json
[
  {"target":"http://localhost:8080/ready","status":200},
  {"target":"http://localhost:8080/missing","status":404}
]
```

The exit code is 1 because not every endpoint returned 2xx. A transport failure has status 0 and an error string. A received 404 has a real status and does not need an invented transport error. Error wording depends on the OS and transport, so do not compare whole network-error strings in tests.

The full validation, cancellation, redirect, concurrency, and exit-code rules are in the exercise brief. Keep that brief open as the specification. Do not add continuous polling, retries, authentication, a UI, or a configuration framework.

### Choose your first vertical slice

A useful first slice is: read one target, make one request, write one result. Test it using httptest. Then add invalid configuration and exit-code cases. Introduce concurrency after this sequential behavior works.

This order lets each step produce a working command. It is easier to debug than creating every package and abstraction first, with nothing runnable until the end.

You can organize everything in one source file initially. Split it when two responsibilities become hard to read together, not because a template says every program needs a services directory.

### Add a test the supplied suite does not give you

Use duplicate targets and check that they produce duplicate observations rather than being deduplicated. Earlier we wrote a deduplication function; that does not mean every later program should use it. Requirements decide.

For the concurrency bound, use a local handler with an active-request counter protected by a mutex or atomics. Hold requests behind a channel so you can observe multiple in flight. Release the channel and wait for all results. Do not infer concurrency from a stopwatch: a busy machine makes wall-clock comparisons unreliable.

### Run it as a command

From the exercise folder, create config.json pointing at a service you control, then:

```sh
go test ./...
go build -o endpoint-report .
./endpoint-report -config config.json
printf 'exit=%s\n' "$?"
```

Use the built binary when checking exact exit codes. `go run` wraps the program and reports a child failure; its own exit behavior is not the same interface. On Windows, build an `.exe` and inspect the shell's native exit-code variable, or use the Bash-based Linux lab environment.

Solutions are available immediately. If you get stuck, compare the smallest missing decision first: the function signature, validation rule, worker lifecycle, or output error. You do not have to abandon your entire implementation to learn from another one.
