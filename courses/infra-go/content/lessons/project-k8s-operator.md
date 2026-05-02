Build a Kubernetes operator that watches a Custom Resource Definition and reconciles the desired state.

---

## What You're Building

A K8s operator that:
- Defines a Custom Resource (e.g., `SimpleApp` that manages a Deployment + Service)
- Watches for create/update/delete events on the custom resource
- Reconciles: ensures the actual cluster state matches the desired state
- Handles status updates: reports back to the CRD status subresource
- Uses finalizers for cleanup when the resource is deleted
- Includes proper logging and error handling

## Why This Project

Operators are the standard pattern for extending Kubernetes. Companies like Redis, Elastic, and MongoDB build operators to manage their products on K8s. Building one from scratch gives you direct practice with the API machinery behind that pattern.

This project ties together everything: structs, interfaces, error handling, HTTP clients (the K8s API), concurrency (informers and work queues), and testing.

## The Custom Resource

Your operator manages `SimpleApp` resources. A SimpleApp bundles a Deployment and a Service into a single resource:

```yaml
apiVersion: apps.example.com/v1
kind: SimpleApp
metadata:
  name: my-web-app
  namespace: default
spec:
  image: nginx:1.25
  replicas: 3
  port: 80
  env:
    - name: ENV
      value: production
    - name: LOG_LEVEL
      value: info
```

When you create this resource, the operator should:
1. Create a Deployment with 3 replicas of `nginx:1.25`
2. Create a Service that routes to port 80
3. Update the SimpleApp status with the current state

## Usage

```bash
# Install the CRD
kubectl apply -f config/crd.yaml

# Run the operator locally (outside the cluster)
simpleapp-operator --kubeconfig ~/.kube/config

# In another terminal, create a SimpleApp
kubectl apply -f config/samples/my-web-app.yaml

# Watch the operator create resources
kubectl get deployments
kubectl get services
kubectl get simpleapps

# Scale by editing the CR
kubectl patch simpleapp my-web-app --type merge -p '{"spec":{"replicas":5}}'
# Operator detects the change and updates the Deployment

# Delete the CR — operator cleans up
kubectl delete simpleapp my-web-app
# Deployment and Service are removed via finalizer
```

## Expected Output

```
$ simpleapp-operator --kubeconfig ~/.kube/config

2024/01/15 10:30:01 starting SimpleApp operator
2024/01/15 10:30:01 waiting for cache sync...
2024/01/15 10:30:02 cache synced, starting workers

2024/01/15 10:30:15 reconciling SimpleApp default/my-web-app
2024/01/15 10:30:15   creating Deployment default/my-web-app (replicas=3, image=nginx:1.25)
2024/01/15 10:30:15   creating Service default/my-web-app (port=80)
2024/01/15 10:30:15   updating status: available=0/3
2024/01/15 10:30:20   updating status: available=3/3

2024/01/15 10:31:00 reconciling SimpleApp default/my-web-app
2024/01/15 10:31:00   updating Deployment default/my-web-app (replicas=3→5)
2024/01/15 10:31:00   updating status: available=3/5

2024/01/15 10:32:00 reconciling SimpleApp default/my-web-app (deleting)
2024/01/15 10:32:00   removing finalizer, cleaning up owned resources
2024/01/15 10:32:00   deleted Deployment default/my-web-app
2024/01/15 10:32:00   deleted Service default/my-web-app
```

## Requirements

### Core

- **CRD definition:** Write a YAML file that registers the `SimpleApp` custom resource with the K8s API server. Include the `spec` and `status` subresources.
  ```yaml
  apiVersion: apiextensions.k8s.io/v1
  kind: CustomResourceDefinition
  metadata:
    name: simpleapps.apps.example.com
  spec:
    group: apps.example.com
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
                  image:
                    type: string
                  replicas:
                    type: integer
                  port:
                    type: integer
                  env:
                    type: array
                    items:
                      type: object
                      properties:
                        name:
                          type: string
                        value:
                          type: string
              status:
                type: object
                properties:
                  availableReplicas:
                    type: integer
                  conditions:
                    type: array
                    items:
                      type: object
                      properties:
                        type:
                          type: string
                        status:
                          type: string
                        lastTransitionTime:
                          type: string
        subresources:
          status: {}
    scope: Namespaced
    names:
      plural: simpleapps
      singular: simpleapp
      kind: SimpleApp
  ```

- **Go types:** Define the SimpleApp as Go structs using the unstructured client or typed client approach:
  ```go
  type SimpleApp struct {
      metav1.TypeMeta   `json:",inline"`
      metav1.ObjectMeta `json:"metadata,omitempty"`
      Spec              SimpleAppSpec   `json:"spec,omitempty"`
      Status            SimpleAppStatus `json:"status,omitempty"`
  }

  type SimpleAppSpec struct {
      Image    string       `json:"image"`
      Replicas int32        `json:"replicas"`
      Port     int32        `json:"port"`
      Env      []EnvVar     `json:"env,omitempty"`
  }

  type EnvVar struct {
      Name  string `json:"name"`
      Value string `json:"value"`
  }

  type SimpleAppStatus struct {
      AvailableReplicas int32       `json:"availableReplicas"`
      Conditions        []Condition `json:"conditions,omitempty"`
  }
  ```

- **Controller setup:** Use `controller-runtime` (the library behind kubebuilder and operator-sdk) to set up the manager, controller, and reconciler:
  ```go
  mgr, err := ctrl.NewManager(cfg, ctrl.Options{})
  ctrl.NewControllerManagedBy(mgr).
      For(&SimpleApp{}).
      Owns(&appsv1.Deployment{}).
      Owns(&corev1.Service{}).
      Complete(&SimpleAppReconciler{})
  ```

- **Reconcile loop:** The `Reconcile` function should:
  1. Fetch the SimpleApp resource
  2. If it's being deleted (has `DeletionTimestamp`), run cleanup and remove the finalizer
  3. If it's new, add the finalizer
  4. Create or update the Deployment to match the spec
  5. Create or update the Service to match the spec
  6. Update the SimpleApp status with the current Deployment state

- **Owner references:** Set owner references on created Deployments and Services so K8s garbage collection cleans them up if the operator isn't running:
  ```go
  ctrl.SetControllerReference(simpleApp, deployment, r.Scheme)
  ```

- **Finalizers:** Add a finalizer to the SimpleApp on creation. On deletion, clean up owned resources and remove the finalizer:
  ```go
  const finalizerName = "apps.example.com/finalizer"

  // Add finalizer
  if !controllerutil.ContainsFinalizer(app, finalizerName) {
      controllerutil.AddFinalizer(app, finalizerName)
      r.Update(ctx, app)
  }

  // Remove finalizer after cleanup
  controllerutil.RemoveFinalizer(app, finalizerName)
  ```

- **Idempotency:** The reconcile loop must be safe to run multiple times. Use `CreateOrUpdate` to avoid conflicts:
  ```go
  _, err := ctrl.CreateOrUpdate(ctx, r.Client, deployment, func() error {
      // Set desired state on the deployment
      deployment.Spec.Replicas = &app.Spec.Replicas
      deployment.Spec.Template.Spec.Containers[0].Image = app.Spec.Image
      return ctrl.SetControllerReference(app, deployment, r.Scheme)
  })
  ```

### What the Operator Creates

For a SimpleApp with `image: nginx:1.25`, `replicas: 3`, `port: 80`:

**Deployment:**
- Name matches the SimpleApp name
- Replicas from spec
- Container with the specified image
- Container port from spec
- Environment variables from spec
- Labels: `app.kubernetes.io/name: <name>`, `app.kubernetes.io/managed-by: simpleapp-operator`

**Service:**
- Name matches the SimpleApp name
- ClusterIP type
- Port from spec, targeting the container port
- Selector matches the Deployment's pod labels

## Suggested Structure

```
simpleapp-operator/
├── main.go              ← Entry point, create manager, start controller
├── api/
│   └── v1/
│       └── types.go     ← SimpleApp, SimpleAppSpec, SimpleAppStatus structs
├── controller/
│   ├── reconciler.go    ← Reconcile loop
│   ├── reconciler_test.go ← Tests with fake client
│   ├── deployment.go    ← Build desired Deployment from SimpleApp spec
│   └── service.go       ← Build desired Service from SimpleApp spec
├── config/
│   ├── crd.yaml         ← CustomResourceDefinition
│   └── samples/
│       └── my-web-app.yaml ← Example SimpleApp resource
└── go.mod
```

## Hints

> **Suggested approach:**
>
> 1. Start by installing the CRD and creating a SimpleApp with `kubectl` — verify the API server accepts it
> 2. Set up the controller-runtime manager and a basic reconciler that just logs when it's called
> 3. Add Deployment creation — hardcode the spec first, then read from the SimpleApp
> 4. Add Service creation
> 5. Add status updates — read the Deployment's status and write it back to the SimpleApp
> 6. Add the finalizer and deletion handling
> 7. Add idempotent updates (CreateOrUpdate)
> 8. Add tests with the fake client

### Building the Deployment

```go
func buildDeployment(app *SimpleApp) *appsv1.Deployment {
    labels := map[string]string{
        "app.kubernetes.io/name":       app.Name,
        "app.kubernetes.io/managed-by": "simpleapp-operator",
    }

    return &appsv1.Deployment{
        ObjectMeta: metav1.ObjectMeta{
            Name:      app.Name,
            Namespace: app.Namespace,
        },
        Spec: appsv1.DeploymentSpec{
            Replicas: &app.Spec.Replicas,
            Selector: &metav1.LabelSelector{
                MatchLabels: labels,
            },
            Template: corev1.PodTemplateSpec{
                ObjectMeta: metav1.ObjectMeta{Labels: labels},
                Spec: corev1.PodSpec{
                    Containers: []corev1.Container{{
                        Name:  app.Name,
                        Image: app.Spec.Image,
                        Ports: []corev1.ContainerPort{{
                            ContainerPort: app.Spec.Port,
                        }},
                    }},
                },
            },
        },
    }
}
```

### The Reconcile Function Shape

```go
func (r *SimpleAppReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
    log := log.FromContext(ctx)

    // 1. Fetch the SimpleApp
    var app SimpleApp
    if err := r.Get(ctx, req.NamespacedName, &app); err != nil {
        return ctrl.Result{}, client.IgnoreNotFound(err)
    }

    // 2. Handle deletion
    if !app.DeletionTimestamp.IsZero() {
        // cleanup + remove finalizer
        return ctrl.Result{}, nil
    }

    // 3. Ensure finalizer
    // 4. Create/update Deployment
    // 5. Create/update Service
    // 6. Update status

    return ctrl.Result{}, nil
}
```

## Testing Without a Cluster

You don't need a real cluster for most testing. Use these approaches:

### Fake Client (Unit Tests)

The `controller-runtime` fake client lets you test reconciliation logic without a cluster:

```go
func TestReconcile_CreatesDeployment(t *testing.T) {
    scheme := runtime.NewScheme()
    _ = appsv1.AddToScheme(scheme)
    _ = corev1.AddToScheme(scheme)
    // Register your custom types too

    app := &SimpleApp{
        ObjectMeta: metav1.ObjectMeta{
            Name:      "test-app",
            Namespace: "default",
        },
        Spec: SimpleAppSpec{
            Image:    "nginx:1.25",
            Replicas: 3,
            Port:     80,
        },
    }

    fakeClient := fake.NewClientBuilder().
        WithScheme(scheme).
        WithObjects(app).
        Build()

    reconciler := &SimpleAppReconciler{
        Client: fakeClient,
        Scheme: scheme,
    }

    _, err := reconciler.Reconcile(context.Background(), ctrl.Request{
        NamespacedName: types.NamespacedName{Name: "test-app", Namespace: "default"},
    })
    if err != nil {
        t.Fatal(err)
    }

    // Verify the Deployment was created
    var dep appsv1.Deployment
    err = fakeClient.Get(context.Background(), types.NamespacedName{
        Name: "test-app", Namespace: "default",
    }, &dep)
    if err != nil {
        t.Fatal("expected Deployment to be created")
    }
    if *dep.Spec.Replicas != 3 {
        t.Errorf("replicas = %d, want 3", *dep.Spec.Replicas)
    }
}
```

### envtest (Integration Tests)

`envtest` runs a real API server and etcd locally — no cluster needed:

```go
func TestMain(m *testing.M) {
    testEnv = &envtest.Environment{
        CRDDirectoryPaths: []string{"../config"},
    }
    cfg, err := testEnv.Start()
    // ... set up manager with cfg ...
    code := m.Run()
    testEnv.Stop()
    os.Exit(code)
}
```

### Testing the Build Functions

The Deployment and Service builder functions are pure — test them directly:

```go
func TestBuildDeployment(t *testing.T) {
    app := &SimpleApp{
        ObjectMeta: metav1.ObjectMeta{Name: "web", Namespace: "prod"},
        Spec: SimpleAppSpec{
            Image:    "myapp:v2",
            Replicas: 5,
            Port:     8080,
        },
    }
    dep := buildDeployment(app)
    if dep.Name != "web" {
        t.Errorf("name = %q, want %q", dep.Name, "web")
    }
    if *dep.Spec.Replicas != 5 {
        t.Errorf("replicas = %d, want 5", *dep.Spec.Replicas)
    }
    if dep.Spec.Template.Spec.Containers[0].Image != "myapp:v2" {
        t.Errorf("image = %q, want %q", dep.Spec.Template.Spec.Containers[0].Image, "myapp:v2")
    }
}

func TestBuildService(t *testing.T) {
    app := &SimpleApp{
        ObjectMeta: metav1.ObjectMeta{Name: "web", Namespace: "prod"},
        Spec: SimpleAppSpec{Port: 8080},
    }
    svc := buildService(app)
    if svc.Spec.Ports[0].Port != 8080 {
        t.Errorf("port = %d, want 8080", svc.Spec.Ports[0].Port)
    }
}
```

## Stretch Goals

- **Multiple CRDs:** Add a `SimpleJob` CRD that manages a K8s Job instead of a Deployment
- **Leader election:** Enable leader election so multiple operator replicas can run safely
- **Webhook validation:** Add a validating webhook that rejects invalid SimpleApp specs (e.g., replicas < 0, empty image)
- **Helm chart:** Package the operator as a Helm chart with RBAC, ServiceAccount, and Deployment
- **Metrics:** Expose Prometheus metrics for reconciliation count, duration, and error rate
- **Multi-namespace:** Support watching specific namespaces via a `--namespace` flag, or all namespaces by default

> **Skills Used:** controller-runtime, client-go, Custom Resource Definitions, reconciliation pattern, owner references, finalizers, status subresources, fake client testing, envtest, struct embedding, JSON tags, context propagation, error handling.
