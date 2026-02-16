## Sorting & Filtering

> *"The bigger the interface, the weaker the abstraction."* — Rob Pike

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

<div class="inline-exercises" data-concept="Sorting & Filtering"></div>
