## Start with one decision

You have a list of services and want to check their HTTP endpoints. Before thinking about workers, dashboards, or Kubernetes, you need to decide whether a configured port is valid. That is small enough to finish and test.

This course is for someone who has operated infrastructure but does not yet feel comfortable writing a program from a blank file. The suggested core is about 30 hours, including exercises and labs. It is an estimate, not a deadline. If a topic is familiar, use its exercise to decide whether to move on. Nothing is locked.

The examples are constructed teaching scenarios. They are not accounts of Groundcover incidents or predictions of its interviews. The [role description](https://www.comeet.com/jobs/groundcover/88.008/infra-engineer/AB.A47) informs the subject choices: infrastructure tooling, Kubernetes, Terraform, and telemetry delivery. We will use Go throughout.

### Write down a boundary before writing code

Suppose a configuration contains a port. Our rule is **1 through 65535, inclusive**. Port zero has uses in other APIs, but this configuration does not allow it. That is a product decision, not a universal rule about networking.

The input is an integer. The answer is yes or no. There is no reason for this function to read a file, print a message, or exit the process.

```go
func ValidPort(port int) bool {
    return port >= 1 && port <= 65535
}
```

Read the declaration left to right: `func` introduces a function; `ValidPort` is its name; `port int` declares one integer argument; `bool` is the result type. `return` sends the expression's value back to the caller. `&&` requires both comparisons to be true.

Before typing that expression, write a few examples:

| Input | Answer | Why it matters |
|---|---|---|
| 443 | true | An ordinary configured port |
| 0 | false | Just below the valid interval |
| 1 | true | The first valid value |
| 65535 | true | The last valid value |
| 65536 | false | Just above the interval |

The middle case alone cannot tell you whether your boundaries are right. These examples become your tests.

### Make the smallest program that can run

Use **Prepare exercise** on “Validate a port” in the course's Exercises view. It creates a normal folder containing a Go module, starter source, and visible tests. Open that folder in your editor. Run checks in the app explicitly, or run this from the folder with your host Go toolchain:

```sh
go test ./...
```

A Go module is a group of packages described by `go.mod`. These exercises use Go 1.26 and no third-party modules. `package exercise` groups the source and tests into one package. Exported names begin with a capital letter. A program you can launch has a `main` package and a `main` function; a small tested function does not need either.

The starter intentionally has two boundary mistakes. Read the reported input and expected result, then fix the comparison. A compiler error means Go could not build your code. A failing test means the program built but disagreed with a checked expectation. Those are different starting points for debugging.

### Write one test yourself

Create `learner_test.go` next to the starter:

```go
package exercise

import "testing"

func TestNegativePort(t *testing.T) {
    if ValidPort(-8080) {
        t.Fatal("a negative port was accepted")
    }
}
```

The filename ends in `_test.go`; the function begins with `Test`; `*testing.T` gives the test a way to report a failure. `if` executes its block only when the condition is true. There are no parentheses around the condition. Braces are required.

This test is intentionally simple. You can see the input, the call, and the expected outcome in one place. Do not start by building a testing framework.

### When the file still feels blank

Write these three comments before implementation:

```go
// Input: one integer port.
// Output: whether it is in 1..65535.
// Examples: 0 -> false, 1 -> true, 65535 -> true.
```

Then write the function declaration and a single test. If you cannot fill those comments in, the missing piece is probably the requirement, not Go syntax. Ask what should happen at a concrete boundary.

You may use AI to explain a compiler error or suggest another edge case. Ask it to work from your contract and one failing example. A complete generated answer is also available in Solutions; reading it is useful, but copying it does not practise choosing your first step.

Reference: [Go's introduction to tests](https://go.dev/doc/tutorial/add-a-test).
