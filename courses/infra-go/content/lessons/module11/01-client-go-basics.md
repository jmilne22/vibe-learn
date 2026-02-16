## client-go Basics

### Setting Up

```bash
go get k8s.io/client-go@latest
go get k8s.io/apimachinery@latest
```

### Getting a Client

```go
import (
    "k8s.io/client-go/kubernetes"
    "k8s.io/client-go/rest"
    "k8s.io/client-go/tools/clientcmd"
)

// Out-of-cluster: use your kubeconfig (~/.kube/config)
func getClient() (*kubernetes.Clientset, error) {
    config, err := clientcmd.BuildConfigFromFlags("", clientcmd.RecommendedHomeFile)
    if err != nil {
        return nil, err
    }
    return kubernetes.NewForConfig(config)
}

// In-cluster: use the service account mounted into the pod
func getInClusterClient() (*kubernetes.Clientset, error) {
    config, err := rest.InClusterConfig()
    if err != nil {
        return nil, err
    }
    return kubernetes.NewForConfig(config)
}
```

The `Clientset` gives you typed access to every built-in K8s resource.

### CRUD on Pods

```go
func listPods(clientset *kubernetes.Clientset, namespace string) error {
    pods, err := clientset.CoreV1().Pods(namespace).List(
        context.Background(),
        metav1.ListOptions{},
    )
    if err != nil {
        return err
    }
    for _, pod := range pods.Items {
        fmt.Printf("%-40s %-10s %s\n", pod.Name, pod.Status.Phase, pod.Spec.NodeName)
    }
    return nil
}
```

### Label Selectors

```go
// List only pods with specific labels
pods, err := clientset.CoreV1().Pods("default").List(
    context.Background(),
    metav1.ListOptions{
        LabelSelector: "app=web,env=production",
    },
)

// Field selectors
pods, err := clientset.CoreV1().Pods("").List(
    context.Background(),
    metav1.ListOptions{
        FieldSelector: "status.phase=Running",
    },
)
```

### Creating Resources

```go
func createConfigMap(clientset *kubernetes.Clientset, ns, name string, data map[string]string) error {
    cm := &corev1.ConfigMap{
        ObjectMeta: metav1.ObjectMeta{
            Name:      name,
            Namespace: ns,
        },
        Data: data,
    }
    _, err := clientset.CoreV1().ConfigMaps(ns).Create(
        context.Background(), cm, metav1.CreateOptions{},
    )
    return err
}
```

### Updating and Deleting

```go
// Update: Get → modify → Update
cm, err := clientset.CoreV1().ConfigMaps("default").Get(
    context.Background(), "my-config", metav1.GetOptions{},
)
cm.Data["new-key"] = "new-value"
_, err = clientset.CoreV1().ConfigMaps("default").Update(
    context.Background(), cm, metav1.UpdateOptions{},
)

// Delete
err = clientset.CoreV1().Pods("default").Delete(
    context.Background(), "my-pod", metav1.DeleteOptions{},
)
```

> **Gotcha:** Always Get before Update. K8s uses `resourceVersion` for optimistic concurrency — if another client updated the resource between your Get and Update, the Update fails with a Conflict error.

<div class="inline-exercises" data-concept="client-go"></div>
