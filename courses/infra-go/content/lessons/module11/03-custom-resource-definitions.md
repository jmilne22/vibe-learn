## Custom Resource Definitions

### What a CRD Is

CRDs extend the K8s API with your own resource types:

```yaml
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: crontabs.stable.example.com
spec:
  group: stable.example.com
  versions:
    - name: v1
      served: true
      storage: true
      schema:
        openAPIV3Schema:
          type: object
          properties:
            spec:
              type: object
              properties:
                cronSpec:
                  type: string
                image:
                  type: string
                replicas:
                  type: integer
  scope: Namespaced
  names:
    plural: crontabs
    singular: crontab
    kind: CronTab
    shortNames: [ct]
```

### Working with Unstructured Data

<attempt type="worked">

For quick prototyping, use the dynamic client:

```go
import (
    "k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
    "k8s.io/apimachinery/pkg/runtime/schema"
    "k8s.io/client-go/dynamic"
)

func listCronTabs(dynClient dynamic.Interface) error {
    gvr := schema.GroupVersionResource{
        Group:    "stable.example.com",
        Version:  "v1",
        Resource: "crontabs",
    }

    list, err := dynClient.Resource(gvr).Namespace("default").List(
        context.Background(), metav1.ListOptions{},
    )
    if err != nil {
        return err
    }

    for _, item := range list.Items {
        name := item.GetName()
        spec, _, _ := unstructured.NestedMap(item.Object, "spec")
        fmt.Printf("%s: %v\n", name, spec)
    }
    return nil
}
```

</attempt>

<attempt type="gaps">

<gaps prompt="List every Backup custom resource (kind Backup, group infra.example.com, version v1) — remember what Resource wants.">
```go
gvr := schema.GroupVersionResource{
    Group:    «"infra.example.com"»,
    Version:  «"v1"»,
    Resource: «"backups"»,
}
list, err := dynClient.Resource(gvr).Namespace("default").List(
    context.Background(), metav1.ListOptions{},
)
```
</gaps>

`Resource` is the lowercase *plural* — the same string as the CRD's `names.plural`, and the same word you'd type in a kubectl URL path.

</attempt>

### Typed Clients (Production)

For production operators, generate typed clients with `controller-gen` or `code-generator`. This gives you:
- Compile-time type safety
- Auto-generated Listers, Informers, and Clientsets
- DeepCopy methods
