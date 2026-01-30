## kubectl Cheat Sheet

### Create & Apply

*Imperative (quick testing)*

```bash
kubectl run nginx --image=nginx:1.25
kubectl create deployment web --image=nginx --replicas=3
kubectl expose deployment web --port=80 --type=NodePort
kubectl delete pod nginx
```

*Declarative (production)*

```bash
kubectl apply -f deployment.yaml
kubectl apply -f ./manifests/           # apply whole directory
kubectl apply -f https://example.com/manifest.yaml
kubectl delete -f deployment.yaml
```

> **Rule:** Use `apply` for anything you care about. It creates if missing, updates if it exists, and tracks changes via the `last-applied-configuration` annotation. `create` fails if the resource already exists.

### Inspect & Debug

*Viewing resources*

```bash
kubectl get pods                        # list pods in current namespace
kubectl get pods -A                     # all namespaces
kubectl get pods -o wide                # show node, IP
kubectl get pods -o yaml                # full YAML output
kubectl get pods -l app=web             # filter by label
kubectl get pods --sort-by=.status.startTime
kubectl get all                         # pods, services, deployments, etc.
```

*Detailed info*

```bash
kubectl describe pod nginx              # events, conditions, volumes
kubectl logs nginx                      # container stdout
kubectl logs nginx --previous           # logs from crashed container
kubectl logs nginx -c sidecar           # specific container
kubectl logs -f nginx                   # follow (tail -f)
kubectl logs -l app=web --all-containers
```

*Interactive debugging*

```bash
kubectl exec -it nginx -- /bin/sh       # shell into container
kubectl exec nginx -- cat /etc/hostname # run single command
kubectl port-forward pod/nginx 8080:80  # localhost:8080 → pod:80
kubectl port-forward svc/web 8080:80    # forward to service
kubectl debug pod/nginx --image=busybox --target=nginx
kubectl top pods                        # CPU/memory usage
kubectl top nodes
```

### Deployments & Rollouts

*Managing rollouts*

```bash
kubectl rollout status deployment/web
kubectl rollout history deployment/web
kubectl rollout undo deployment/web                     # previous version
kubectl rollout undo deployment/web --to-revision=2     # specific version
kubectl rollout restart deployment/web                  # trigger redeploy
kubectl scale deployment/web --replicas=5
kubectl autoscale deployment/web --min=2 --max=10 --cpu-percent=80
```

### Context & Namespace

*Switching contexts*

```bash
kubectl config get-contexts             # list all contexts
kubectl config current-context          # show active context
kubectl config use-context my-cluster   # switch context
kubectl config set-context --current --namespace=prod   # set default ns
```

> **Tip:** Install `kubens` and `kubectx` to switch namespaces and contexts faster. `kubens prod` is much shorter than the full command above.

### Dry Run & Diffing

*Preview before applying*

```bash
# Client-side: generates YAML without sending to API server
kubectl create deployment web --image=nginx --dry-run=client -o yaml

# Server-side: validates against API server (admission controllers run)
kubectl apply -f deployment.yaml --dry-run=server

# Diff: shows what would change
kubectl diff -f deployment.yaml
```

## Resource Kinds Reference

### Core Resources (API group: v1)

| Kind | Short | What it is |
|------|-------|-----------|
| Pod | po | Smallest deployable unit — one or more containers |
| Service | svc | Stable network endpoint for a set of Pods |
| ConfigMap | cm | Non-sensitive configuration data |
| Secret | — | Sensitive data (base64-encoded, not encrypted by default) |
| Namespace | ns | Logical isolation within a cluster |
| PersistentVolume | pv | Cluster-wide storage resource |
| PersistentVolumeClaim | pvc | Request for storage by a Pod |
| ServiceAccount | sa | Identity for Pods to authenticate to the API |
| Node | no | A worker machine in the cluster |
| Endpoints | ep | IP addresses backing a Service |

### Workloads (API group: apps/v1)

| Kind | Short | What it is |
|------|-------|-----------|
| Deployment | deploy | Manages ReplicaSets for stateless apps |
| ReplicaSet | rs | Ensures N Pod replicas are running |
| StatefulSet | sts | Like Deployment but with stable identity and storage |
| DaemonSet | ds | Runs one Pod per node |

### Batch (API group: batch/v1)

| Kind | Short | What it is |
|------|-------|-----------|
| Job | — | Runs Pods to completion |
| CronJob | cj | Runs Jobs on a schedule |

### Networking (API group: networking.k8s.io/v1)

| Kind | Short | What it is |
|------|-------|-----------|
| Ingress | ing | HTTP/HTTPS routing rules (being replaced by Gateway API) |
| NetworkPolicy | netpol | Firewall rules for Pod-to-Pod traffic |
| IngressClass | — | Defines which controller handles Ingress resources |

### RBAC (API group: rbac.authorization.k8s.io/v1)

| Kind | Short | What it is |
|------|-------|-----------|
| Role | — | Permissions within a namespace |
| ClusterRole | — | Cluster-wide permissions |
| RoleBinding | — | Binds a Role to users/ServiceAccounts |
| ClusterRoleBinding | — | Binds a ClusterRole cluster-wide |

### Storage (API group: storage.k8s.io/v1)

| Kind | Short | What it is |
|------|-------|-----------|
| StorageClass | sc | Defines how PVs are dynamically provisioned |

### Autoscaling (API group: autoscaling/v2)

| Kind | Short | What it is |
|------|-------|-----------|
| HorizontalPodAutoscaler | hpa | Scales replicas based on metrics |

## Common Labels & Annotations

### Recommended Labels

```yaml
metadata:
  labels:
    app.kubernetes.io/name: nginx           # application name
    app.kubernetes.io/instance: web-prod    # instance of the app
    app.kubernetes.io/version: "1.25"       # app version
    app.kubernetes.io/component: frontend   # component within architecture
    app.kubernetes.io/part-of: myapp        # higher-level application
    app.kubernetes.io/managed-by: helm      # tool managing this resource
```

### Common Annotations

```yaml
metadata:
  annotations:
    # Ingress controller config
    nginx.ingress.kubernetes.io/rewrite-target: /
    nginx.ingress.kubernetes.io/ssl-redirect: "true"

    # Prometheus scraping
    prometheus.io/scrape: "true"
    prometheus.io/port: "9090"
    prometheus.io/path: /metrics

    # Helm tracking
    meta.helm.sh/release-name: my-release
    meta.helm.sh/release-namespace: default
```

> **Labels vs Annotations:** Labels are for selection (Services find Pods by label). Annotations are for metadata (build info, config for controllers). If you need to `kubectl get -l`, it's a label. If it's just informational or for a controller, it's an annotation.

## YAML Gotchas

### Indentation

YAML uses spaces, never tabs. Indentation matters — it defines structure.

*Wrong — inconsistent indent*

```yaml
spec:
  containers:
  - name: nginx
      image: nginx    # ERROR: "image" is indented too far
```

*Right*

```yaml
spec:
  containers:
  - name: nginx
    image: nginx      # same level as "name"
```

### Strings That Look Like Other Types

```yaml
# These are NOT strings — YAML parses them as booleans/numbers:
enabled: true        # boolean
replicas: 3          # integer
version: 1.25        # float (not string "1.25"!)

# Quote when you mean string:
version: "1.25"      # string
nodePort: "30080"    # string
enabled: "true"      # string
```

> **Gotcha:** `version: 1.10` becomes `1.1` (float). Always quote version strings: `version: "1.10"`.

### Multi-line Strings

```yaml
# Literal block (preserves newlines):
data: |
  line 1
  line 2
  line 3

# Folded block (joins lines with spaces):
description: >
  This is a long description
  that gets folded into
  a single line.

# Literal block, strip trailing newline:
script: |-
  #!/bin/sh
  echo "hello"
  exit 0
```

### The Dash Trap

```yaml
# List of objects (each - starts a new item):
containers:
- name: app          # first container
  image: myapp:v1
- name: sidecar      # second container
  image: envoy:v1

# NOT the same as (this is one object with extra indent):
containers:
  - name: app
    image: myapp:v1
```

## Common Patterns

### Generate YAML Instead of Writing From Scratch

```bash
# Generate a Deployment YAML:
kubectl create deployment web --image=nginx --replicas=3 \
  --dry-run=client -o yaml > deployment.yaml

# Generate a Service YAML:
kubectl expose deployment web --port=80 --type=ClusterIP \
  --dry-run=client -o yaml > service.yaml

# Generate a Job YAML:
kubectl create job backup --image=busybox \
  --dry-run=client -o yaml -- /bin/sh -c "echo done" > job.yaml
```

> **Tip:** Never write manifests from scratch. Use `--dry-run=client -o yaml` to generate a starting point, then edit. This avoids typos in apiVersion, kind, and spec structure.

### Quick Port Forwarding for Debugging

```bash
# Forward to a specific pod
kubectl port-forward pod/postgres-0 5432:5432

# Forward to a service (picks a random backend pod)
kubectl port-forward svc/grafana 3000:3000

# Forward on all interfaces (not just localhost)
kubectl port-forward --address 0.0.0.0 svc/grafana 3000:3000
```

### Watch Resources Change in Real Time

```bash
kubectl get pods -w                      # watch mode
kubectl get events -w --sort-by=.lastTimestamp
kubectl rollout status deployment/web    # blocks until complete
```

## API Version Quick Reference

| Resource | apiVersion |
|----------|-----------|
| Pod, Service, ConfigMap, Secret, Namespace, PV, PVC | `v1` |
| Deployment, ReplicaSet, StatefulSet, DaemonSet | `apps/v1` |
| Job, CronJob | `batch/v1` |
| Ingress, NetworkPolicy | `networking.k8s.io/v1` |
| Role, ClusterRole, RoleBinding, ClusterRoleBinding | `rbac.authorization.k8s.io/v1` |
| HorizontalPodAutoscaler | `autoscaling/v2` |
| StorageClass | `storage.k8s.io/v1` |
| PodDisruptionBudget | `policy/v1` |

> **Can't remember?** `kubectl api-resources` shows all resource types with their API groups and short names. `kubectl explain deployment.spec` shows the schema for any field.
