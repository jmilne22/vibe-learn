## Testing Infra Code

### Testing Validators

```go
func TestValidatePod(t *testing.T) {
    tests := []struct {
        name    string
        pod     Pod
        wantErr string  // empty means no error expected
    }{
        {
            name: "valid pod",
            pod:  Pod{Name: "web-1", Namespace: "prod", MemoryMB: 512},
        },
        {
            name:    "empty name",
            pod:     Pod{Namespace: "prod", MemoryMB: 512},
            wantErr: "name is required",
        },
        {
            name:    "negative memory",
            pod:     Pod{Name: "web-1", Namespace: "prod", MemoryMB: -1},
            wantErr: "memory must be positive",
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            err := tt.pod.Validate()
            if tt.wantErr == "" {
                if err != nil {
                    t.Fatalf("unexpected error: %v", err)
                }
                return
            }
            if err == nil {
                t.Fatal("expected error, got nil")
            }
            if !strings.Contains(err.Error(), tt.wantErr) {
                t.Errorf("error %q should contain %q", err.Error(), tt.wantErr)
            }
        })
    }
}
```

### Test Helpers

When you repeat the same assertion in many tests, extract a helper:

```go
func assertEqual(t *testing.T, got, want string) {
    t.Helper()  // marks this as a helper — errors report the CALLER's line number
    if got != want {
        t.Errorf("got %q, want %q", got, want)
    }
}
```

`t.Helper()` is critical. Without it, test failures point to the helper function, not the test that called it.

### Testing Error Types

```go
func TestFindPod_NotFound(t *testing.T) {
    _, err := findPod("nonexistent")

    // Check sentinel error
    if !errors.Is(err, ErrNotFound) {
        t.Errorf("expected ErrNotFound, got %v", err)
    }
}

func TestValidateConfig_ErrorType(t *testing.T) {
    err := validateConfig(badConfig)

    // Check custom error type
    var valErr *ValidationError
    if !errors.As(err, &valErr) {
        t.Fatalf("expected ValidationError, got %T", err)
    }
    if valErr.Field != "port" {
        t.Errorf("expected field 'port', got %q", valErr.Field)
    }
}
```

---

<div class="inline-exercises" data-concept="Testing Infra Code"></div>
