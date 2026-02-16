## Composition Over Inheritance

Go has no inheritance. Instead, you embed one struct inside another. The embedded struct's fields and methods get "promoted" — they're accessible directly on the outer struct.

### Embedding

```go
type Metadata struct {
    Name      string
    Namespace string
    Labels    map[string]string
}

func (m Metadata) FullName() string {
    return m.Namespace + "/" + m.Name
}

type Pod struct {
    Metadata           // embedded — no field name
    Status   string
    Resources Resources
}

type Service struct {
    Metadata          // same Metadata, different resource
    Port     int
    Target   int
}

// Promoted fields — access directly
pod := Pod{
    Metadata: Metadata{
        Name:      "web-1",
        Namespace: "production",
        Labels:    map[string]string{"app": "web"},
    },
    Status: "Running",
}

fmt.Println(pod.Name)       // "web-1" — promoted from Metadata
fmt.Println(pod.FullName()) // "production/web-1" — promoted method
```

This is how the real Kubernetes Go types work. `ObjectMeta` is embedded in every resource type.

### Why Composition

```go
// Python/Java instinct: class Pod(Resource) — inheritance
// Go: embed the shared parts, compose the rest

// This lets you:
// 1. Share fields/methods without a type hierarchy
// 2. Embed multiple types (no diamond problem)
// 3. Override promoted methods by defining your own
```

<div class="inline-exercises" data-concept="Composition"></div>
