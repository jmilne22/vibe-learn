## Structs as Infrastructure Models

A struct is a typed collection of fields. In infra code, nearly everything is a struct — a pod has a name, namespace, and resource limits; a service has ports and selectors; a config entry has a key, value, and source.

### Defining Structs

```go
type Pod struct {
    Name      string
    Namespace string
    Status    string
    MemoryMB  int
    CPUM      int // millicores
}

type Service struct {
    Name      string
    Namespace string
    Port      int
    Target    int
    Selector  map[string]string
}
```

Field names are capitalized (exported). Lowercase = unexported (package-private). In infra code, you'll almost always export fields because structs get passed between packages, serialized to JSON/YAML, etc.

### Struct Literals

```go
// Named fields — always use this style
pod := Pod{
    Name:      "web-1",
    Namespace: "production",
    Status:    "Running",
    MemoryMB:  512,
    CPUM:      250,
}

// You CAN use positional: Pod{"web-1", "production", "Running", 512, 250}
// But don't. It breaks when fields are added and is unreadable.
```

### Zero Values

Every field gets its zero value if you don't set it:

```go
p := Pod{Name: "web-1"}
// p.Namespace == ""     (zero value for string)
// p.MemoryMB == 0       (zero value for int)
// p.Status == ""         (zero value for string)
```

This matters in infra code — is `MemoryMB == 0` "not set" or "zero bytes requested"? This ambiguity is why we need constructors and validation.

*Python comparison*

```python
# Python: @dataclass handles defaults, __init__, __repr__ automatically
# Go: you write it yourself. More boilerplate, more control.

@dataclass
class Pod:
    name: str
    namespace: str = "default"
    memory_mb: int = 0
```

### Nested Structs

Real infra models are nested. A pod has resource limits. A deployment has a pod template.

```go
type Resources struct {
    MemoryMB int
    CPUM     int
}

type Pod struct {
    Name      string
    Namespace string
    Status    string
    Resources Resources // nested struct
    Labels    map[string]string
}

// Access nested fields directly
pod := Pod{
    Name:      "web-1",
    Resources: Resources{MemoryMB: 512, CPUM: 250},
    Labels:    map[string]string{"app": "web", "env": "prod"},
}
fmt.Println(pod.Resources.MemoryMB) // 512
```

<div class="inline-exercises" data-concept="Structs"></div>
