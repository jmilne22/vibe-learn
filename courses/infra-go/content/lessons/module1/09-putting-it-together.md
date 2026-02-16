## Putting It Together

Time to combine everything. Given a text file where each line is `name:score`, we'll parse lines, group scores by name, and produce a sorted summary. This is the **parse → accumulate → sort → format** pattern — the same shape you'll use for any "group data and report" task.

**Step 1: Parse one line.** Split on `:` to get the name and numeric value.

```go
line := "alice:95"
parts := strings.SplitN(line, ":", 2)
name := parts[0]                        // "alice"
score, err := strconv.Atoi(parts[1])    // 95
```

**Step 2: Accumulate totals.** Loop through lines, parse each one, sum scores by name.

```go
totals := make(map[string]int)

for _, line := range lines {
    parts := strings.SplitN(line, ":", 2)
    if len(parts) != 2 {
        continue  // skip malformed lines
    }
    score, err := strconv.Atoi(strings.TrimSpace(parts[1]))
    if err != nil {
        continue  // skip lines with bad numbers
    }
    totals[parts[0]] += score
}
```

**Step 3: Sorted output.** Maps iterate in random order, so collect keys, sort, and format.

```go
names := make([]string, 0, len(totals))
for name := range totals {
    names = append(names, name)
}
sort.Strings(names)

results := make([]string, len(names))
for i, name := range names {
    results[i] = fmt.Sprintf("%-20s %d", name, totals[name])
}
return results
```

**All together:**

```go
func scoreReport(lines []string) []string {
    totals := make(map[string]int)

    for _, line := range lines {
        parts := strings.SplitN(line, ":", 2)
        if len(parts) != 2 {
            continue
        }
        score, err := strconv.Atoi(strings.TrimSpace(parts[1]))
        if err != nil {
            continue
        }
        totals[parts[0]] += score
    }

    names := make([]string, 0, len(totals))
    for name := range totals {
        names = append(names, name)
    }
    sort.Strings(names)

    results := make([]string, len(names))
    for i, name := range names {
        results[i] = fmt.Sprintf("%-20s %d", name, totals[name])
    }
    return results
}
```

This function uses every pattern from the module: string splitting, `continue` for skipping bad lines, maps for accumulating, the sorted-keys pattern, and formatted output. In practice, the input could be log entries, config lines, or CSV rows — the shape stays the same.

> **What's missing?** You might notice we sorted alphabetically, not by score descending. Sorting by value (to get "top N") requires bundling each key-value pair into a sortable unit — and that's exactly what structs unlock in Module 2. Once you learn structs, you'll upgrade this pattern to **accumulate → struct → sort → truncate → format**.

<div class="inline-exercises" data-concept="Combining Patterns"></div>

---
