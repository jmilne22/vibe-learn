## Writing Your First Tests

### Test File Convention

Tests live next to the code they test, in files ending with `_test.go`:

```
config/
├── config.go       # your code
├── config_test.go  # tests for config.go
```

### Basic Test

```go
// config_test.go
package config

import "testing"

func TestParsePort(t *testing.T) {
    port, err := ParsePort("8080")
    if err != nil {
        t.Fatalf("unexpected error: %v", err)
    }
    if port != 8080 {
        t.Errorf("got %d, want 8080", port)
    }
}

func TestParsePort_Invalid(t *testing.T) {
    _, err := ParsePort("not-a-number")
    if err == nil {
        t.Fatal("expected error for invalid port, got nil")
    }
}
```

### t.Error vs t.Fatal

| Method | Behavior |
|--------|----------|
| `t.Error(args...)` | Log failure, **continue** running this test |
| `t.Errorf(format, args...)` | Same, with formatting |
| `t.Fatal(args...)` | Log failure, **stop** this test immediately |
| `t.Fatalf(format, args...)` | Same, with formatting |

**Rule:** Use `t.Fatal` when continuing would panic or be meaningless (e.g., a nil pointer). Use `t.Error` when you want to collect multiple failures.

### Running Tests

```bash
go test ./...              # all tests, all packages
go test -v ./...           # verbose — see each test name
go test -run TestParsePort # run tests matching a pattern
go test -count=1 ./...     # bypass test cache
go test -race ./...        # detect data races
```

<div class="inline-exercises" data-concept="Writing Tests"></div>
<div class="inline-exercises" data-concept="Table-Driven Tests"></div>
