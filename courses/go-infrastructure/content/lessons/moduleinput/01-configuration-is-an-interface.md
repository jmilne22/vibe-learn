## Configuration is an interface

A user runs your tool with this file:

```json
{"targets":["http://localhost:8080/ready"],"workers":2}
```

Before implementing a parser, decide what the file means. Can targets be empty? Does workers=0 mean unlimited, default, or invalid? What happens if someone writes `worker` instead of `workers`?

For this course, targets must be nonempty and workers must be 1–16. Unknown fields are errors.

### Translate the input into a type

```go
type Config struct {
    Targets []string `json:"targets"`
    Workers int      `json:"workers"`
}
```

The field names are exported so `encoding/json` can populate them. The tags specify the JSON names. They are metadata on the fields, not validation rules. A field absent from JSON keeps its zero value: nil for the slice, zero for the integer. Here those values are invalid, so ordinary validation catches both missing and explicitly empty values. If those cases needed different meanings, we would need another representation, such as a pointer or a custom decoding step.

### Accept a reader, not a filename

```go
func ReadConfig(r io.Reader) (Config, error)
```

`io.Reader` is an interface: a type that has a `Read` method of the required form can supply bytes. An open file and `strings.NewReader(text)` both work. That means the parser can be tested with a short string while file opening remains the caller's responsibility.

```go
file, err := os.Open("config.json")
if err != nil {
    return err
}
defer file.Close()
config, err := ReadConfig(file)
```

The caller that opens the file closes it. ReadConfig reads the stream; it does not take ownership of the file descriptor.

### Decode, then validate

```go
var config Config
decoder := json.NewDecoder(r)
decoder.DisallowUnknownFields()
if err := decoder.Decode(&config); err != nil {
    return Config{}, fmt.Errorf("decode config: %w", err)
}
```

`&config` passes its address so the decoder can fill the original variable. `%w` wraps an error while preserving its identity for `errors.Is` and `errors.As`. Add context that tells a caller which operation failed; do not replace the original cause with “something went wrong.”

Decode reads one JSON value. The stream may contain more. Decode once more into a disposable value and require `io.EOF`. Trailing whitespace is fine; another value is not.

Validate the meaning after decoding. `url.Parse` parses URL syntax, but a syntactically valid relative URL is not a valid HTTP target for this tool. Check the scheme and hostname separately. Reject credentials in the URL: they are easy to leak into reports. This still does not make arbitrary URLs safe to accept from untrusted remote users.

**Exercise: Read and validate configuration.** Implement the parsing and validation without opening a real file or making network calls. Start with one valid JSON string, then add missing values, a typo, and a second object.

### Design question: why not default everything?

<details><summary>One reasonable answer</summary>

Defaults are helpful for optional settings. They are dangerous when a typo silently changes the requested behavior. Here, rejecting `worker` makes the mistake visible. Choosing a default worker count would also be reasonable if it were explicit and an unknown field still failed.

</details>

References: [encoding/json.Decoder](https://pkg.go.dev/encoding/json#Decoder), [io.Reader](https://pkg.go.dev/io#Reader), [net/url](https://pkg.go.dev/net/url).
