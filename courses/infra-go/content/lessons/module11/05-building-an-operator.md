## Building an Operator

### With controller-runtime

<attempt type="worked">

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

</attempt>

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

<attempt type="gaps">

<gaps prompt="A minimal Backup reconciler — not-found is success, status has its own update path, and it re-checks itself every five minutes.">
```go
func (r *BackupReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
    var backup v1.Backup
    if err := r.Get(ctx, req.«NamespacedName», &backup); err != nil {
        return ctrl.Result{}, client.«IgnoreNotFound»(err)
    }

    // ... ensure the backup CronJob exists ...

    backup.Status.LastRun = metav1.Now()
    if err := r.«Status()».Update(ctx, &backup); err != nil {
        return ctrl.Result{}, err
    }

    return ctrl.Result{«RequeueAfter»: 5 * time.Minute}, nil
}
```
</gaps>

The not-found swallow matters: after a delete, the reconciler still gets an event for the vanished object, and returning an error there would requeue it forever.

</attempt>

---

### Ship your project: K8s Operator

This module's exercises are deliberately thin — the real practice is [Project 5: K8s Operator](project-k8s-operator.html), four milestones from "reconciler logs a request" to "fake-client tests pass with no cluster." Ship it and you've completed the course the way it's meant to be completed: five real tools in five real repos.
