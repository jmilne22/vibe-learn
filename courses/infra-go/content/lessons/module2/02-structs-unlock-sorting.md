## Structs Unlock Sorting

In Module 1, you learned the **count → sort-keys → format** pattern: count with a map, sort the keys alphabetically, and format. That's powerful, but it has a limitation — you can only sort by key, not by value. If you want "top 5 endpoints by request count," alphabetical order is useless.

The fix: bundle each key-value pair into a struct, put the structs in a slice, and sort with `sort.Slice` using any field you want.

### The Upgrade: Count → Struct → Sort → Format

```go
// Module 1 version: sorted alphabetically (keys only)
keys := make([]string, 0, len(counts))
for k := range counts {
    keys = append(keys, k)
}
sort.Strings(keys)

// Module 2 upgrade: sorted by count descending
type entry struct {
    label string
    count int
}
entries := make([]entry, 0, len(counts))
for k, v := range counts {
    entries = append(entries, entry{k, v})
}
sort.Slice(entries, func(i, j int) bool {
    return entries[i].count > entries[j].count
})
```

The struct lets `sort.Slice` compare by `.count` while keeping `.label` attached. Without the struct, the key and value drift apart when you sort.

### Zipping Parallel Slices

Same idea applies when you have parallel slices — names and values that go together by index. Zip them into structs so they stay paired:

```go
names    := []string{"web-1", "api-1", "db-1", "cache-1"}
memoryMB := []int{512, 256, 2048, 1024}

type pod struct {
    name string
    mem  int
}
pods := make([]pod, len(names))
for i := range names {
    pods[i] = pod{names[i], memoryMB[i]}
}

// Now sort by memory descending — names stay attached
sort.Slice(pods, func(i, j int) bool {
    return pods[i].mem > pods[j].mem
})

// Top 3 by memory:
for _, p := range pods[:3] {
    fmt.Printf("%-10s %dMB\n", p.name, p.mem)
}
```

Without the struct, sorting `memoryMB` would rearrange the values but leave `names` untouched — the pairing breaks. This is exactly the "draw the rest of the owl" problem from Module 1's sorting section, and now you have the tool to solve it.

---
