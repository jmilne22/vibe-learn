## String Parsing & Building

> *"A little copying is better than a little dependency."* — Go Proverb

Infrastructure is strings all the way down. Log lines, metric formats, config files, YAML keys.

### Splitting & Joining

```go
import "strings"

// Split a sentence on whitespace
line := "The quick brown fox jumps over the lazy dog"
words := strings.Fields(line)  // splits on any whitespace
// ["The", "quick", "brown", "fox", "jumps", "over", "the", "lazy", "dog"]

// Split on specific delimiter
csv := "Alice,Bob,Carol,Dave"
names := strings.Split(csv, ",")
// ["Alice", "Bob", "Carol", "Dave"]

// SplitN — limit the number of splits (useful when the value contains the delimiter)
entry := "name=Tom = Jerry"
parts := strings.SplitN(entry, "=", 2)  // split into at most 2 parts
// ["name", "Tom = Jerry"]
// Without the 2: Split would give ["name", "Tom ", " Jerry"]

// Join
joined := strings.Join(names, " | ")
// "Alice | Bob | Carol | Dave"
```

`strings.SplitN(s, sep, n)` splits into at most `n` pieces. Use `SplitN(s, "=", 2)` whenever the value side might contain the delimiter. A naive `Split` will break any value that contains extra `=` signs.

### Checking Content

```go
strings.Contains(s, "=")       // has "=" anywhere?
strings.HasPrefix(line, "#")   // starts with "#"?
strings.HasSuffix(path, ".yaml") // ends with ".yaml"?
```

These are your guards before parsing. Check what a string looks like before you try to split or slice it.

### Parsing Key-Value Pairs

You'll do this constantly — config files, labels, environment variables. The quickest way: `SplitN` with a limit of 2:

```go
// Parse "key=value" into key and value
setting := "color=dark blue"
parts := strings.SplitN(setting, "=", 2)
if len(parts) == 2 {
    fmt.Println(parts[0], parts[1])  // "color" "dark blue"
}
```

> **`strings.Index` vs `strings.SplitN`:** Both can split on the first occurrence. `SplitN(s, "=", 2)` gives you a `[]string` directly. `strings.Index` gives you the position so you can use slice expressions (`s[:i]`, `s[i+1:]`). Use whichever feels cleaner for the situation.

### Building Strings

```go
// fmt.Sprintf — your workhorse
msg := fmt.Sprintf("%s scored %d out of %d", "Alice", 87, 100)

// Collect-and-join pattern — build a slice of strings, then join
colors := map[string]string{"sky": "blue", "grass": "green", "sun": "yellow"}
parts := make([]string, 0, len(colors))
for k, v := range colors {
    parts = append(parts, fmt.Sprintf("%s is %s", k, v))
}
result := strings.Join(parts, ", ")
// result = "sky is blue, grass is green, sun is yellow" (order may vary)

// strings.Builder — for building in a loop (more efficient than += concatenation)
var b strings.Builder
for _, line := range lines {
    b.WriteString(line)
    b.WriteByte('\n')
}
result := b.String()
```

### Trimming

```go
s := strings.TrimSpace("  hello  ")      // "hello"
s := strings.Trim(s, "\"")               // remove surrounding quotes
s := strings.TrimPrefix(s, "https://")   // remove prefix if present
s := strings.TrimSuffix(s, ".yaml")      // remove suffix if present
```

<div class="inline-exercises" data-concept="String Parsing"></div>
