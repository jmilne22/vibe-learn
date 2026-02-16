## Methods & Receivers

Methods are functions attached to a type. In Go, you define them outside the struct — they're just functions with a receiver parameter.

### Value Receivers

```go
// Value receiver — gets a COPY of the struct
func (p Pod) FullName() string {
    return p.Namespace + "/" + p.Name
}

func (p Pod) IsRunning() bool {
    return p.Status == "Running"
}

// Usage
pod := Pod{Name: "web-1", Namespace: "production", Status: "Running"}
fmt.Println(pod.FullName())  // "production/web-1"
fmt.Println(pod.IsRunning()) // true
```

### Pointer Receivers

```go
// Pointer receiver — can MODIFY the original struct
func (p *Pod) SetStatus(status string) {
    p.Status = status
}

func (p *Pod) AddLabel(key, value string) {
    if p.Labels == nil {
        p.Labels = make(map[string]string)
    }
    p.Labels[key] = value
}

// Usage
pod := Pod{Name: "web-1", Status: "Pending"}
pod.SetStatus("Running")  // modifies pod directly
fmt.Println(pod.Status)    // "Running"
```

### When to Use Which

| Use value receiver | Use pointer receiver |
|---|---|
| Method only reads fields | Method modifies fields |
| Struct is small (< 5 fields) | Struct is large |
| You want immutable semantics | You need mutation |

> **Practical rule:** If *any* method on a type needs a pointer receiver, use pointer receivers for *all* methods on that type. Mixing receivers is confusing and causes subtle interface satisfaction bugs.

*Python comparison*

```python
# Python: all methods get `self` (always a reference, always mutable)
class Pod:
    def full_name(self):
        return f"{self.namespace}/{self.name}"

# Go: you explicitly choose value vs pointer receiver.
# More typing, but you know exactly what can mutate.
```

<div class="inline-exercises" data-concept="Methods"></div>
