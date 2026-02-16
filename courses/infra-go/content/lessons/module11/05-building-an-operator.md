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
