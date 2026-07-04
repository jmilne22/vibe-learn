## Sorting & Filtering

> *"The bigger the interface, the weaker the abstraction."* — Rob Pike

*"Top 5 noisiest pods by error count, ties broken by namespace then name" is one `sort.Slice` call with a chained comparator. Multi-key sort + truncate is the report-shape you'll write a hundred times.*

<attempt type="pretest">

<predict prompt="Ascending or descending — what does this print?">
```go
lat := []int{120, 45, 300}
sort.Slice(lat, func(i, j int) bool {
    return lat[i] > lat[j]
})
fmt.Println(lat)
```
```
[300 120 45]
```
</predict>

Commit first: which way does `>` sort?

</attempt>

### sort.Slice

<attempt type="worked">

```go
import "sort"

// Sort strings alphabetically
sort.Strings(names)  // sorts in place, modifies the original slice

// Sort with custom comparator — shortest name first
sort.Slice(names, func(i, j int) bool {
    return len(names[i]) < len(names[j])
})

// Sort numbers descending
sort.Slice(latencies, func(i, j int) bool {
    return latencies[i] > latencies[j]
})
```

The comparator returns `true` if element `i` should come before element `j`. That's it.

*Python comparison*

```python
# Python: names.sort(key=len)
# Go: sort.Slice(names, func(i, j int) bool { return len(names[i]) < len(names[j]) })
# More verbose, but explicit about the comparison being made.
```

### Top N Pattern

A very common pattern: "give me the top 5 latencies."

```go
sort.Slice(latencies, func(i, j int) bool {
    return latencies[i] > latencies[j]  // descending
})
if len(latencies) > 5 {
    latencies = latencies[:5]  // keep top 5
}
```

Sort descending, then truncate. Three lines. You'll use this shape whenever you need "the top N of anything."

</attempt>

<attempt type="gaps">

<gaps prompt="Top 3 noisiest pods by error count — comparator, then truncate.">
```go
sort.Slice(errCounts, func(i, j int) bool {
    return errCounts[i] «>» errCounts[j]   // noisiest first
})
if len(errCounts) > «3» {
    errCounts = «errCounts[:3]»
}
```
</gaps>

</attempt>

### Multi-Key Sort

Real reports often sort by multiple fields: namespace, then error count, then name. That gets much cleaner once you have structs, so this course saves the full multi-key version for Module 2. In Module 1, drill the comparator shape on primitive slices first.

### Stable Sort

`sort.Slice` does not promise to preserve the relative order of "equal" elements. Most of the time that does not matter. When it does, use `sort.SliceStable`:

```go
names := []string{"api-2", "db-1", "api-1"}
sort.SliceStable(names, func(i, j int) bool {
    return names[i][:3] < names[j][:3] // group by prefix
})
```

Do not over-index on stable sort yet. For this module, `sort.Strings` and `sort.Slice` are the cold-recall targets.

<attempt type="scratch">

<div class="inline-exercises" data-concept="Sorting & Filtering"></div>

</attempt>
