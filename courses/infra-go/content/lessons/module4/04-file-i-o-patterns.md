## File I/O Patterns

### Read Entire File

```go
// Simple: read whole file into memory
data, err := os.ReadFile("config.yaml")
if err != nil {
    return fmt.Errorf("reading file: %w", err)
}
```

### Line-by-Line (For Large Files)

```go
file, err := os.Open("access.log")
if err != nil {
    return fmt.Errorf("opening log: %w", err)
}
defer file.Close()

scanner := bufio.NewScanner(file)
for scanner.Scan() {
    line := scanner.Text()
    // process line
}
if err := scanner.Err(); err != nil {
    return fmt.Errorf("reading log: %w", err)
}
```

### Walking Directories

```go
// Find all YAML files in a directory tree
err := filepath.WalkDir("./manifests", func(path string, d fs.DirEntry, err error) error {
    if err != nil {
        return err
    }
    if d.IsDir() {
        return nil
    }
    if filepath.Ext(path) == ".yaml" || filepath.Ext(path) == ".yml" {
        fmt.Println(path)
    }
    return nil
})
```

### Reading from stdin

For piping: `cat config.yaml | mytool lint -`

```go
import "io"

var input io.Reader
if filename == "-" {
    input = os.Stdin
} else {
    f, err := os.Open(filename)
    if err != nil {
        return err
    }
    defer f.Close()
    input = f
}

data, err := io.ReadAll(input)
```

<div class="inline-exercises" data-concept="File I/O"></div>
