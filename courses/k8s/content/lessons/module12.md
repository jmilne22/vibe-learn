## Namespaces & Resource Management

Namespaces are virtual clusters inside your physical cluster. They partition a single Kubernetes cluster into multiple isolated environments, each with its own set of names, access controls, and resource budgets. Think of them as folders for your Kubernetes objects.

```
                        Physical Cluster
 ┌──────────────────────────────────────────────────────┐
 │                                                      │
 │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
 │  │  Namespace:  │  │  Namespace:  │  │  Namespace:  │  │
 │  │    dev       │  │   staging    │  │    prod      │  │
 │  │             │  │             │  │             │  │
 │  │  Pods       │  │  Pods       │  │  Pods       │  │
 │  │  Services   │  │  Services   │  │  Services   │  │
 │  │  ConfigMaps │  │  ConfigMaps │  │  ConfigMaps │  │
 │  │  Secrets    │  │  Secrets    │  │  Secrets    │  │
 │  │             │  │             │  │             │  │
 │  │  Quota: 4Gi │  │  Quota: 8Gi │  │  Quota:16Gi │  │
 │  └─────────────┘  └─────────────┘  └─────────────┘  │
 │                                                      │
 │  Shared: Nodes, PersistentVolumes, ClusterRoles      │
 └──────────────────────────────────────────────────────┘
```

Namespaces give you three things:

- **Name scoping** — you can have a Service called `api` in both `dev` and `prod` without conflict
- **Access control** — RBAC Roles and RoleBindings are namespace-scoped, so you can give a team access to `team-a` but not `team-b`
- **Resource budgets** — ResourceQuotas and LimitRanges enforce per-namespace limits on CPU, memory, and object counts

> **Gotcha:** Namespaces are **not** security boundaries. By default, a Pod in namespace `dev` can reach a Pod in namespace `prod` over the network. You need NetworkPolicies to restrict cross-namespace traffic. Namespaces are for organization and resource management, not isolation.

### Default Namespaces

Every Kubernetes cluster starts with four namespaces:

```bash
kubectl get namespaces
# NAME              STATUS   AGE
# default           Active   45d
# kube-system       Active   45d
# kube-public       Active   45d
# kube-node-lease   Active   45d
```

| Namespace | Purpose |
|-----------|---------|
| `default` | Where resources land when you don't specify a namespace. Don't use this for real workloads. |
| `kube-system` | Control plane components: API Server, scheduler, controller-manager, CoreDNS, kube-proxy. Hands off. |
| `kube-public` | Readable by all users (including unauthenticated). Contains the `cluster-info` ConfigMap. Rarely used. |
| `kube-node-lease` | Holds Lease objects for each node. The kubelet renews its lease every 10s as a lightweight heartbeat. |

```bash
# See what lives in kube-system
kubectl get pods -n kube-system
# NAME                                     READY   STATUS    RESTARTS   AGE
# coredns-5dd5756b68-abcde                 1/1     Running   0          45d
# coredns-5dd5756b68-fghij                 1/1     Running   0          45d
# etcd-control-plane                       1/1     Running   0          45d
# kube-apiserver-control-plane             1/1     Running   0          45d
# kube-controller-manager-control-plane    1/1     Running   0          45d
# kube-proxy-klmno                         1/1     Running   0          45d
# kube-scheduler-control-plane             1/1     Running   0          45d

# See node leases
kubectl get leases -n kube-node-lease
# NAME           HOLDER         AGE
# node-1         node-1         45d
# node-2         node-2         45d
```

> **Tip:** Never deploy your workloads to `default`. Create purpose-specific namespaces. The `default` namespace makes it easy to accidentally interact with the wrong resources.

### Working with Namespaces

#### Creating Namespaces

*Imperative — quick creation*

```bash
kubectl create namespace dev
# namespace/dev created

kubectl create namespace staging
# namespace/staging created
```

*ns-prod.yaml*

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: prod
  labels:
    environment: production
    team: platform
  annotations:
    owner: "platform-team@company.com"
    cost-center: "CC-1234"
```

```bash
kubectl apply -f ns-prod.yaml
# namespace/prod created
```

#### Setting Your Default Namespace

Instead of typing `-n dev` on every command, set a default:

```bash
# Set default namespace for the current context
kubectl config set-context --current --namespace=dev
# Context "docker-desktop" modified.

# Verify it stuck
kubectl config view --minify | grep namespace
#     namespace: dev

# Now kubectl commands default to 'dev'
kubectl get pods        # shows pods in 'dev', not 'default'
```

> **Tip:** Install `kubens` (part of `kubectx`) for fast namespace switching. `kubens dev` is much quicker than the full `set-context` command.

#### The -n Flag

Every kubectl command accepts `-n <namespace>`:

```bash
kubectl get pods -n prod               # list pods in prod
kubectl get pods -n kube-system        # list system pods
kubectl get pods -A                     # all namespaces
kubectl get pods --all-namespaces       # same as -A

# Apply a resource to a specific namespace
kubectl apply -f deployment.yaml -n staging
```

#### Cross-Namespace Service Access

Pods in one namespace can reach Services in another using the fully qualified DNS name:

```
<service-name>.<namespace>.svc.cluster.local
```

```bash
# Pod in 'dev' namespace calling a Service in 'prod':
curl http://api.prod.svc.cluster.local:8080/healthz
```

#### Deleting Namespaces

```bash
kubectl delete namespace dev
# namespace "dev" deleted
```

> **Gotcha:** Deleting a namespace deletes **everything** inside it — all Pods, Services, Deployments, ConfigMaps, Secrets, the lot. There is no confirmation prompt. There is no undo. In production, protect critical namespaces with RBAC so only cluster admins can delete them.

### Namespace-Scoped vs Cluster-Scoped Resources

Not everything lives in a namespace. Kubernetes resources fall into two categories:

```bash
# Resources that live in a namespace
kubectl api-resources --namespaced=true
# NAME                  SHORTNAMES   APIVERSION   NAMESPACED   KIND
# pods                  po           v1           true         Pod
# services              svc          v1           true         Service
# deployments           deploy       apps/v1      true         Deployment
# configmaps            cm           v1           true         ConfigMap
# secrets                            v1           true         Secret
# roles                              rbac...      true         Role
# rolebindings                       rbac...      true         RoleBinding
# ...

# Resources that are cluster-wide
kubectl api-resources --namespaced=false
# NAME                  SHORTNAMES   APIVERSION   NAMESPACED   KIND
# nodes                 no           v1           false        Node
# namespaces            ns           v1           false        Namespace
# persistentvolumes     pv           v1           false        PersistentVolume
# clusterroles                       rbac...      false        ClusterRole
# clusterrolebindings                rbac...      false        ClusterRoleBinding
# storageclasses        sc           storage...   false        StorageClass
# ...
```

| Scope | Resources | Why |
|-------|-----------|-----|
| **Namespaced** | Pods, Services, Deployments, ConfigMaps, Secrets, Roles, RoleBindings, PVCs, Jobs, Ingress | These belong to a specific team or application |
| **Cluster-scoped** | Nodes, PersistentVolumes, ClusterRoles, ClusterRoleBindings, Namespaces, StorageClasses | These are shared infrastructure managed by admins |

> **Tip:** A common interview question: "Is a PersistentVolume namespaced?" No — PVs are cluster-scoped (shared storage). PersistentVolumeClaims are namespaced (a Pod's request for storage). This separation lets admins provision storage that any namespace can claim.

### Resource Quotas

A ResourceQuota limits the **total** resource consumption for an entire namespace. Without quotas, one team's runaway deployment could consume all cluster resources and starve everyone else.

*quota-dev.yaml*

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: dev-quota
  namespace: dev
spec:
  hard:
    requests.cpu: "4"              # total CPU requests across all pods
    requests.memory: 8Gi           # total memory requests
    limits.cpu: "8"                # total CPU limits
    limits.memory: 16Gi            # total memory limits
    pods: "20"                     # max number of pods
    services: "10"                 # max number of services
    configmaps: "20"               # max number of configmaps
    secrets: "20"                  # max number of secrets
    persistentvolumeclaims: "5"    # max number of PVCs
    requests.storage: 50Gi         # total storage requests
```

```bash
kubectl apply -f quota-dev.yaml
# resourcequota/dev-quota created

kubectl describe quota dev-quota -n dev
# Name:                   dev-quota
# Namespace:              dev
# Resource                Used    Hard
# --------                ----    ----
# configmaps              1       20
# limits.cpu              0       8
# limits.memory           0       16Gi
# persistentvolumeclaims  0       5
# pods                    0       20
# requests.cpu            0       4
# requests.memory         0       8Gi
# requests.storage        0       50Gi
# secrets                 1       20
# services                0       10
```

> **Gotcha:** Once a ResourceQuota is set on a namespace for CPU or memory, **every Pod in that namespace must specify resource requests and limits**. If a Pod doesn't, the API Server rejects it. This is by design — you can't enforce a budget if pods don't declare their costs. Use LimitRanges to auto-inject defaults (covered next).

#### Quota Enforcement in Action

```bash
# With the quota above, try creating a pod without resource requests:
kubectl run nginx --image=nginx -n dev
# Error from server (Forbidden): pods "nginx" is forbidden:
# failed quota: dev-quota: must specify limits.cpu, limits.memory,
# requests.cpu, requests.memory

# This works — resources are specified:
kubectl run nginx --image=nginx -n dev \
  --requests='cpu=100m,memory=128Mi' \
  --limits='cpu=200m,memory=256Mi'
# pod/nginx created

# Check quota usage now
kubectl describe quota dev-quota -n dev
# Resource                Used    Hard
# --------                ----    ----
# limits.cpu              200m    8
# limits.memory           256Mi   16Gi
# pods                    1       20
# requests.cpu            100m    4
# requests.memory         128Mi   8Gi
```

### Limit Ranges

While ResourceQuotas cap the **total** for a namespace, LimitRanges control the **per-Pod** or **per-Container** resource constraints. They set defaults, minimums, and maximums.

*limitrange-dev.yaml*

```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: dev-limits
  namespace: dev
spec:
  limits:
  - type: Container
    default:                       # default limits (if not specified)
      cpu: 200m
      memory: 256Mi
    defaultRequest:                # default requests (if not specified)
      cpu: 100m
      memory: 128Mi
    min:                           # minimum allowed
      cpu: 50m
      memory: 64Mi
    max:                           # maximum allowed
      cpu: "2"
      memory: 2Gi
  - type: Pod
    max:                           # max total for all containers in a pod
      cpu: "4"
      memory: 4Gi
```

```bash
kubectl apply -f limitrange-dev.yaml
# limitrange/dev-limits created

kubectl describe limitrange dev-limits -n dev
# Name:       dev-limits
# Namespace:  dev
# Type        Resource  Min   Max   Default Request  Default Limit
# ----        --------  ---   ---   ---------------  -------------
# Container   cpu       50m   2     100m             200m
# Container   memory    64Mi  2Gi   128Mi            256Mi
# Pod         cpu       -     4     -                -
# Pod         memory    -     4Gi   -                -
```

#### Automatic Default Injection

With the LimitRange above, if you create a Pod without specifying resources, the defaults are injected automatically:

```bash
# Create a pod with no resource specs
kubectl run test --image=nginx -n dev

# Check what was injected
kubectl get pod test -n dev -o yaml | grep -A 6 resources
#     resources:
#       limits:
#         cpu: 200m
#         memory: 256Mi
#       requests:
#         cpu: 100m
#         memory: 128Mi
```

The LimitRange also enforces boundaries:

```bash
# Try to exceed the max
kubectl run greedy --image=nginx -n dev \
  --requests='cpu=100m,memory=128Mi' \
  --limits='cpu=4,memory=8Gi'
# Error from server (Forbidden): pods "greedy" is forbidden:
# [maximum cpu usage per Container is 2, but limit is 4,
#  maximum memory usage per Container is 2Gi, but limit is 8Gi]
```

> **Tip:** Use LimitRanges and ResourceQuotas together. LimitRanges inject defaults so Pods always have resource specs (satisfying the quota requirement). ResourceQuotas cap the namespace total. They are complementary.

### Labels, Selectors, and Annotations

Labels, selectors, and annotations are the metadata system that ties Kubernetes together. Services find Pods by labels. Deployments manage ReplicaSets by labels. You filter kubectl output by labels.

#### Labels

Labels are key/value pairs attached to objects for identification and grouping:

*labeled-deployment.yaml*

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  labels:
    app: api
    version: "2.1"
    tier: backend
    environment: production
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
        version: "2.1"
        tier: backend
        environment: production
    spec:
      containers:
      - name: api
        image: myapp/api:2.1
        ports:
        - containerPort: 8080
```

*Working with labels imperatively*

```bash
# Add a label to an existing pod
kubectl label pod nginx tier=frontend
# pod/nginx labeled

# Update an existing label (requires --overwrite)
kubectl label pod nginx tier=backend --overwrite
# pod/nginx labeled

# Remove a label (use the minus sign)
kubectl label pod nginx tier-
# pod/nginx unlabeled

# Show labels in output
kubectl get pods --show-labels
# NAME    READY   STATUS    RESTARTS   AGE   LABELS
# api-1   1/1     Running   0          5m    app=api,tier=backend,version=2.1
# web-1   1/1     Running   0          5m    app=web,tier=frontend,version=1.0
```

#### Kubernetes Recommended Labels

Kubernetes defines a standard set of labels under the `app.kubernetes.io` prefix. Using these makes your resources work well with tools like Helm, ArgoCD, and the Kubernetes dashboard:

```yaml
metadata:
  labels:
    app.kubernetes.io/name: api-server       # the application name
    app.kubernetes.io/instance: api-prod     # unique instance of the app
    app.kubernetes.io/version: "2.1.0"       # the application version
    app.kubernetes.io/component: backend     # component within the architecture
    app.kubernetes.io/part-of: online-store  # higher-level application this belongs to
    app.kubernetes.io/managed-by: helm       # tool managing this resource
```

#### Selectors

Selectors query objects by their labels. They come in two flavors:

*Equality-based selectors*

```bash
kubectl get pods -l app=api                      # equals
kubectl get pods -l app!=web                     # not equals
kubectl get pods -l app=api,tier=backend         # AND (comma-separated)
```

*Set-based selectors*

```bash
kubectl get pods -l 'app in (api, web)'          # value in set
kubectl get pods -l 'app notin (test, canary)'   # value not in set
kubectl get pods -l '!canary'                     # label key doesn't exist
kubectl get pods -l 'environment'                 # label key exists
```

Selectors are used everywhere in Kubernetes manifests:

```yaml
# Service routes to Pods matching this selector
spec:
  selector:
    app: api
    tier: backend

# Deployment manages Pods matching this selector
spec:
  selector:
    matchLabels:
      app: api
    matchExpressions:                  # set-based (optional)
    - key: environment
      operator: In
      values: [production, staging]
```

#### Annotations

Annotations hold non-identifying metadata — information that's useful but not for selection. Controllers, tools, and humans read annotations:

*annotated-deployment.yaml*

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  annotations:
    # Build and release info
    build.company.com/git-sha: "a1b2c3d4e5f6"
    build.company.com/pipeline: "ci-pipeline-789"
    build.company.com/timestamp: "2025-01-31T10:30:00Z"

    # Operational info
    oncall.company.com/team: "backend-team"
    oncall.company.com/slack: "#backend-alerts"

    # Tool configuration
    prometheus.io/scrape: "true"
    prometheus.io/port: "9090"
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  # ...
```

```bash
# Add an annotation imperatively
kubectl annotate deployment api build.company.com/git-sha="a1b2c3d"
# deployment.apps/api annotated

# View annotations
kubectl describe deployment api | grep -A 5 Annotations
# Annotations:  build.company.com/git-sha: a1b2c3d
#               prometheus.io/scrape: true

# Remove an annotation
kubectl annotate deployment api build.company.com/git-sha-
```

> **Labels vs Annotations:** If you need to select or filter by it, make it a label. If it's informational metadata, a config value for a controller, or too long for a label (labels max at 63 characters for values), make it an annotation.

### Namespace Strategies

How you organize namespaces depends on your team size, deployment model, and compliance requirements. Here are the common patterns:

#### Per Environment

```bash
kubectl create namespace dev
kubectl create namespace staging
kubectl create namespace production
```

```
dev         → developers experiment, loose quotas
staging     → pre-production, mirrors prod config
production  → real traffic, strict quotas and RBAC
```

Best for: small-to-medium teams, simple deployment pipelines.

#### Per Team

```bash
kubectl create namespace team-frontend
kubectl create namespace team-backend
kubectl create namespace team-data
```

Each team gets their own namespace with dedicated quotas and RBAC. Teams manage their own resources independently.

Best for: larger organizations where teams need autonomy.

#### Per Application

```bash
kubectl create namespace payment-service
kubectl create namespace user-service
kubectl create namespace notification-service
```

Best for: microservice architectures where each service has its own lifecycle.

#### Hybrid Approach

Combine strategies with naming conventions:

```bash
kubectl create namespace team-backend-dev
kubectl create namespace team-backend-staging
kubectl create namespace team-backend-prod
kubectl create namespace team-frontend-dev
kubectl create namespace team-frontend-prod
```

> **Tip:** Use labels on namespaces to enable policy-based management:

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: team-backend-prod
  labels:
    team: backend
    environment: production
    cost-center: CC-5678
```

#### Namespaces vs Separate Clusters

| Consideration | Namespaces | Separate Clusters |
|--------------|------------|-------------------|
| Isolation | Logical (same API server, shared nodes) | Physical (separate everything) |
| Network | Pods can talk across namespaces by default | Complete network isolation |
| Blast radius | Bad config can affect the whole cluster | Contained to one cluster |
| Cost | One cluster = lower overhead | Multiple clusters = higher overhead |
| Management | Easier — one kubeconfig | Harder — multiple clusters to maintain |
| Compliance | May not satisfy strict regulatory requirements | Meets strict isolation requirements |

**Rule of thumb:** Use namespaces for teams and environments within a trust boundary. Use separate clusters when you need hard isolation (multi-tenant SaaS, regulatory compliance, or completely separate failure domains like dev vs. prod).

### Hands-On: Multi-Namespace Setup

Let's put it all together. We'll create two namespaces with quotas and limit ranges, deploy applications, and see quota enforcement.

#### Step 1: Create Namespaces

*ns-dev.yaml*

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: dev
  labels:
    environment: development
---
apiVersion: v1
kind: Namespace
metadata:
  name: prod
  labels:
    environment: production
```

```bash
kubectl apply -f ns-dev.yaml
# namespace/dev created
# namespace/prod created
```

#### Step 2: Apply Resource Quotas

*quota-both.yaml*

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: compute-quota
  namespace: dev
spec:
  hard:
    requests.cpu: "2"
    requests.memory: 4Gi
    limits.cpu: "4"
    limits.memory: 8Gi
    pods: "10"
---
apiVersion: v1
kind: ResourceQuota
metadata:
  name: compute-quota
  namespace: prod
spec:
  hard:
    requests.cpu: "8"
    requests.memory: 16Gi
    limits.cpu: "16"
    limits.memory: 32Gi
    pods: "50"
```

```bash
kubectl apply -f quota-both.yaml
# resourcequota/compute-quota created
# resourcequota/compute-quota created
```

#### Step 3: Apply Limit Ranges

*limitrange-both.yaml*

```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: default-limits
  namespace: dev
spec:
  limits:
  - type: Container
    default:
      cpu: 200m
      memory: 256Mi
    defaultRequest:
      cpu: 100m
      memory: 128Mi
    max:
      cpu: "1"
      memory: 1Gi
---
apiVersion: v1
kind: LimitRange
metadata:
  name: default-limits
  namespace: prod
spec:
  limits:
  - type: Container
    default:
      cpu: 500m
      memory: 512Mi
    defaultRequest:
      cpu: 250m
      memory: 256Mi
    max:
      cpu: "2"
      memory: 2Gi
```

```bash
kubectl apply -f limitrange-both.yaml
# limitrange/default-limits created
# limitrange/default-limits created
```

#### Step 4: Deploy to Both Namespaces

*app-deploy.yaml*

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels:
    app: web
    app.kubernetes.io/name: web
    app.kubernetes.io/component: frontend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
        app.kubernetes.io/name: web
        app.kubernetes.io/component: frontend
      annotations:
        build.company.com/git-sha: "f4e5d6c7"
    spec:
      containers:
      - name: nginx
        image: nginx:1.25
        ports:
        - containerPort: 80
```

```bash
# Deploy to dev — LimitRange auto-injects defaults
kubectl apply -f app-deploy.yaml -n dev
# deployment.apps/web created

# Deploy to prod
kubectl apply -f app-deploy.yaml -n prod
# deployment.apps/web created

# Check pods in both namespaces
kubectl get pods -n dev
# NAME                   READY   STATUS    RESTARTS   AGE
# web-7d4b8c6f5-abc12    1/1     Running   0          30s
# web-7d4b8c6f5-def34    1/1     Running   0          30s
# web-7d4b8c6f5-ghi56    1/1     Running   0          30s

kubectl get pods -n prod
# NAME                   READY   STATUS    RESTARTS   AGE
# web-7d4b8c6f5-jkl78    1/1     Running   0          25s
# web-7d4b8c6f5-mno90    1/1     Running   0          25s
# web-7d4b8c6f5-pqr12    1/1     Running   0          25s
```

#### Step 5: Verify Quota Usage

```bash
kubectl describe quota compute-quota -n dev
# Name:            compute-quota
# Namespace:       dev
# Resource         Used    Hard
# --------         ----    ----
# limits.cpu       600m    4
# limits.memory    768Mi   8Gi
# pods             3       10
# requests.cpu     300m    2
# requests.memory  384Mi   4Gi

kubectl describe quota compute-quota -n prod
# Name:            compute-quota
# Namespace:       prod
# Resource         Used     Hard
# --------         ----     ----
# limits.cpu       1500m    16
# limits.memory    1536Mi   32Gi
# pods             3        50
# requests.cpu     750m     8
# requests.memory  768Mi    16Gi
```

#### Step 6: Exceed the Quota

```bash
# Try to scale dev beyond its quota
kubectl scale deployment web --replicas=20 -n dev
# deployment.apps/web scaled

# But not all pods will schedule
kubectl get pods -n dev
# NAME                   READY   STATUS    RESTARTS   AGE
# web-7d4b8c6f5-abc12    1/1     Running   0          5m
# web-7d4b8c6f5-def34    1/1     Running   0          5m
# web-7d4b8c6f5-ghi56    1/1     Running   0          5m
# ...only 10 running (pod quota) and CPU/memory quota kicks in

kubectl describe quota compute-quota -n dev
# Resource         Used    Hard
# --------         ----    ----
# pods             10      10       ← at the limit
# requests.cpu     1000m   2
# requests.memory  1280Mi  4Gi

# Check ReplicaSet events for the quota error
kubectl describe rs -n dev | grep -A 3 "Events"
# Events:
#   Type     Reason            Age   Message
#   Warning  FailedCreate      10s   Error creating: pods "web-7d4b8c6f5-xyz"
#            is forbidden: exceeded quota: compute-quota

# Scale back down
kubectl scale deployment web --replicas=3 -n dev
```

#### Clean Up

```bash
kubectl delete namespace dev prod
# namespace "dev" deleted
# namespace "prod" deleted
# (everything inside both namespaces is gone)
```

## Exercises

Progress through each section in order, or jump to where you need practice.

Practice individual concepts you just learned.

<div id="warmups-container">
            <noscript><p class="js-required">JavaScript is required for the interactive exercises.</p></noscript>
            </div>

### 💪 Challenges

Combine concepts and learn patterns. Each challenge has multiple variants at different difficulties.

<div id="challenges-container">
            <noscript><p class="js-required">JavaScript is required for the interactive exercises.</p></noscript>
            </div>

## Module 12 Summary

- **Namespaces** are virtual clusters — they scope names, RBAC, and resource budgets, but are not security boundaries
- **Four default namespaces:** `default` (don't use for workloads), `kube-system` (control plane), `kube-public` (rarely used), `kube-node-lease` (node heartbeats)
- **Create namespaces** with `kubectl create namespace` or YAML manifests; set defaults with `kubectl config set-context --current --namespace=`
- **Deleting a namespace deletes everything in it** — there's no undo
- **Namespaced resources** (Pods, Services, Deployments) vs **cluster-scoped** (Nodes, PVs, ClusterRoles) — check with `kubectl api-resources --namespaced=true/false`
- **ResourceQuotas** cap total CPU, memory, and object counts per namespace; once set, all Pods must declare resource requests and limits
- **LimitRanges** set per-container defaults, minimums, and maximums — they auto-inject defaults so Pods satisfy quota requirements
- **Labels** are for identification and selection (`-l app=web`); **annotations** are for non-identifying metadata (build info, tool config)
- **Kubernetes recommended labels** (`app.kubernetes.io/*`) work with Helm, dashboards, and other ecosystem tools
- **Selectors** come in equality-based (`app=web`) and set-based (`app in (web, api)`) flavors
- **Namespace strategies:** per-environment, per-team, per-application, or hybrid — use separate clusters when you need hard isolation
- **Cross-namespace DNS:** `<service>.<namespace>.svc.cluster.local`
