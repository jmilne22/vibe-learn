## Putting It Together

Module 1 ended with a score report — `parse → accumulate → sort → format`, using maps and slices. The hint at the end was: *sorting by value to get "top N" requires bundling each key-value pair into a sortable unit, and that's exactly what structs unlock*. Time to cash that in.

Same shape, upgraded. Given a heterogeneous list of infra resources (some `Pod`s, some `Service`s), produce a sorted health report grouped by type.

### Step 1: Define the types

`Pod` and `Service` share a name and namespace, so embed `Metadata`. Each one has its own resource-specific fields and its own `IsHealthy` rule. Both satisfy a small `Resource` interface so the report code doesn't care which is which.

```go
type Metadata struct {
    Name      string
    Namespace string
}

func (m Metadata) FullName() string {
    return m.Namespace + "/" + m.Name
}

type Pod struct {
    Metadata
    Status   string
    MemoryMB int
}

func (p Pod) IsHealthy() bool {
    return p.Status == "Running"
}

type Service struct {
    Metadata
    Port    int
    Healthy bool
}

func (s Service) IsHealthy() bool {
    return s.Healthy
}

// The interface every reportable type satisfies.
type Resource interface {
    FullName() string
    IsHealthy() bool
}
```

`FullName` is promoted from `Metadata` — neither `Pod` nor `Service` defines it. Both types satisfy `Resource` implicitly: no `implements` keyword needed.

### Step 2: Group with a map

Same pattern Module 1 used for status counts. The key is the resource kind; the value is a slice of `Resource`. Grouping a heterogeneous slice into typed buckets:

```go
func groupByKind(rs []Resource) map[string][]Resource {
    grouped := make(map[string][]Resource)
    for _, r := range rs {
        kind := "Unknown"
        switch r.(type) {
        case Pod:
            kind = "Pod"
        case Service:
            kind = "Service"
        }
        grouped[kind] = append(grouped[kind], r)
    }
    return grouped
}
```

The type switch is the bridge — it pulls the concrete type out of the interface so the report can label things correctly. This is the textbook "type switch at a boundary" use: serialization / display / categorization, not core logic.

### Step 3: Sorted, formatted output

Inside each bucket, sort unhealthy first (so the report leads with what's broken), then by name. Across buckets, sort by kind so output is deterministic.

```go
func report(rs []Resource) []string {
    grouped := groupByKind(rs)

    kinds := make([]string, 0, len(grouped))
    for k := range grouped {
        kinds = append(kinds, k)
    }
    sort.Strings(kinds)

    var out []string
    for _, kind := range kinds {
        bucket := grouped[kind]
        sort.Slice(bucket, func(i, j int) bool {
            // Unhealthy first
            if bucket[i].IsHealthy() != bucket[j].IsHealthy() {
                return !bucket[i].IsHealthy()
            }
            return bucket[i].FullName() < bucket[j].FullName()
        })

        out = append(out, fmt.Sprintf("== %s (%d) ==", kind, len(bucket)))
        for _, r := range bucket {
            mark := "OK"
            if !r.IsHealthy() {
                mark = "FAIL"
            }
            out = append(out, fmt.Sprintf("  [%s] %s", mark, r.FullName()))
        }
    }
    return out
}
```

Three patterns from Module 1 carried straight through: sorted-keys for deterministic output, `sort.Slice` with a comparator, formatted lines with `fmt.Sprintf`. The new pieces — `Resource` interface, embedded `Metadata`, type switch — let the same code work over any future resource type. Add `ConfigMap`, give it `IsHealthy` and a `Metadata`, and `report` doesn't change.

### What just happened

Take stock of every Module 2 idea you used here:

- **Structs** with embedded `Metadata` to share `Name`/`Namespace` (§01, §06)
- **Promoted methods** — `FullName` came along for free (§06)
- **Pointers vs values** — value receivers throughout because we only read (§03, §05)
- **Implicit interface satisfaction** — `Pod` and `Service` satisfy `Resource` without declaring it (§07)
- **Type switch at a boundary** — categorize for display, not for logic (§08)

If anything here felt fuzzy, the cross-references are the place to go back. If it all clicked, you're ready for Module 3, where every one of these types gets a test.

---
