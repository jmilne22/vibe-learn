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

<div class="inline-exercises" data-concept="Reconciliation"></div>
