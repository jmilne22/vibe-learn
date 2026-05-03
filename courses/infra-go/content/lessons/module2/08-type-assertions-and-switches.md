## Type Assertions & Switches

*A logging pipeline that accepts `Resource` and prints `Pod` differently than `Service` is a `switch v := r.(type)` away. Use it at boundaries — display, serialization, CLI output — not in core logic.*

When you have an interface value and need the concrete type underneath.

### Comma-Ok Pattern

<predict prompt="What happens when this runs?">
```go
type HealthChecker interface{ IsHealthy() bool }
type Pod struct{ Name string }
type Service struct{ Port int }

func (Pod) IsHealthy() bool     { return true }
func (Service) IsHealthy() bool { return true }

func main() {
    var c HealthChecker = Service{Port: 80}
    pod := c.(Pod)
    fmt.Println(pod.Name)
}
```
```
panic: interface conversion: main.Service is not main.Pod: missing method
```
</predict>

A bare type assertion panics if the underlying type doesn't match. This is fine in tests where you control the input; in production code you want the comma-ok form so you can handle the mismatch:

```go
var c HealthChecker = Pod{Name: "web-1", Status: "Running"}

// Type assertion with comma-ok
pod, ok := c.(Pod)
if ok {
    fmt.Println(pod.Resources.MemoryMB) // access Pod-specific fields
}

// Without comma-ok — panics if wrong type
pod := c.(Pod) // dangerous in production code
```

### Type Switch

When an interface could hold multiple concrete types:

```go
type Resource interface {
    FullName() string
}

func describe(r Resource) string {
    switch v := r.(type) {
    case Pod:
        return fmt.Sprintf("Pod %s (%s, %dMB)", v.FullName(), v.Status, v.Resources.MemoryMB)
    case Service:
        return fmt.Sprintf("Service %s (port %d→%d)", v.FullName(), v.Port, v.Target)
    default:
        return fmt.Sprintf("Unknown resource: %s", v.FullName())
    }
}
```

**When to use type switches vs redesign:** If you find yourself writing type switches in many places, you probably need a better interface. Type switches are appropriate at boundaries — serialization, logging, CLI output — not in core logic.

---

<div class="inline-exercises" data-concept="Type Assertions"></div>
