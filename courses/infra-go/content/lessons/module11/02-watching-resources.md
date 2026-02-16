## Watching Resources

### The Watch API

```go
watcher, err := clientset.CoreV1().Pods("default").Watch(
    context.Background(),
    metav1.ListOptions{},
)
if err != nil {
    log.Fatal(err)
}

for event := range watcher.ResultChan() {
    pod := event.Object.(*corev1.Pod)
    fmt.Printf("%-8s %s (phase: %s)\n", event.Type, pod.Name, pod.Status.Phase)
    // Type is ADDED, MODIFIED, or DELETED
}
```

### Informers: Cached Watches

Raw watches are fragile — they disconnect, need bookmarks, and don't cache. Informers handle all of this:

```go
import (
    "k8s.io/client-go/informers"
    "k8s.io/client-go/tools/cache"
)

func watchWithInformer(clientset *kubernetes.Clientset) {
    // Create a shared informer factory
    factory := informers.NewSharedInformerFactory(clientset, 30*time.Second)

    // Get a pod informer
    podInformer := factory.Core().V1().Pods().Informer()

    // Register event handlers
    podInformer.AddEventHandler(cache.ResourceEventHandlerFuncs{
        AddFunc: func(obj interface{}) {
            pod := obj.(*corev1.Pod)
            fmt.Printf("ADDED: %s/%s\n", pod.Namespace, pod.Name)
        },
        UpdateFunc: func(oldObj, newObj interface{}) {
            pod := newObj.(*corev1.Pod)
            fmt.Printf("UPDATED: %s/%s\n", pod.Namespace, pod.Name)
        },
        DeleteFunc: func(obj interface{}) {
            pod := obj.(*corev1.Pod)
            fmt.Printf("DELETED: %s/%s\n", pod.Namespace, pod.Name)
        },
    })

    // Start the informer
    stopCh := make(chan struct{})
    defer close(stopCh)
    factory.Start(stopCh)

    // Wait for the cache to sync
    factory.WaitForCacheSync(stopCh)

    // Now you can also query the cache directly:
    pods, _ := factory.Core().V1().Pods("default").Lister().List(labels.Everything())
    fmt.Printf("Cached pods: %d\n", len(pods))

    // Block until stopped
    <-stopCh
}
```

**Why informers matter:**
- Cache reduces API server load (read from cache, not API)
- Automatic reconnection on watch disconnects
- Shared across controllers (one watch per resource type)
- `Lister().List()` is local — O(n) scan of cache, no API call
