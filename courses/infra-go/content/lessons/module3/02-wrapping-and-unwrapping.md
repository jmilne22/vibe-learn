## Wrapping & Unwrapping

Raw errors lose context as they bubble up. Wrapping adds context at each layer.

<attempt type="pretest">

<predict prompt="What does this print?">
```go
wrapped := fmt.Errorf("loading config: %w", os.ErrNotExist)
fmt.Println(errors.Is(wrapped, os.ErrNotExist))
fmt.Println(wrapped == os.ErrNotExist)
```
```
true
false
```
</predict>

Commit to both lines — the difference between them is this entire section.

</attempt>

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

<attempt type="worked">

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

</attempt>

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

<attempt type="gaps">

<gaps prompt="Add context on the way up; branch on the root cause at the top.">
```go
func loadConfig(path string) (Config, error) {
    data, err := os.ReadFile(path)
    if err != nil {
        return Config{}, fmt.Errorf("loading config %s: «%w»", path, err)
    }
    // ...
}

// Caller: check the whole chain, not the surface
if «errors.Is»(err, os.ErrNotExist) {
    fmt.Println("file doesn't exist, creating default config")
}

// Caller needs the fields, not just identity:
var pathErr *os.PathError
if «errors.As»(err, «&pathErr») {
    fmt.Println("path:", pathErr.Path)
}
```
</gaps>

</attempt>

<attempt type="scratch">

<div class="inline-exercises" data-concept="Wrapping"></div>
<div class="inline-exercises" data-concept="Inspecting Errors"></div>

</attempt>
