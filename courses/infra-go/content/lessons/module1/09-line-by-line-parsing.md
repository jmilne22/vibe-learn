## Line-by-Line Parsing

Line-oriented parsing shows up in config files, logs, command output, and simple text formats. The usual loop is stable: split into lines, trim whitespace, skip blanks and comments, then parse the remaining records.

For a `.env`-style file, the input has blank lines, comments starting with `#`, and key-value pairs like `DB_HOST=localhost`. Some values are quoted, some are not.

<attempt type="pretest">

<predict prompt="Which lines end up in the map?">
```go
content := "# db config\nHOST=localhost\n\nbroken line\nPORT=5432"
fmt.Println(parseEnv(content))
```
```
map[HOST:localhost PORT:5432]
```
</predict>

Commit first: what happens to the comment, the blank, and the malformed line?

</attempt>

Use the same pattern for `.env` files, INI configs, CSVs, and other line-oriented formats:

<attempt type="worked">

```go
// Split into lines, skip blanks and comments, parse each line
func parseEnv(content string) map[string]string {
    result := make(map[string]string)
    lines := strings.Split(content, "\n")

    for _, line := range lines {
        line = strings.TrimSpace(line)

        // Skip empty lines and comments
        if line == "" || strings.HasPrefix(line, "#") {
            continue
        }

        // Split key=value on first =
        parts := strings.SplitN(line, "=", 2)
        if len(parts) != 2 {
            continue  // skip malformed lines
        }

        key := strings.TrimSpace(parts[0])
        val := strings.TrimSpace(parts[1])
        val = strings.Trim(val, "\"")  // strip optional quotes

        result[key] = val
    }
    return result
}
```

Split lines, trim, skip empties and comments, parse what's left. You'll recognize this skeleton in half the infrastructure tools you read on GitHub.

</attempt>

### State Tracking

When a format has sections (like INI files), track the "current section" as you parse:

```go
func parseINI(content string) map[string]map[string]string {
    result := make(map[string]map[string]string)
    currentSection := "default"

    for _, line := range strings.Split(content, "\n") {
        line = strings.TrimSpace(line)
        if line == "" || strings.HasPrefix(line, "#") {
            continue
        }

        // Section header: [section_name]
        if strings.HasPrefix(line, "[") && strings.HasSuffix(line, "]") {
            currentSection = line[1 : len(line)-1]
            continue
        }

        // Key=value pair under the current section
        parts := strings.SplitN(line, "=", 2)
        if len(parts) != 2 {
            continue
        }
        key := strings.TrimSpace(parts[0])
        val := strings.TrimSpace(parts[1])

        // Lazy-initialize the inner map
        if result[currentSection] == nil {
            result[currentSection] = make(map[string]string)
        }
        result[currentSection][key] = val
    }
    return result
}
```

This is a simple **state machine**: the variable `currentSection` changes as you encounter `[section]` headers, and all key-value pairs go into whatever section is current. Same pattern works for parsing Dockerfiles (current stage), multi-doc YAML (current document), etc.

<attempt type="gaps">

<gaps prompt="The line-parsing skeleton, from memory — trim, skip, split, guard.">
```go
for _, line := range strings.Split(content, "\n") {
    line = «strings.TrimSpace(line)»
    if line == "" || strings.«HasPrefix»(line, "#") {
        «continue»
    }
    parts := strings.SplitN(line, "=", «2»)
    if len(parts) != 2 {
        continue
    }
    result[strings.TrimSpace(parts[0])] = strings.TrimSpace(parts[1])
}
```
</gaps>

</attempt>

<attempt type="scratch">

<div class="inline-exercises" data-concept="Line Parsing"></div>

</attempt>
