## Putting It Together

Module 3 has six concepts in service of one goal: **make the failure paths in your code as obvious and testable as the happy ones**. This capstone wires all of them together on a config parser — the kind of code you'll write a dozen times in the rest of the course.

The function under test:

```go
type Config struct {
    Name     string
    Replicas int
}

var (
    ErrEmpty   = errors.New("config is empty")
    ErrMissing = errors.New("missing required field")
)

type ParseError struct {
    Line int
    Msg  string
}

func (e *ParseError) Error() string {
    return fmt.Sprintf("line %d: %s", e.Line, e.Msg)
}

func ParseConfig(r io.Reader) (Config, error) {
    data, err := io.ReadAll(r)
    if err != nil {
        return Config{}, fmt.Errorf("reading config: %w", err)
    }
    if len(bytes.TrimSpace(data)) == 0 {
        return Config{}, ErrEmpty
    }

    var cfg Config
    seen := map[string]bool{}
    for i, raw := range strings.Split(string(data), "\n") {
        line := strings.TrimSpace(raw)
        if line == "" || strings.HasPrefix(line, "#") {
            continue
        }
        parts := strings.SplitN(line, "=", 2)
        if len(parts) != 2 {
            return Config{}, &ParseError{Line: i + 1, Msg: "missing '='"}
        }
        key := strings.TrimSpace(parts[0])
        val := strings.TrimSpace(parts[1])
        seen[key] = true
        switch key {
        case "name":
            cfg.Name = val
        case "replicas":
            n, err := strconv.Atoi(val)
            if err != nil {
                return Config{}, &ParseError{Line: i + 1, Msg: fmt.Sprintf("replicas not an int: %v", err)}
            }
            cfg.Replicas = n
        }
    }
    if !seen["name"] {
        return Config{}, fmt.Errorf("%w: name", ErrMissing)
    }
    return cfg, nil
}
```

Notice every Module 3 idea fires here: errors-as-values for the return signature, sentinel errors (`ErrEmpty`, `ErrMissing`) for conditions callers might branch on, custom `*ParseError` for structured data, `%w` to wrap so `errors.Is(err, ErrMissing)` works through the wrap, and `io.Reader` so the function takes anything.

### The Test

One table covers every failure mode plus the happy path. `t.Helper` keeps the assertion lines clean. Note how each test case asserts on the *kind* of error, not the message — sentinel via `errors.Is`, custom type via `errors.As`, prefix match for parse errors.

```go
func TestParseConfig(t *testing.T) {
    tests := []struct {
        name     string
        input    string
        wantCfg  Config
        wantErr  error  // sentinel or nil
        wantType bool   // expect *ParseError
        wantLine int
    }{
        {
            name:    "valid",
            input:   "name=web\nreplicas=3\n",
            wantCfg: Config{Name: "web", Replicas: 3},
        },
        {
            name:    "empty",
            input:   "   \n",
            wantErr: ErrEmpty,
        },
        {
            name:    "missing name",
            input:   "replicas=3\n",
            wantErr: ErrMissing,
        },
        {
            name:     "malformed line",
            input:    "name=web\nbroken-line\n",
            wantType: true,
            wantLine: 2,
        },
        {
            name:     "non-int replicas",
            input:    "name=web\nreplicas=abc\n",
            wantType: true,
            wantLine: 2,
        },
        {
            name:    "comments and blanks ignored",
            input:   "# header\n\nname=web\n",
            wantCfg: Config{Name: "web"},
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            cfg, err := ParseConfig(strings.NewReader(tt.input))

            if tt.wantErr != nil {
                assertIs(t, err, tt.wantErr)
                return
            }
            if tt.wantType {
                assertParseError(t, err, tt.wantLine)
                return
            }
            if err != nil {
                t.Fatalf("unexpected error: %v", err)
            }
            if cfg != tt.wantCfg {
                t.Errorf("got %+v, want %+v", cfg, tt.wantCfg)
            }
        })
    }
}

func assertIs(t *testing.T, got, want error) {
    t.Helper()
    if !errors.Is(got, want) {
        t.Fatalf("got %v, want errors.Is == %v", got, want)
    }
}

func assertParseError(t *testing.T, err error, wantLine int) {
    t.Helper()
    var pe *ParseError
    if !errors.As(err, &pe) {
        t.Fatalf("got %v (%T), want *ParseError", err, err)
    }
    if pe.Line != wantLine {
        t.Errorf("ParseError.Line = %d, want %d", pe.Line, wantLine)
    }
}
```

`strings.NewReader` is the test-flavor `io.Reader` — no temp files. The two helpers earn their keep because every case uses one of them. Without `t.Helper`, every failure would point at the helper's line; with it, failures point at the test row.

### What you used

- **Errors as values** (§01) — every failure path returns an `error`
- **Wrapping** (§02) — `%w` on the missing-field error so the sentinel survives wrapping
- **Inspecting** (§02) — `errors.Is` and `errors.As` in the helpers
- **Sentinel errors** (§03) — `ErrEmpty`, `ErrMissing` for distinguishable conditions
- **Custom error type** (§03) — `*ParseError` carries structured line info
- **No panic** (§04) — even a malformed config returns an error; nothing about this is panic-worthy
- **Subtest table** (§06) — one row per case, distinct failure messages
- **Test helpers** (§07) — `t.Helper` so failures point at the test, not the helper

If you want to push further: add a property test that random-generates configs and round-trips them through `ParseConfig` + a writer. The pattern still holds — table-driven, real `io.Reader`, error-kind assertions. The skeleton you built here will reappear in every Module 4-7 project, just with HTTP responses or YAML structs instead of `key=value` lines.

---
