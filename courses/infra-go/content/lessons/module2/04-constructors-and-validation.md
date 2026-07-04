## Constructors & Validation

Go has no constructors as a language feature. The convention is a `New*` function that returns `(T, error)`.

<attempt type="worked">

In §03 you saw the bare-bones version: `NewPod(name, ns) *Pod`. Real infra constructors do two more things — validate inputs and surface failures. The canonical signature becomes `(*T, error)`:

```go
func NewPod(name, namespace string, memMB, cpuM int) (*Pod, error) {
    if name == "" {
        return nil, fmt.Errorf("pod name cannot be empty")
    }
    if namespace == "" {
        namespace = "default"
    }
    if memMB < 0 {
        return nil, fmt.Errorf("memory cannot be negative: %d", memMB)
    }
    return &Pod{
        Name:      name,
        Namespace: namespace,
        Status:    "Pending",
        Resources: Resources{MemoryMB: memMB, CPUM: cpuM},
    }, nil
}
```

Returning `nil` on failure is the convention — callers check `err`, not the value, so a nil pointer plus a non-nil error is unambiguous. Errors are covered properly in Module 3; for now just notice the shape.

</attempt>

<attempt type="gaps">

<gaps prompt="Same shape for a Service — catch bad data at construction time, not deploy time.">
```go
func NewService(name string, port int) («*Service», error) {
    if name == "" {
        return «nil», fmt.Errorf("service name cannot be empty")
    }
    if port < 1 || port > 65535 {
        return nil, fmt.Errorf("invalid port: %d", port)
    }
    return «&Service»{Name: name, Port: port}, nil
}
```
</gaps>

</attempt>

**Why this pattern matters:** In infra, invalid data causes outages. A pod with empty name, a service with port 0, a config with negative TTL — these are bugs that should be caught at construction time, not at deploy time.

*Python comparison*

```python
# Python: validation in __init__ or __post_init__
@dataclass
class Pod:
    name: str
    def __post_init__(self):
        if not self.name:
            raise ValueError("name required")

# Go: validation in NewPod() constructor
# Same idea, different mechanism.
```

<attempt type="scratch">

<div class="inline-exercises" data-concept="Constructors"></div>

</attempt>
