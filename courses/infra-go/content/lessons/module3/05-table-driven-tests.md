## Table-Driven Tests

The Go testing idiom. Instead of writing separate functions for each case, define a table:

```go
func TestParsePort(t *testing.T) {
    tests := []struct {
        name    string
        input   string
        want    int
        wantErr bool
    }{
        {name: "valid port", input: "8080", want: 8080},
        {name: "port 1", input: "1", want: 1},
        {name: "port 65535", input: "65535", want: 65535},
        {name: "zero", input: "0", wantErr: true},
        {name: "negative", input: "-1", wantErr: true},
        {name: "too high", input: "70000", wantErr: true},
        {name: "not a number", input: "abc", wantErr: true},
        {name: "empty string", input: "", wantErr: true},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            got, err := ParsePort(tt.input)
            if tt.wantErr {
                if err == nil {
                    t.Errorf("expected error, got nil")
                }
                return
            }
            if err != nil {
                t.Fatalf("unexpected error: %v", err)
            }
            if got != tt.want {
                t.Errorf("got %d, want %d", got, tt.want)
            }
        })
    }
}
```

**Why this pattern is powerful:**
- Adding a test case is one line
- Each case runs as a subtest (`t.Run`) — failures show which case failed
- Easy to test error cases alongside happy paths
- `go test -run TestParsePort/zero` runs just one case

*Python comparison*

```python
# Python: @pytest.mark.parametrize("input,expected", [...])
# Go: same idea, but it's just a struct slice + loop. No framework needed.
```
