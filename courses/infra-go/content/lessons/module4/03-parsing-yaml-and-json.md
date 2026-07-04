## Parsing YAML & JSON

Infrastructure is YAML and JSON all the way down. K8s manifests, Terraform configs, CI pipelines, Helm values.

<attempt type="pretest">

<predict prompt="What does this print?">
```go
type Pod struct {
    Name     string `json:"name"`
    Replicas int    `json:"replicas"`
}

func main() {
    data := []byte(`{"name":"web","memory":512}`)
    var pod Pod
    json.Unmarshal(data, &pod)
    fmt.Println(pod.Name, pod.Replicas)
}
```
```
web 0
```
</predict>

Commit first: what happens to the field the JSON has but the struct doesn't, and the field the struct has but the JSON doesn't?

</attempt>

### JSON with encoding/json

<attempt type="worked">

```go
import "encoding/json"

type Pod struct {
    Name      string `json:"name"`
    Namespace string `json:"namespace"`
    Image     string `json:"image,omitempty"` // omit if empty
    Replicas  int    `json:"replicas"`
}

// Unmarshal: JSON bytes → struct
data := []byte(`{"name":"web","namespace":"prod","replicas":3}`)
var pod Pod
if err := json.Unmarshal(data, &pod); err != nil {
    return fmt.Errorf("parsing JSON: %w", err)
}

// Marshal: struct → JSON bytes
out, err := json.MarshalIndent(pod, "", "  ")
if err != nil {
    return fmt.Errorf("encoding JSON: %w", err)
}
fmt.Println(string(out))
```

</attempt>

### Struct Tags

Tags control how fields map to JSON/YAML keys:

```go
type Config struct {
    APIVersion string            `json:"apiVersion" yaml:"apiVersion"`
    Kind       string            `json:"kind" yaml:"kind"`
    Metadata   Metadata          `json:"metadata" yaml:"metadata"`
    Spec       map[string]any    `json:"spec" yaml:"spec"`
}
```

### YAML with gopkg.in/yaml.v3

```go
import "gopkg.in/yaml.v3"

// Same patterns as JSON
data, err := os.ReadFile("deployment.yaml")
if err != nil { ... }

var config Config
if err := yaml.Unmarshal(data, &config); err != nil {
    return fmt.Errorf("parsing YAML: %w", err)
}
```

<attempt type="gaps">

<gaps prompt="Parse a manifest into a typed struct — tags map the keys, Unmarshal fills it in place.">
```go
type Deployment struct {
    APIVersion string `yaml:«"apiVersion"»`
    Kind       string `yaml:"kind"`
    Replicas   int    `yaml:"replicas"`
}

data, err := os.ReadFile("deployment.yaml")
if err != nil {
    return fmt.Errorf("reading: %w", err)
}

var dep Deployment
if err := yaml.Unmarshal(data, «&dep»); err != nil {
    return fmt.Errorf("parsing YAML: «%w»", err)
}
```
</gaps>

</attempt>

### Handling Unknown Fields

K8s manifests have many fields you might not care about:

```go
// Option 1: use map[string]any for flexible parsing
var raw map[string]any
yaml.Unmarshal(data, &raw)

// Option 2: define only the fields you need — unknown fields are silently ignored
type Minimal struct {
    APIVersion string `yaml:"apiVersion"`
    Kind       string `yaml:"kind"`
}

// Option 3: strict mode — reject unknown fields (json only)
decoder := json.NewDecoder(bytes.NewReader(data))
decoder.DisallowUnknownFields()
```

<attempt type="scratch">

<div class="inline-exercises" data-concept="JSON Parsing"></div>

</attempt>
