## Sorting & Filtering

> *"The bigger the interface, the weaker the abstraction."* — Rob Pike

*"Top 5 noisiest pods by error count, ties broken by namespace then name" is one `sort.Slice` call with a chained comparator. Multi-key sort + truncate is the report-shape you'll write a hundred times.*

### sort.Slice

```go
import "sort"

// Sort strings alphabetically
sort.Strings(names)  // sorts in place, modifies the original slice

// Sort with custom comparator — for any slice type
sort.Slice(students, func(i, j int) bool {
    return students[i].Name < students[j].Name
})

// Sort by score, descending
sort.Slice(students, func(i, j int) bool {
    return students[i].Score > students[j].Score
})
```

The comparator returns `true` if element `i` should come before element `j`. That's it.

*Python comparison*

```python
# Python: students.sort(key=lambda s: s.name)
# Go: sort.Slice(students, func(i, j int) bool { return students[i].Name < students[j].Name })
# More verbose, but explicit about the comparison.
```

### Top N Pattern

A very common pattern: "give me the top 5 students by score."

```go
sort.Slice(students, func(i, j int) bool {
    return students[i].Score > students[j].Score  // descending
})
if len(students) > 5 {
    students = students[:5]  // keep top 5
}
```

Sort descending, then truncate. Three lines. You'll use this shape whenever you need "the top N of anything."

### Multi-Key Sort

Real reports rarely sort by one field. "Top failing pods by namespace, then by failure count, then by name" needs three keys. The comparator just chains comparisons — the first one that says "different" wins:

```go
sort.Slice(pods, func(i, j int) bool {
    if pods[i].Namespace != pods[j].Namespace {
        return pods[i].Namespace < pods[j].Namespace // primary: namespace asc
    }
    if pods[i].Failures != pods[j].Failures {
        return pods[i].Failures > pods[j].Failures   // secondary: failures desc
    }
    return pods[i].Name < pods[j].Name               // tiebreak: name asc
})
```

The pattern is `if a != b { return a OP b }` for each key, falling through to the next when they're equal. Last key has no `if` — it's the tiebreak. Mix `<` and `>` to control direction per field.

### Stable Sort

`sort.Slice` does not promise to preserve the relative order of "equal" elements. Most of the time that doesn't matter. When it does — like when you sort by one key and want the previous order preserved among ties — use `sort.SliceStable`:

```go
// First sort by name (any order)
sort.Slice(pods, func(i, j int) bool { return pods[i].Name < pods[j].Name })

// Then sort by namespace, preserving name order within each namespace
sort.SliceStable(pods, func(i, j int) bool { return pods[i].Namespace < pods[j].Namespace })
```

Two stable sorts give you the same result as one multi-key comparator, just expressed differently. Pick whichever reads more clearly for the case at hand. `SliceStable` is slightly slower; for the slice sizes infra code touches it doesn't matter.

<div class="inline-exercises" data-concept="Sorting & Filtering"></div>
