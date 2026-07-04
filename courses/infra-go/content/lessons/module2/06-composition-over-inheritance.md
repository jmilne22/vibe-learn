## Composition Over Inheritance

*Every Kubernetes resource — `Pod`, `Service`, `ConfigMap`, `Deployment` — embeds `metav1.ObjectMeta` to share `Name`, `Namespace`, and `Labels`. That single embed is what lets one controller iterate any resource type. Same mechanic, your own types.*

Go has no inheritance. Instead, you embed one struct inside another. The embedded struct's fields and methods get "promoted" — they're accessible directly on the outer struct.

<attempt type="pretest">

<predict prompt="What does this print?">
```go
type Metadata struct{ Name string }

func (m Metadata) FullName() string { return "prod/" + m.Name }

type Pod struct {
    Metadata
    Status string
}

func main() {
    p := Pod{Metadata: Metadata{Name: "web-1"}, Status: "Running"}
    fmt.Println(p.Name)
    fmt.Println(p.FullName())
}
```
```
web-1
prod/web-1
```
</predict>

Note that `Pod` defines neither a `Name` field nor a `FullName` method. Wrong is fine — promotion is the whole point of this section.

</attempt>

### Embedding

<attempt type="worked">

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

</attempt>

<attempt type="gaps">

<gaps prompt="Give ConfigMap the same name plumbing — one embed, zero forwarding methods.">
```go
type ConfigMap struct {
    «Metadata»            // no field name — that's the embed
    Data map[string]string
}

cm := ConfigMap{
    «Metadata»: Metadata{Name: "app-config", Namespace: "prod"},
    Data:       map[string]string{"LOG_LEVEL": "debug"},
}

fmt.Println(cm.«FullName()»)  // "prod/app-config"
fmt.Println(cm.Namespace)     // "prod" — promoted field
```
</gaps>

</attempt>

### Why Composition

```go
// Python/Java instinct: class Pod(Resource) — inheritance
// Go: embed the shared parts, compose the rest

// This lets you:
// 1. Share fields/methods without a type hierarchy
// 2. Embed multiple types (no diamond problem)
// 3. Override promoted methods by defining your own
```

### Interface Satisfaction Travels Through Embedding

This is the move that makes Kubernetes-style code work. Define an interface once, and any type that embeds something which already satisfies it gets the interface for free:

```go
type Named interface {
    FullName() string
}

// Pod embeds Metadata. Metadata has FullName(). So Pod satisfies Named —
// without Pod ever defining FullName itself.
var n Named = Pod{Metadata: Metadata{Name: "web-1", Namespace: "prod"}}
fmt.Println(n.FullName()) // "prod/web-1"

// Service embeds Metadata too. Same deal.
var n2 Named = Service{Metadata: Metadata{Name: "web-svc", Namespace: "prod"}}
```

Real Kubernetes types do exactly this. Every resource type — `Pod`, `Deployment`, `Service`, `ConfigMap` — embeds `metav1.ObjectMeta`, which carries `Name`, `Namespace`, `Labels`, `Annotations`, `UID`, `ResourceVersion`, and the methods `GetName()`, `GetNamespace()`, etc. The `metav1.Object` interface is satisfied by every K8s resource via that single embed. When a controller iterates a list of `runtime.Object`, that's the mechanism.

### Overriding a Promoted Method

If the outer type defines its own version of a promoted method, the outer wins:

```go
type LoggingPod struct {
    Pod
}

func (LoggingPod) FullName() string {
    return "[logged] pod" // shadows Pod.FullName / Metadata.FullName
}
```

You can still reach the inner one explicitly: `lp.Pod.FullName()`.

### Ambiguous Embedded Methods

Embedding two types that both have the same method name is the one Go gotcha here:

```go
type A struct{}
func (A) Name() string { return "from A" }

type B struct{}
func (B) Name() string { return "from B" }

type Both struct {
    A
    B
}

var x Both
// x.Name() // ambiguous — won't compile
fmt.Println(x.A.Name(), x.B.Name()) // explicit access works
```

The compiler refuses to pick — you have to disambiguate by selecting `x.A.Name()` or `x.B.Name()` directly. This is why the `metav1` types embed only one anchor (`ObjectMeta`) rather than mixing in multiple sources of name/namespace.

<attempt type="scratch">

<div class="inline-exercises" data-concept="Composition"></div>

</attempt>
