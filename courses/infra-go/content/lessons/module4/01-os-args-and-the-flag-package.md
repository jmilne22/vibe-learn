## os.Args & the Flag Package

### Raw Arguments

```go
// os.Args[0] is the program name, rest are arguments
fmt.Println(os.Args[0])  // "./mytool"
fmt.Println(os.Args[1:]) // ["--config", "/etc/app.yaml"]
```

Fine for throwaway scripts. Not fine for real tools.

### The flag Package

Standard library, no dependencies:

```go
import "flag"

func main() {
    config := flag.String("config", "config.yaml", "path to config file")
    verbose := flag.Bool("verbose", false, "enable verbose output")
    port := flag.Int("port", 8080, "server port")
    flag.Parse()

    fmt.Printf("config=%s verbose=%t port=%d\n", *config, *verbose, *port)
    // Remaining positional args
    fmt.Println("files:", flag.Args())
}
```

```bash
./mytool --config /etc/app.yaml --verbose --port 9090 file1.yaml file2.yaml
```

**When flag is enough:** Single-command tools with a few options. `go test` itself uses the flag package.

**When you need more:** Subcommands (`mytool lint`, `mytool validate`), nested flags, shell completion. That's Cobra.
