You deploy to K8s daily. Now talk to it programmatically. client-go is the same library K8s itself uses. Understanding it means you can build operators, controllers, and custom tooling.

---

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

### Typed Clients (Production)

For production operators, generate typed clients with `controller-gen` or `code-generator`. This gives you:
- Compile-time type safety
- Auto-generated Listers, Informers, and Clientsets
- DeepCopy methods

## The Reconciliation Loop

### Desired State vs Actual State

Every K8s controller follows the same pattern:

```
1. Watch for changes (events)
2. For each event, compare desired state (spec) with actual state (status)
3. Take action to make actual match desired
4. Update status
5. If action failed, requeue
```

### The Controller Pattern

```go
type Controller struct {
    clientset     *kubernetes.Clientset
    podInformer   cache.SharedIndexInformer
    workqueue     workqueue.RateLimitingInterface
}

func (c *Controller) Run(ctx context.Context) error {
    defer c.workqueue.ShutDown()

    // Start informer
    go c.podInformer.Run(ctx.Done())

    // Wait for cache sync
    if !cache.WaitForCacheSync(ctx.Done(), c.podInformer.HasSynced) {
        return fmt.Errorf("cache sync failed")
    }

    // Process work items
    for c.processNextItem(ctx) {
    }
    return nil
}

func (c *Controller) processNextItem(ctx context.Context) bool {
    key, quit := c.workqueue.Get()
    if quit {
        return false
    }
    defer c.workqueue.Done(key)

    err := c.reconcile(ctx, key.(string))
    if err != nil {
        // Requeue with rate limiting
        c.workqueue.AddRateLimited(key)
        slog.Error("reconcile failed", "key", key, "error", err)
        return true
    }

    // Success — forget the rate limit history
    c.workqueue.Forget(key)
    return true
}
```

### The Reconcile Function

```go
func (c *Controller) reconcile(ctx context.Context, key string) error {
    namespace, name, _ := cache.SplitMetaNamespaceKey(key)

    // Get the desired state
    pod, err := c.podInformer.GetStore().GetByKey(key)
    if err != nil {
        return err
    }
    if pod == nil {
        // Resource was deleted — handle cleanup
        slog.Info("resource deleted", "key", key)
        return nil
    }

    // Compare desired vs actual, take action
    actual := pod.(*corev1.Pod)
    slog.Info("reconciling", "namespace", namespace, "name", name, "phase", actual.Status.Phase)

    // ... your business logic here ...

    return nil
}
```

### Idempotency

**Reconcile must be safe to run repeatedly.** Because:
- Events can be delivered multiple times
- The controller can restart at any point
- Multiple events can arrive for the same resource

```go
// BAD: not idempotent
func reconcile(pod *corev1.Pod) {
    createSidecar(pod) // creates duplicate sidecars on re-run!
}

// GOOD: idempotent
func reconcile(pod *corev1.Pod) {
    if !hasSidecar(pod) {
        createSidecar(pod)
    }
}
```

## Building an Operator

### With controller-runtime

`controller-runtime` (used by Kubebuilder and Operator SDK) simplifies everything:

```go
import (
    ctrl "sigs.k8s.io/controller-runtime"
    "sigs.k8s.io/controller-runtime/pkg/client"
)

type CronTabReconciler struct {
    client.Client
}

func (r *CronTabReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
    var cronTab v1.CronTab
    if err := r.Get(ctx, req.NamespacedName, &cronTab); err != nil {
        return ctrl.Result{}, client.IgnoreNotFound(err)
    }

    slog.Info("reconciling", "name", cronTab.Name, "spec", cronTab.Spec.CronSpec)

    // Business logic: ensure the cron job exists
    // ...

    // Update status
    cronTab.Status.LastScheduled = metav1.Now()
    if err := r.Status().Update(ctx, &cronTab); err != nil {
        return ctrl.Result{}, err
    }

    // Requeue after 1 minute to check again
    return ctrl.Result{RequeueAfter: time.Minute}, nil
}

func main() {
    mgr, _ := ctrl.NewManager(ctrl.GetConfigOrDie(), ctrl.Options{})

    ctrl.NewControllerManagedBy(mgr).
        For(&v1.CronTab{}).
        Complete(&CronTabReconciler{Client: mgr.GetClient()})

    mgr.Start(ctrl.SetupSignalHandler())
}
```

### Finalizers

Finalizers let you run cleanup before a resource is deleted:

```go
func (r *CronTabReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
    var ct v1.CronTab
    if err := r.Get(ctx, req.NamespacedName, &ct); err != nil {
        return ctrl.Result{}, client.IgnoreNotFound(err)
    }

    finalizerName := "crontab.stable.example.com/cleanup"

    if ct.DeletionTimestamp != nil {
        // Resource is being deleted
        if containsString(ct.Finalizers, finalizerName) {
            // Run cleanup
            if err := r.cleanupExternalResources(&ct); err != nil {
                return ctrl.Result{}, err
            }
            // Remove finalizer
            ct.Finalizers = removeString(ct.Finalizers, finalizerName)
            if err := r.Update(ctx, &ct); err != nil {
                return ctrl.Result{}, err
            }
        }
        return ctrl.Result{}, nil
    }

    // Add finalizer if not present
    if !containsString(ct.Finalizers, finalizerName) {
        ct.Finalizers = append(ct.Finalizers, finalizerName)
        if err := r.Update(ctx, &ct); err != nil {
            return ctrl.Result{}, err
        }
    }

    // Normal reconciliation...
    return ctrl.Result{}, nil
}
```

**Why finalizers?** Without them, if you delete a CRD resource, any external resources it created (DNS records, cloud resources, etc.) become orphaned.

---

## Exercises

Practice individual concepts with quick drills, then tackle multi-step challenges.

<div id="warmups-container">
    <noscript><p class="js-required">JavaScript is required for the interactive exercises.</p></noscript>
</div>

### Challenges

Apply what you learned to infra-themed problems. Each challenge has multiple variants — shuffle to keep things fresh.

<div id="challenges-container">
    <noscript><p class="js-required">JavaScript is required for the interactive exercises.</p></noscript>
</div>
