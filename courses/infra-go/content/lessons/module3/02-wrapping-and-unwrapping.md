## Wrapping & Unwrapping

Raw errors lose context as they bubble up. Wrapping adds context at each layer.

### fmt.Errorf with %w

```go
func loadConfig(path string) (Config, error) {
    data, err := os.ReadFile(path)
    if err != nil {
        return Config{}, fmt.Errorf("loading config %s: %w", path, err)
    }

    var cfg Config
    if err := yaml.Unmarshal(data, &cfg); err != nil {
        return Config{}, fmt.Errorf("parsing config %s: %w", path, err)
    }

    return cfg, nil
}
```

The `%w` verb wraps the original error inside the new one. The resulting error message reads like a call stack: `"loading config /etc/app.yaml: open /etc/app.yaml: no such file or directory"`.

### errors.Is — Checking for Specific Errors

```go
import "errors"

// Check if an error (or any wrapped error in the chain) matches
if errors.Is(err, os.ErrNotExist) {
    fmt.Println("file doesn't exist, creating default config")
}

// Works through wrapping:
wrapped := fmt.Errorf("loading config: %w", os.ErrNotExist)
errors.Is(wrapped, os.ErrNotExist) // true — unwraps and checks
```

**Don't use `==` for error comparison.** It doesn't check wrapped errors:

```go
// Wrong — misses wrapped errors
if err == os.ErrNotExist { ... }

// Right — checks the entire chain
if errors.Is(err, os.ErrNotExist) { ... }
```

### errors.As — Extracting Typed Errors

When you need the concrete error type (not just "is it this error?"):

```go
var pathErr *os.PathError
if errors.As(err, &pathErr) {
    fmt.Println("operation:", pathErr.Op)
    fmt.Println("path:", pathErr.Path)
}
```

`errors.As` unwraps the chain looking for an error that can be assigned to your target variable. Use this when you need fields from the error, not just identity.

<div class="inline-exercises" data-concept="Wrapping"></div>
