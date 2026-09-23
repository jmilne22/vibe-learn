## Build an endpoint report from a brief

Build a CLI that reads a list of endpoints and reports their HTTP status. Use the requirements below to choose your functions and tests.

Open **Build an endpoint reporting CLI** in Exercises. Its starter includes a main function and a Run entry point so tests can invoke the command without launching another process. You can reuse code from the earlier exercises.

### Input and output

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

### Start with one endpoint

Read one target, make one request, and write one result. Test it using httptest. Then add invalid configuration and exit-code cases. Introduce concurrency after this sequential behavior works.

### Add a test the supplied suite does not give you

Use duplicate targets and check that they produce duplicate observations rather than being deduplicated. Each entry in the configuration requires its own observation.

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
