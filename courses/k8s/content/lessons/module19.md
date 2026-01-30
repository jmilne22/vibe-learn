## Deployment Strategies

Every application eventually needs an update. The question isn't whether you'll deploy new versions — it's how you'll do it without breaking things for your users. Kubernetes gives you several strategies, from simple rolling updates to sophisticated canary releases, each with different trade-offs around downtime, safety, and resource cost.

```
Strategy Spectrum: Safety vs. Speed

 Recreate           Rolling Update        Blue-Green           Canary
    │                    │                    │                   │
    ▼                    ▼                    ▼                   ▼
 Simple,             Default,             Zero-downtime,       Gradual,
 has downtime        zero-downtime        instant rollback     metric-driven

 ◄──────────────────────────────────────────────────────────────────►
 Less complex                                          More complex
```

This module covers all of them — when to use each, how to implement them, and how to protect your cluster during any deployment.

## Rolling Updates (Deep Dive)

Rolling updates are the default Deployment strategy. Kubernetes gradually replaces old Pods with new ones, keeping the application available throughout.

```
Rolling Update — step by step (3 replicas, maxSurge=1, maxUnavailable=0)

 Start:     [v1] [v1] [v1]              ← 3 old Pods running
 Step 1:    [v1] [v1] [v1] [v2]         ← 1 new Pod created (surge)
 Step 2:    [v1] [v1] [──] [v2]         ← 1 old Pod terminated
 Step 3:    [v1] [v1] [v2] [v2]         ← 2nd new Pod created
 Step 4:    [v1] [──] [v2] [v2]         ← 2nd old Pod terminated
 Step 5:    [v1] [v2] [v2] [v2]         ← 3rd new Pod created
 Step 6:    [──] [v2] [v2] [v2]         ← last old Pod terminated
 Done:      [v2] [v2] [v2]              ← all Pods updated
```

### Controlling Rollout Speed

Two fields control how aggressive the rollout is:

- **maxSurge** — how many extra Pods can exist above the desired count during the update
- **maxUnavailable** — how many Pods can be unavailable during the update

Both accept an absolute number or a percentage of replicas.

*rolling-deployment.yaml*

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-app
spec:
  replicas: 4
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1              # at most 5 Pods total (4 + 1)
      maxUnavailable: 0        # all 4 must stay available
  selector:
    matchLabels:
      app: web-app
  template:
    metadata:
      labels:
        app: web-app
    spec:
      containers:
      - name: app
        image: myapp:2.0
        ports:
        - containerPort: 8080
        readinessProbe:
          httpGet:
            path: /healthz
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5
```

### Common maxSurge / maxUnavailable Combinations

| Setting | Behavior | Use Case |
|---------|----------|----------|
| `maxSurge: 1, maxUnavailable: 0` | Safest, slowest. Never fewer Pods than desired. | Production APIs with tight SLOs |
| `maxSurge: 25%, maxUnavailable: 25%` | Kubernetes default. Balanced speed and safety. | Most workloads |
| `maxSurge: 0, maxUnavailable: 1` | No extra resources. Kills one, starts one. | Resource-constrained clusters |
| `maxSurge: 100%, maxUnavailable: 0` | Blue-green-like. Creates all new Pods first, then kills old. | When you want instant cutover |

> **Gotcha:** `maxSurge: 0` and `maxUnavailable: 0` is invalid — the rollout would never make progress because it can't create new Pods (no surge) and can't remove old ones (none unavailable). Kubernetes rejects this combination.

### minReadySeconds

By default, Kubernetes considers a new Pod ready the instant its readiness probe passes. `minReadySeconds` adds a mandatory wait time — the Pod must stay Ready for this many seconds before the rollout continues.

```yaml
spec:
  minReadySeconds: 30          # Pod must be Ready for 30s before proceeding
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
```

This catches Pods that pass the initial health check but crash shortly after (e.g., due to a memory leak or bad config that only manifests under load). Without `minReadySeconds`, the rollout would race ahead, replacing all Pods before you notice the problem.

> **Tip:** Set `minReadySeconds` to at least the time it takes your application to fully warm up — load caches, establish database connections, compile JIT code. A value of 10-60 seconds is common for web services.

### progressDeadlineSeconds

If the rollout stalls (new Pods keep failing, never becoming Ready), how long should Kubernetes wait before declaring it stuck?

```yaml
spec:
  progressDeadlineSeconds: 600   # 10 minutes (default)
```

```bash
# When a rollout exceeds the deadline:
kubectl rollout status deployment/web-app
# error: deployment "web-app" exceeded its progress deadline

kubectl get deployment web-app
# NAME      READY   UP-TO-DATE   AVAILABLE   AGE
# web-app   3/4     2            3           15m

# The condition is set on the Deployment
kubectl get deployment web-app -o jsonpath='{.status.conditions[?(@.type=="Progressing")].message}'
# ReplicaSet "web-app-6b8f7d9c4" has timed out progressing.
```

> **Tip:** The progress deadline timer resets every time the rollout makes any progress (a new Pod becomes Ready). It only triggers when the rollout is completely stuck. Setting it too low causes false alarms during slow image pulls.

### Monitoring a Rolling Update

```bash
# Watch the rollout in real time
kubectl rollout status deployment/web-app
# Waiting for deployment "web-app" rollout to finish: 1 out of 4 new replicas have been updated...
# Waiting for deployment "web-app" rollout to finish: 2 out of 4 new replicas have been updated...
# Waiting for deployment "web-app" rollout to finish: 3 out of 4 new replicas have been updated...
# Waiting for deployment "web-app" rollout to finish: 4 out of 4 new replicas have been updated...
# deployment "web-app" successfully rolled out

# Check rollout history
kubectl rollout history deployment/web-app
# REVISION  CHANGE-CAUSE
# 1         <none>
# 2         <none>

# Undo if something is wrong
kubectl rollout undo deployment/web-app
# deployment.apps/web-app rolled back

# Undo to a specific revision
kubectl rollout undo deployment/web-app --to-revision=1
```

## Recreate Strategy

The Recreate strategy is the simplest: kill all old Pods, then create all new Pods. There is downtime between the teardown and the startup.

```
Recreate — step by step (3 replicas)

 Start:     [v1] [v1] [v1]              ← 3 old Pods running
 Step 1:    [──] [──] [──]              ← ALL old Pods terminated (DOWNTIME)
 Step 2:    [v2] [v2] [v2]              ← ALL new Pods created
 Done:      [v2] [v2] [v2]              ← service restored
```

*recreate-deployment.yaml*

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: legacy-app
spec:
  replicas: 1
  strategy:
    type: Recreate              # no rollingUpdate section needed
  selector:
    matchLabels:
      app: legacy-app
  template:
    metadata:
      labels:
        app: legacy-app
    spec:
      containers:
      - name: app
        image: legacy-app:2.0
        ports:
        - containerPort: 5000
```

### When to Use Recreate

| Scenario | Why Recreate? |
|----------|---------------|
| Single-instance databases | Only one Pod can mount a RWO volume at a time |
| Schema migrations on startup | New version requires DB schema changes that break old version |
| Incompatible API versions | v1 and v2 Pods cannot coexist (different protocols, formats) |
| GPU workloads | Limited GPU resources, can't run old and new simultaneously |
| License-limited software | License allows only N instances running at once |

> **Gotcha:** Recreate causes downtime. Never use it for user-facing services unless downtime is acceptable (scheduled maintenance windows). For everything else, use RollingUpdate or one of the advanced strategies below.

## Blue-Green Deployments

Blue-green keeps two identical environments. "Blue" is the current production version, "green" is the new version. You deploy green alongside blue, test it, then switch traffic instantly by changing the Service selector.

```
Blue-Green Deployment

 ┌──────────────────────────────────────────────────┐
 │                   Service                         │
 │            selector: version=blue                 │
 │                      │                            │
 │          ┌───────────┴───────────┐                │
 │          ▼                       ▼                │
 │   ┌─────────────┐        ┌─────────────┐         │
 │   │ Deployment  │        │ Deployment  │         │
 │   │   (blue)    │        │   (green)   │         │
 │   │  version=   │        │  version=   │         │
 │   │   blue      │        │   green     │         │
 │   │  app:v1     │        │  app:v2     │         │
 │   └─────────────┘        └─────────────┘         │
 │     ▲ traffic               (idle, testing)      │
 └──────────────────────────────────────────────────┘

 After switch:  selector: version=green
     Traffic ──────────────────────────▶ green
```

### Implementation: Two Deployments, One Service

*blue-deployment.yaml*

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app-blue
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web
      version: blue
  template:
    metadata:
      labels:
        app: web
        version: blue
    spec:
      containers:
      - name: app
        image: myapp:1.0
        ports:
        - containerPort: 8080
```

*green-deployment.yaml*

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app-green
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web
      version: green
  template:
    metadata:
      labels:
        app: web
        version: green
    spec:
      containers:
      - name: app
        image: myapp:2.0
        ports:
        - containerPort: 8080
```

*service.yaml*

```yaml
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  selector:
    app: web
    version: blue              # points to blue initially
  ports:
  - port: 80
    targetPort: 8080
```

### Step-by-Step Blue-Green Process

```bash
# Step 1: Blue is live, serving traffic
kubectl get pods -l app=web
# NAME                        READY   STATUS    RESTARTS   AGE
# app-blue-5d8f7c9b4-abc12   1/1     Running   0          2d
# app-blue-5d8f7c9b4-def34   1/1     Running   0          2d
# app-blue-5d8f7c9b4-ghi56   1/1     Running   0          2d

# Step 2: Deploy green (does NOT receive traffic yet)
kubectl apply -f green-deployment.yaml

kubectl get pods -l app=web
# NAME                         READY   STATUS    RESTARTS   AGE
# app-blue-5d8f7c9b4-abc12    1/1     Running   0          2d
# app-blue-5d8f7c9b4-def34    1/1     Running   0          2d
# app-blue-5d8f7c9b4-ghi56    1/1     Running   0          2d
# app-green-7f6e8a3c2-jkl78   1/1     Running   0          30s
# app-green-7f6e8a3c2-mno90   1/1     Running   0          30s
# app-green-7f6e8a3c2-pqr12   1/1     Running   0          30s

# Step 3: Test green directly (port-forward or internal DNS)
kubectl port-forward deployment/app-green 9090:8080
# In another terminal:
curl http://localhost:9090/healthz
# {"status":"ok","version":"2.0"}

# Step 4: Switch traffic — patch the Service selector
kubectl patch svc web -p '{"spec":{"selector":{"version":"green"}}}'
# service/web patched

# Step 5: Verify traffic reaches green
kubectl describe svc web | grep Selector
# Selector: app=web,version=green

curl http://web-service-url/
# Response from v2.0

# Step 6: (Optional) Keep blue for fast rollback or tear it down
# Rollback — just switch back to blue:
kubectl patch svc web -p '{"spec":{"selector":{"version":"blue"}}}'

# Once confident, clean up blue:
kubectl delete deployment app-blue
```

### Blue-Green Pros and Cons

| Advantage | Disadvantage |
|-----------|--------------|
| Instant traffic switch | Double the resources during deployment |
| Full testing before users see changes | Both versions must use compatible DB schema |
| Instant rollback (switch selector back) | Requires careful coordination of stateful components |
| No mixed traffic (all users see the same version) | More YAML to manage |

> **Tip:** Blue-green works best for stateless services. If your app uses a database, both versions must be compatible with the current schema. Expand-and-contract schema migrations (add new columns first, migrate data, remove old columns later) are essential for blue-green with databases.

## Canary Deployments

A canary deployment routes a small percentage of traffic to the new version while the majority continues hitting the old version. If the canary looks healthy (low error rate, good latency), you gradually increase the percentage until 100% is on the new version.

```
Canary — traffic split

 ┌──────────────────────────────────────────┐
 │                Service                    │
 │          selector: app=web                │
 │                 │                         │
 │    ┌────────────┴────────────┐            │
 │    ▼                         ▼            │
 │  ┌──────────────┐    ┌──────────────┐     │
 │  │ Deployment   │    │ Deployment   │     │
 │  │   (stable)   │    │  (canary)    │     │
 │  │ replicas: 9  │    │ replicas: 1  │     │
 │  │ app=web      │    │ app=web      │     │
 │  │ myapp:1.0    │    │ myapp:2.0    │     │
 │  └──────────────┘    └──────────────┘     │
 │    ~90% traffic        ~10% traffic       │
 └──────────────────────────────────────────┘
```

### Native Kubernetes Canary (Replica Ratio)

The simplest canary uses two Deployments with the same labels. The Service distributes traffic across all matching Pods, so the ratio of replicas controls the traffic split.

*stable-deployment.yaml*

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app-stable
spec:
  replicas: 9
  selector:
    matchLabels:
      app: web
      track: stable
  template:
    metadata:
      labels:
        app: web                # shared label — Service selects this
        track: stable
    spec:
      containers:
      - name: app
        image: myapp:1.0
        ports:
        - containerPort: 8080
```

*canary-deployment.yaml*

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app-canary
spec:
  replicas: 1
  selector:
    matchLabels:
      app: web
      track: canary
  template:
    metadata:
      labels:
        app: web                # same shared label
        track: canary
    spec:
      containers:
      - name: app
        image: myapp:2.0
        ports:
        - containerPort: 8080
```

*service.yaml (only selects on app=web)*

```yaml
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  selector:
    app: web                    # matches BOTH stable and canary Pods
  ports:
  - port: 80
    targetPort: 8080
```

```bash
# 9 stable + 1 canary = ~10% canary traffic
kubectl get pods -l app=web
# NAME                          READY   STATUS    RESTARTS   AGE
# app-stable-5d8f7c9b4-abc12   1/1     Running   0          2d
# app-stable-5d8f7c9b4-def34   1/1     Running   0          2d
# ... (7 more stable pods)
# app-canary-7f6e8a3c2-xyz99   1/1     Running   0          5m

# Gradually increase canary: scale stable down, canary up
kubectl scale deployment app-stable --replicas=7
kubectl scale deployment app-canary --replicas=3
# Now ~30% canary

# Full promotion
kubectl scale deployment app-stable --replicas=0
kubectl scale deployment app-canary --replicas=10
# Now 100% canary — update stable image and scale back if desired
```

> **Gotcha:** Native Kubernetes canary traffic splitting is approximate. It depends on Pod count ratios and round-robin load balancing. You cannot do 1% canary with 100 Pods — you would need 1 canary and 99 stable replicas. For precise traffic control, use Gateway API or a service mesh.

### Gateway API Canary (Weight-Based)

Gateway API HTTPRoute supports exact percentage-based traffic splitting:

*canary-httproute.yaml*

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: web-canary
spec:
  parentRefs:
  - name: main-gateway
  hostnames:
  - "myapp.example.com"
  rules:
  - backendRefs:
    - name: app-stable
      port: 80
      weight: 95               # 95% to stable
    - name: app-canary
      port: 80
      weight: 5                # 5% to canary
```

```bash
# Gradually shift traffic by patching the weights
kubectl patch httproute web-canary --type=merge -p '
spec:
  rules:
  - backendRefs:
    - name: app-stable
      port: 80
      weight: 80
    - name: app-canary
      port: 80
      weight: 20
'
# Now 20% canary — independent of replica count
```

### Service Mesh Canary (Istio)

Istio VirtualService provides the most sophisticated traffic control:

```yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: web
spec:
  hosts:
  - web
  http:
  - route:
    - destination:
        host: web
        subset: stable
      weight: 95
    - destination:
        host: web
        subset: canary
      weight: 5
```

### Canary Implementation Comparison

| Method | Traffic Precision | Complexity | Requirements |
|--------|------------------|------------|--------------|
| Native K8s (replica ratio) | ~10% minimum granularity | Low | Nothing extra |
| nginx Ingress annotations | Percentage or header-based | Medium | nginx Ingress Controller |
| Gateway API HTTPRoute | Exact percentage | Medium | Gateway API controller |
| Istio VirtualService | Exact percentage + headers | High | Istio service mesh |

## A/B Testing

A/B testing routes traffic based on specific criteria — HTTP headers, cookies, user agent, or geographic location — rather than random percentage splits. This lets you show the new version only to specific users (e.g., beta testers, internal employees, mobile users).

### nginx Ingress Canary-by-Header

nginx Ingress Controller supports canary routing via annotations:

*canary-ingress.yaml*

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web-canary
  annotations:
    nginx.ingress.kubernetes.io/canary: "true"
    nginx.ingress.kubernetes.io/canary-by-header: "X-Canary"
    nginx.ingress.kubernetes.io/canary-by-header-value: "true"
spec:
  ingressClassName: nginx
  rules:
  - host: myapp.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: app-canary
            port:
              number: 80
```

```bash
# Normal users → stable version (main Ingress)
curl http://myapp.example.com/
# {"version":"1.0"}

# Requests with the header → canary version
curl -H "X-Canary: true" http://myapp.example.com/
# {"version":"2.0"}
```

You can also use cookies or percentage-based routing:

```yaml
annotations:
  # Route by cookie
  nginx.ingress.kubernetes.io/canary: "true"
  nginx.ingress.kubernetes.io/canary-by-cookie: "canary_enabled"
  # Set cookie to "always" to route to canary, "never" to skip

  # Or route by percentage (random)
  nginx.ingress.kubernetes.io/canary: "true"
  nginx.ingress.kubernetes.io/canary-weight: "10"    # 10% of traffic
```

> **Tip:** A/B testing by header is ideal for internal testing. Have your QA team or beta users send the header (via browser extension or API client config), while regular users remain on the stable version. This gives you targeted, deterministic testing rather than random sampling.

## Argo Rollouts

Argo Rollouts is a Kubernetes controller and CRD that provides advanced deployment strategies as a drop-in replacement for Deployments. It supports canary and blue-green with automated analysis, traffic management, and metric-driven promotion.

### Installing Argo Rollouts

```bash
kubectl create namespace argo-rollouts
kubectl apply -n argo-rollouts -f https://github.com/argoproj/argo-rollouts/releases/latest/download/install.yaml

# Install the kubectl plugin
curl -LO https://github.com/argoproj/argo-rollouts/releases/latest/download/kubectl-argo-rollouts-linux-amd64
chmod +x kubectl-argo-rollouts-linux-amd64
sudo mv kubectl-argo-rollouts-linux-amd64 /usr/local/bin/kubectl-argo-rollouts

# Verify
kubectl argo rollouts version
# kubectl-argo-rollouts: v1.7.0
```

### Rollout with Canary Steps

A Rollout resource replaces a Deployment. The `strategy` section defines canary steps — pause, increase traffic, analyze metrics, promote or abort.

*canary-rollout.yaml*

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: web-app
spec:
  replicas: 10
  revisionHistoryLimit: 3
  selector:
    matchLabels:
      app: web-app
  strategy:
    canary:
      canaryService: web-app-canary     # canary Service
      stableService: web-app-stable     # stable Service
      steps:
      - setWeight: 10                   # 10% traffic to canary
      - pause: {duration: 2m}           # wait 2 minutes
      - setWeight: 30                   # ramp to 30%
      - pause: {duration: 2m}
      - setWeight: 60                   # ramp to 60%
      - pause: {duration: 5m}
      - setWeight: 100                  # full rollout
  template:
    metadata:
      labels:
        app: web-app
    spec:
      containers:
      - name: app
        image: myapp:2.0
        ports:
        - containerPort: 8080
```

```bash
# Watch the rollout progress
kubectl argo rollouts get rollout web-app --watch

# NAME                              KIND        STATUS        AGE
# web-app                           Rollout     ✔ Healthy     5m
# ├──# revision:2
# │  └──⧫ web-app-6b8f7d9c4        ReplicaSet  ✔ Healthy     2m
# │     ├──□ web-app-6b8f7d9c4-ab   Pod         ✔ Running     2m
# │     ├──□ web-app-6b8f7d9c4-cd   Pod         ✔ Running     2m
# │     └──□ web-app-6b8f7d9c4-ef   Pod         ✔ Running     2m
# └──# revision:1
#    └──⧫ web-app-5d4c3b2a1        ReplicaSet  • ScaledDown   5m

# Manually promote if paused
kubectl argo rollouts promote web-app

# Abort and rollback
kubectl argo rollouts abort web-app
```

### Analysis Templates

Argo Rollouts can automatically promote or abort based on metrics from Prometheus, Datadog, CloudWatch, or any webhook:

*analysis-template.yaml*

```yaml
apiVersion: argoproj.io/v1alpha1
kind: AnalysisTemplate
metadata:
  name: success-rate
spec:
  metrics:
  - name: success-rate
    interval: 60s
    count: 5
    successCondition: result[0] >= 0.99
    failureLimit: 2
    provider:
      prometheus:
        address: http://prometheus.monitoring:9090
        query: |
          sum(rate(http_requests_total{app="web-app",status=~"2.."}[5m]))
          /
          sum(rate(http_requests_total{app="web-app"}[5m]))
```

Reference the analysis in the Rollout steps:

```yaml
strategy:
  canary:
    steps:
    - setWeight: 10
    - analysis:
        templates:
        - templateName: success-rate
    - setWeight: 50
    - pause: {duration: 5m}
    - setWeight: 100
```

If the success rate drops below 99% during the analysis, Argo Rollouts automatically aborts the rollout and scales back the canary.

> **Tip:** Argo Rollouts also supports blue-green strategy with `autoPromotionEnabled`, `prePromotionAnalysis`, and `postPromotionAnalysis`. If you are already using Argo CD for GitOps, Argo Rollouts integrates seamlessly.

## Strategy Comparison

| Strategy | Downtime | Rollback Speed | Resource Cost | Complexity | Best For |
|----------|----------|---------------|---------------|------------|----------|
| **Rolling Update** | None | Slow (undo rollout) | Low (+25% during update) | Low | Most workloads |
| **Recreate** | Yes | Slow (redeploy old) | None extra | Lowest | Single-instance, incompatible versions |
| **Blue-Green** | None | Instant (switch selector) | High (2x during deploy) | Medium | Critical services needing instant rollback |
| **Canary** | None | Fast (scale down canary) | Low-Medium | Medium-High | Validating changes with real traffic |
| **A/B Testing** | None | Fast | Low-Medium | High | Feature testing by user segment |

## Pod Disruption Budgets (PDB)

Pod Disruption Budgets protect application availability during **voluntary disruptions** — node drains, cluster upgrades, autoscaler scale-downs. A PDB tells Kubernetes how many Pods must remain available (or how many can be unavailable) during these operations.

```
Without PDB                              With PDB (minAvailable: 2)

Node drain starts...                     Node drain starts...

 Node A          Node B                   Node A          Node B
 [app] [app]     [app]                    [app] [app]     [app]
    │     │                                  │     │
    ▼     ▼                                  ▼     X ← blocked!
  evicted evicted                          evicted  "Cannot evict: would
                                                     violate PDB"
  Only 1 Pod left ← potential outage!      2 Pods still running ← safe

                                           Drain waits for new Pod
                                           to schedule elsewhere,
                                           then continues
```

### PDB YAML

You can specify either `minAvailable` or `maxUnavailable` (not both):

*pdb-min-available.yaml*

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: web-app-pdb
spec:
  minAvailable: 2                     # at least 2 Pods must be running
  selector:
    matchLabels:
      app: web-app
```

*pdb-max-unavailable.yaml*

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: web-app-pdb
spec:
  maxUnavailable: 1                   # at most 1 Pod can be down
  selector:
    matchLabels:
      app: web-app
```

Percentage values also work:

```yaml
spec:
  minAvailable: "80%"                 # at least 80% of matched Pods must be up
```

```bash
kubectl apply -f pdb-min-available.yaml

kubectl get pdb
# NAME          MIN AVAILABLE   MAX UNAVAILABLE   ALLOWED DISRUPTIONS   AGE
# web-app-pdb   2               N/A               1                     10s

# "ALLOWED DISRUPTIONS: 1" means one Pod can currently be evicted safely
# (3 running Pods - minAvailable 2 = 1 allowed disruption)
```

### PDB + Rolling Updates = Safe Deployments

PDBs and Deployment rolling updates work together. During a rolling update, Kubernetes respects the PDB when terminating old Pods. And during node drains, the PDB prevents too many Pods from being evicted at once.

```bash
# Drain a node — PDB is respected
kubectl drain node-1 --ignore-daemonsets --delete-emptydir-data
# evicting pod default/web-app-5d8f7c9b4-abc12
# evicting pod default/web-app-5d8f7c9b4-def34
# error when evicting pods/"web-app-5d8f7c9b4-def34" -n "default" (will retry):
#   Cannot evict pod as it would violate the pod's disruption budget.

# The drain waits for a replacement Pod to be scheduled before continuing
```

> **Gotcha:** PDBs only protect against **voluntary** disruptions (drains, upgrades, autoscaler). They do NOT protect against involuntary disruptions (node crash, OOM kill, hardware failure). For those, use multiple replicas spread across nodes with pod anti-affinity.

### PDB Best Practices

| Scenario | Replicas | PDB Setting |
|----------|----------|-------------|
| Web app, 3 replicas | 3 | `maxUnavailable: 1` |
| Stateful service, 3 replicas | 3 | `minAvailable: 2` |
| Kafka cluster, 5 brokers | 5 | `maxUnavailable: 1` |
| Single-instance DB | 1 | `maxUnavailable: 0` (blocks all drains!) |

> **Gotcha:** Setting `maxUnavailable: 0` (or `minAvailable` equal to replicas) on a single-replica Deployment blocks all node drains. The node drain will hang indefinitely. Use this only if you truly cannot tolerate any disruption and have monitoring in place to unblock stuck drains.

## Hands-On: Blue-Green Deployment

Let's implement a full blue-green deployment from scratch — deploy v1, deploy v2, test, switch traffic, verify, and rollback.

*Step 1: Deploy v1 (Blue)*

```bash
# Create the blue Deployment
kubectl create deployment app-blue --image=hashicorp/http-echo --replicas=3 \
  -- -text="v1 - blue" -listen=:8080

# Add the required labels
kubectl label deployment app-blue version=blue
kubectl patch deployment app-blue -p '
{
  "spec": {
    "selector": {"matchLabels": {"app": "demo", "version": "blue"}},
    "template": {
      "metadata": {"labels": {"app": "demo", "version": "blue"}},
      "spec": {"containers": [{"name": "http-echo", "image": "hashicorp/http-echo", "args": ["-text=v1 - blue", "-listen=:8080"], "ports": [{"containerPort": 8080}]}]}
    }
  }
}'

# Create the Service pointing to blue
kubectl expose deployment app-blue --name=demo-svc --port=80 --target-port=8080
kubectl patch svc demo-svc -p '{"spec":{"selector":{"app":"demo","version":"blue"}}}'

# Verify blue is serving traffic
kubectl get pods -l app=demo
# NAME                        READY   STATUS    RESTARTS   AGE
# app-blue-6b8f7d9c4-abc12   1/1     Running   0          30s
# app-blue-6b8f7d9c4-def34   1/1     Running   0          30s
# app-blue-6b8f7d9c4-ghi56   1/1     Running   0          30s

kubectl port-forward svc/demo-svc 8080:80 &
curl http://localhost:8080
# v1 - blue
```

*Step 2: Deploy v2 (Green)*

```bash
# Create the green Deployment (does NOT get traffic yet)
kubectl create deployment app-green --image=hashicorp/http-echo --replicas=3 \
  -- -text="v2 - green" -listen=:8080

kubectl patch deployment app-green -p '
{
  "spec": {
    "selector": {"matchLabels": {"app": "demo", "version": "green"}},
    "template": {
      "metadata": {"labels": {"app": "demo", "version": "green"}},
      "spec": {"containers": [{"name": "http-echo", "image": "hashicorp/http-echo", "args": ["-text=v2 - green", "-listen=:8080"], "ports": [{"containerPort": 8080}]}]}
    }
  }
}'

kubectl get pods -l app=demo
# NAME                         READY   STATUS    RESTARTS   AGE
# app-blue-6b8f7d9c4-abc12    1/1     Running   0          5m
# app-blue-6b8f7d9c4-def34    1/1     Running   0          5m
# app-blue-6b8f7d9c4-ghi56    1/1     Running   0          5m
# app-green-7f6e8a3c2-jkl78   1/1     Running   0          30s
# app-green-7f6e8a3c2-mno90   1/1     Running   0          30s
# app-green-7f6e8a3c2-pqr12   1/1     Running   0          30s
```

*Step 3: Test green directly*

```bash
kubectl port-forward deployment/app-green 9090:8080 &
curl http://localhost:9090
# v2 - green

# Run any smoke tests or integration tests against port 9090
```

*Step 4: Switch traffic to green*

```bash
kubectl patch svc demo-svc -p '{"spec":{"selector":{"version":"green"}}}'
# service/demo-svc patched

# Verify
curl http://localhost:8080
# v2 - green
```

*Step 5: Rollback (if needed)*

```bash
# Instant rollback — switch selector back to blue
kubectl patch svc demo-svc -p '{"spec":{"selector":{"version":"blue"}}}'
# service/demo-svc patched

curl http://localhost:8080
# v1 - blue
```

*Step 6: Clean up*

```bash
# Once confirmed, remove the old version
kill %1 %2 2>/dev/null   # stop port-forwards
kubectl delete deployment app-blue app-green
kubectl delete svc demo-svc
```

> **Tip:** In production, automate blue-green with a CI/CD pipeline: deploy green, run automated tests, switch the Service selector, monitor error rates for 5 minutes, then delete blue. If errors spike, the pipeline switches back automatically.

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

## Module 19 Summary

- **Rolling Update** is the default Deployment strategy — gradually replaces old Pods with new ones, zero downtime.
- **maxSurge** controls how many extra Pods can exist during rollout; **maxUnavailable** controls how many can be down. Both accept numbers or percentages.
- **minReadySeconds** ensures a new Pod stays Ready for a minimum duration before the rollout continues — catches Pods that crash shortly after startup.
- **progressDeadlineSeconds** (default 600s) marks a rollout as failed if it makes no progress within the deadline.
- **Recreate** strategy kills all old Pods before creating new ones — causes downtime but required for single-instance databases, incompatible versions, or RWO volume migrations.
- **Blue-green** uses two Deployments (blue and green) with one Service. Switch traffic instantly by patching the Service selector. Provides instant rollback but doubles resource usage.
- **Canary** routes a small percentage of traffic to the new version. Native K8s uses replica ratios (approximate). Gateway API and service meshes provide exact weight-based splitting.
- **A/B testing** routes by header, cookie, or other criteria — deterministic routing to specific user segments rather than random sampling.
- **Argo Rollouts** replaces Deployments with a Rollout CRD that supports automated canary steps, blue-green with analysis, and metric-driven promotion/rollback via AnalysisTemplates.
- **Pod Disruption Budgets (PDB)** protect availability during voluntary disruptions (node drains, cluster upgrades). Set `minAvailable` or `maxUnavailable` to prevent too many Pods from being evicted at once.
- PDBs only protect against voluntary disruptions — for involuntary failures (node crash), rely on multiple replicas with pod anti-affinity.
- Choose your strategy based on trade-offs: Rolling Update for most workloads, Blue-green for instant rollback, Canary for gradual validation, Recreate when versions cannot coexist.
