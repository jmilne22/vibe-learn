## Constructors & Validation

Go has no constructors as a language feature. The convention is a `New*` function that returns `(T, error)`.

```go
func NewPod(name, namespace string, memMB, cpuM int) (Pod, error) {
    if name == "" {
        return Pod{}, fmt.Errorf("pod name cannot be empty")
    }
    if namespace == "" {
        namespace = "default"
    }
    if memMB < 0 {
        return Pod{}, fmt.Errorf("memory cannot be negative: %d", memMB)
    }
    return Pod{
        Name:      name,
        Namespace: namespace,
        Status:    "Pending",
        Resources: Resources{MemoryMB: memMB, CPUM: cpuM},
    }, nil
}
```

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

<div class="inline-exercises" data-concept="Constructors"></div>
