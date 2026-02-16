## Autoscaling

Static replica counts are a lie you tell yourself at deploy time. Set replicas too low and traffic spikes cause outages. Set them too high and you're burning money on idle Pods 23 hours a day. Autoscaling solves this by adjusting capacity dynamically based on actual demand.

Kubernetes offers three layers of autoscaling:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Autoscaling in Kubernetes                     │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐│
│  │     HPA      │  │     VPA      │  │   Cluster Autoscaler   ││
│  │              │  │              │  │                        ││
│  │ Scale number │  │ Scale Pod    │  │ Scale number           ││
│  │ of Pod       │  │ resource     │  │ of Nodes               ││
│  │ replicas     │  │ requests     │  │                        ││
│  │              │  │              │  │                        ││
│  │ Horizontal   │  │ Vertical     │  │ Infrastructure         ││
│  └──────────────┘  └──────────────┘  └────────────────────────┘│
│                                                                 │
│  ┌──────────────────────────────────────────────────────────────┤
│  │ KEDA — Event-Driven Autoscaler (scales on external metrics) │
│  └──────────────────────────────────────────────────────────────┤
└─────────────────────────────────────────────────────────────────┘
```

> **Why this matters for interviews:** Autoscaling questions are common in SRE and DevOps interviews. You'll be asked which autoscaler handles which scenario, how the HPA algorithm works, and why Pods need resource requests.

### Resource Requests — The Foundation

Before any autoscaling works, your Pods **must** have resource requests. Without them, the HPA has no baseline to calculate percentages, the VPA has nothing to adjust, and the scheduler can't make informed placement decisions.

*deployment-with-requests.yaml*

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 2
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
      - name: web
        image: nginx:1.25
        resources:
          requests:            # what the Pod asks for (scheduling + HPA)
            cpu: 100m          # 100 millicores = 0.1 CPU
            memory: 128Mi
          limits:              # hard ceiling (OOMKill if exceeded for memory)
            cpu: 500m
            memory: 256Mi
        ports:
        - containerPort: 80
```

The relationship between requests, limits, and autoscaling:

```
requests         actual usage        limits
   │                  │                 │
   ▼                  ▼                 ▼
   ├──────────────────┼─────────────────┤
   0m      100m      250m             500m
           │          │
           │          └── HPA sees 250% of request → scales up
           └── HPA target (e.g., 50% = 50m)
```

> **Gotcha:** If you set no CPU request, `kubectl get hpa` shows `<unknown>/50%` under TARGETS. The HPA cannot calculate utilization percentage without a request baseline. Always set requests.

> **Tip:** Set requests to what the Pod typically uses under normal load. Set limits to what the Pod should never exceed. The gap between them is your burst room.

### Horizontal Pod Autoscaler (HPA)

The HPA scales the **number of Pod replicas** in a Deployment, ReplicaSet, or StatefulSet. It's the most commonly used autoscaler.

**Prerequisite:** The metrics-server must be installed. It collects CPU and memory usage from kubelets and exposes them via the Metrics API.

*Install metrics-server*

```bash
# minikube
minikube addons enable metrics-server

# kind / other clusters
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

# Verify it's running
kubectl get pods -n kube-system | grep metrics-server
# metrics-server-6d94bc8694-x7j2k   1/1     Running   0   45s

# Verify metrics are available (may take 60s after install)
kubectl top nodes
# NAME             CPU(cores)   CPU%   MEMORY(bytes)   MEMORY%
# docker-desktop   245m         6%     1842Mi          23%

kubectl top pods
# NAME                   CPU(cores)   MEMORY(bytes)
# web-5d4b8c6f5-abc12    3m           28Mi
# web-5d4b8c6f5-def34    2m           27Mi
```

#### CPU-Based HPA (Imperative)

The quickest way to create an HPA:

```bash
# Create HPA targeting 50% average CPU utilization
kubectl autoscale deployment web --cpu-percent=50 --min=2 --max=10
# horizontalpodautoscaler.autoscaling/web autoscaled

# Check it
kubectl get hpa
# NAME   REFERENCE        TARGETS   MINPODS   MAXPODS   REPLICAS   AGE
# web    Deployment/web   5%/50%    2         10        2          30s
```

#### CPU-Based HPA (Declarative)

For production, always use YAML. Use `autoscaling/v2` — it supports multiple metrics and scaling behavior policies:

*hpa-cpu.yaml*

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: web
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 50    # target 50% of CPU request
```

```bash
kubectl apply -f hpa-cpu.yaml
```

#### How the HPA Algorithm Works

Every 15 seconds (default), the HPA controller queries metrics and calculates:

```
desiredReplicas = ceil( currentReplicas * (currentMetricValue / targetMetricValue) )
```

**Example walkthrough:**

```
Current state:  3 replicas, each using 80% CPU
Target:         50% CPU

desiredReplicas = ceil( 3 * (80 / 50) )
                = ceil( 3 * 1.6 )
                = ceil( 4.8 )
                = 5

Result: HPA scales from 3 → 5 replicas
```

**Another example (scale down):**

```
Current state:  5 replicas, each using 20% CPU
Target:         50% CPU

desiredReplicas = ceil( 5 * (20 / 50) )
                = ceil( 5 * 0.4 )
                = ceil( 2.0 )
                = 2

Result: HPA scales from 5 → 2 replicas (but not below minReplicas)
```

> **Gotcha:** The HPA averages CPU across all replicas. If one Pod is at 90% and another at 10%, the average is 50% — no scaling happens. This is why uneven load distribution can trick the HPA.

#### Memory-Based HPA

Memory scaling works the same way but is trickier — many applications allocate memory and never release it (JVM, Python). Scaling up based on memory is fine; scaling down may not reduce memory usage.

*hpa-memory.yaml*

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: web
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 70
```

You can also combine CPU and memory metrics. The HPA picks whichever metric produces the **highest** replica count:

*hpa-multi-metric.yaml*

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: web
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 50
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 70
```

#### Scaling Behavior — Preventing Flapping

By default, the HPA scales up immediately but waits 5 minutes before scaling down (stabilization window). You can customize this:

*hpa-with-behavior.yaml*

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: web
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web
  minReplicas: 2
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 50
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 30        # wait 30s before scaling up more
      policies:
      - type: Pods
        value: 4                            # add at most 4 pods per 60s
        periodSeconds: 60
      - type: Percent
        value: 100                          # or double the current count
        periodSeconds: 60
      selectPolicy: Max                     # use whichever allows more pods
    scaleDown:
      stabilizationWindowSeconds: 300       # wait 5 min before scaling down
      policies:
      - type: Pods
        value: 2                            # remove at most 2 pods per 60s
        periodSeconds: 60
      selectPolicy: Min                     # use the more conservative policy
```

> **Tip:** Scale up aggressively, scale down conservatively. Traffic spikes need fast response. Premature scale-down causes flapping — the app scales down, traffic rises again, it scales back up, wasting resources on Pod startup.

#### Custom Metrics (Brief)

The HPA can also scale on custom application metrics (requests per second, queue depth) using the `custom.metrics.k8s.io` API. This requires a metrics adapter like **Prometheus Adapter**:

```yaml
metrics:
- type: Pods
  pods:
    metric:
      name: http_requests_per_second
    target:
      type: AverageValue
      averageValue: 1000
```

Setting up Prometheus Adapter is a significant effort. For custom metric scaling, many teams use **KEDA** instead (covered later in this module).

#### Inspecting the HPA

```bash
kubectl get hpa
# NAME   REFERENCE        TARGETS         MINPODS   MAXPODS   REPLICAS   AGE
# web    Deployment/web   35%/50%         2         10        3          10m

kubectl get hpa web -o yaml
# shows full spec including current metrics and conditions

kubectl describe hpa web
# ...
# Conditions:
#   Type            Status  Reason              Message
#   ----            ------  ------              -------
#   AbleToScale     True    ReadyForNewScale    recommended size matches current size
#   ScalingActive   True    ValidMetricFound    the HPA was able to successfully calculate a replica count
#   ScalingLimited  False   DesiredWithinRange  the desired count is within the acceptable range
# Events:
#   Type    Reason             Age   Message
#   ----    ------             ----  -------
#   Normal  SuccessfulRescale  5m    New size: 3; reason: cpu resource utilization (percentage of request) above target
```

### Vertical Pod Autoscaler (VPA)

The VPA adjusts **CPU and memory requests** on your Pods automatically. Instead of adding more replicas, it right-sizes each replica.

**Use case:** You deploy a new service and have no idea what resource requests to set. The VPA observes actual usage and recommends — or automatically applies — the right values.

The VPA is not built into Kubernetes. Install it separately:

```bash
# Clone and install
git clone https://github.com/kubernetes/autoscaler.git
cd autoscaler/vertical-pod-autoscaler
./hack/vpa-up.sh

# Verify
kubectl get pods -n kube-system | grep vpa
# vpa-admission-controller-6b5f7dc9c7-xxxxx   1/1     Running   0   30s
# vpa-recommender-7c4fb4c4d5-xxxxx             1/1     Running   0   30s
# vpa-updater-58c4f8d6b7-xxxxx                 1/1     Running   0   30s
```

#### VPA Modes

The VPA has three `updateMode` values:

| Mode | Behavior | When to Use |
|------|----------|-------------|
| `Off` | Only generates recommendations, never changes Pods | Initial observation, building confidence |
| `Initial` | Sets requests when Pods are first created, never updates running Pods | Stateful workloads you don't want restarted |
| `Auto` | Evicts and recreates Pods with updated requests | Fully automated right-sizing |

*vpa.yaml*

```yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: web-vpa
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web
  updatePolicy:
    updateMode: "Auto"          # Off, Initial, or Auto
  resourcePolicy:
    containerPolicies:
    - containerName: web
      minAllowed:
        cpu: 50m
        memory: 64Mi
      maxAllowed:
        cpu: 2
        memory: 2Gi
      controlledResources: ["cpu", "memory"]
```

```bash
kubectl apply -f vpa.yaml

# Check recommendations after a few minutes
kubectl get vpa
# NAME      MODE   CPU    MEM      PROVIDED   AGE
# web-vpa   Auto   120m   180Mi    True       5m

kubectl describe vpa web-vpa
# ...
# Recommendation:
#   Container Recommendations:
#     Container Name:  web
#     Lower Bound:
#       Cpu:     50m
#       Memory:  64Mi
#     Target:
#       Cpu:     120m
#       Memory:  180Mi
#     Uncapped Target:
#       Cpu:     120m
#       Memory:  180Mi
#     Upper Bound:
#       Cpu:     400m
#       Memory:  512Mi
```

The VPA provides four values:
- **Lower Bound** — minimum recommended (for minAllowed)
- **Target** — the recommended request value
- **Uncapped Target** — what it would recommend without your min/max constraints
- **Upper Bound** — maximum recommended (for limits)

> **Gotcha:** VPA in `Auto` mode **evicts Pods** to apply new resource values. It cannot update running Pods in place — Kubernetes doesn't support changing resource requests on a live Pod. This means brief disruptions during resizing. Ensure you have multiple replicas and PodDisruptionBudgets.

#### VPA vs HPA — The Conflict

Do **not** use HPA and VPA on the same metric (CPU or memory) simultaneously. The HPA wants to scale horizontally based on CPU utilization. The VPA wants to change CPU requests, which shifts the percentage the HPA sees. They fight each other.

```
Safe combinations:
  ✓  HPA on custom metrics (requests/sec) + VPA on CPU/memory
  ✓  HPA on CPU + VPA in "Off" mode (recommendations only)
  ✗  HPA on CPU + VPA on CPU in "Auto" mode → conflict
```

### Cluster Autoscaler

The Cluster Autoscaler scales the **number of nodes** in your cluster. It works with cloud provider node groups (AWS Auto Scaling Groups, GCP Managed Instance Groups, Azure VM Scale Sets).

#### When It Scales Up

A Pod is created but can't be scheduled because no node has enough resources. The scheduler marks it `Pending`:

```
1. Deployment scaled to 10 replicas
2. Only 6 Pods fit on existing nodes
3. 4 Pods stuck in Pending (Insufficient cpu)
4. Cluster Autoscaler detects Pending Pods
5. Adds nodes to the node group
6. New nodes join → scheduler places Pending Pods
```

#### When It Scales Down

A node's utilization drops below a threshold (default: 50%) for a sustained period (default: 10 minutes). The autoscaler checks if all Pods on that node can be rescheduled elsewhere, then drains and removes the node:

```
1. Traffic drops → HPA scales Pods from 10 → 3
2. Node-3 now has only one small Pod
3. Cluster Autoscaler waits 10 minutes
4. Confirms the Pod fits on Node-1 or Node-2
5. Cordons Node-3 (no new Pods)
6. Drains Node-3 (gracefully evicts Pods)
7. Removes Node-3 from cloud provider
```

> **Gotcha:** Some Pods prevent scale-down: Pods with local storage (emptyDir with data), Pods without a controller (bare Pods), Pods with restrictive PodDisruptionBudgets, and Pods with `cluster-autoscaler.kubernetes.io/safe-to-evict: "false"` annotation.

#### Configuration

The Cluster Autoscaler is deployed as a Deployment in your cluster. Key flags:

```bash
# Common configuration flags
--node-group-auto-discovery=asg:tag=k8s.io/cluster-autoscaler/enabled,k8s.io/cluster-autoscaler/my-cluster
--balance-similar-node-groups=true      # keep node groups balanced
--skip-nodes-with-local-storage=false   # allow scaling down nodes with emptyDir
--scale-down-delay-after-add=10m        # wait after adding a node
--scale-down-unneeded-time=10m          # how long a node must be underused
--scale-down-utilization-threshold=0.5  # scale down if below 50% utilization
--max-node-provision-time=15m           # give up if node doesn't come up
--expander=least-waste                  # how to pick which node group to expand
```

**Expanders** decide which node group to scale when multiple options exist:

| Expander | Strategy |
|----------|----------|
| `random` | Pick any eligible node group randomly |
| `most-pods` | Pick the group that fits the most pending Pods |
| `least-waste` | Pick the group that wastes the fewest resources after scheduling |
| `priority` | Use a priority-based ConfigMap to prefer certain groups |

#### Karpenter (AWS Alternative)

Karpenter is an open-source node provisioner built by AWS. Instead of scaling fixed node groups, it provisions the right instance type directly based on pending Pod requirements:

```
Cluster Autoscaler:  Pod pending → scale existing ASG → get whatever instance type ASG uses
Karpenter:           Pod pending → calculate exact needs → provision best-fit instance type
```

Karpenter is faster (skips the ASG intermediary), more flexible (chooses from many instance types), and can consolidate workloads across cheaper instance types. If you're on AWS, it's worth evaluating.

### KEDA (Kubernetes Event-Driven Autoscaler)

KEDA extends the HPA to scale on **external metrics** — queue lengths, HTTP request rates, database connections, cron schedules, and more. Critically, KEDA can **scale to zero**, which the standard HPA cannot (minimum is 1).

```
┌────────────────────────────────────────────┐
│                    KEDA                     │
│                                            │
│  External Source       ScaledObject    HPA  │
│  (RabbitMQ queue) ──→  (KEDA CRD)  ──→    │
│  (Kafka lag)                               │
│  (AWS SQS)             Scales to/from      │
│  (Cron schedule)       zero replicas       │
│  (Prometheus)                              │
└────────────────────────────────────────────┘
```

#### Install KEDA

```bash
# Using Helm
helm repo add kedacore https://kedacore.github.io/charts
helm repo update
helm install keda kedacore/keda --namespace keda --create-namespace

# Verify
kubectl get pods -n keda
# NAME                                      READY   STATUS    RESTARTS   AGE
# keda-operator-7c4f8b6d5-xxxxx             1/1     Running   0          30s
# keda-metrics-apiserver-6d94bc8694-xxxxx    1/1     Running   0          30s
```

#### ScaledObject Example — RabbitMQ Queue

Scale a worker Deployment based on the number of messages in a RabbitMQ queue:

*keda-rabbitmq.yaml*

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: rabbitmq-worker
spec:
  scaleTargetRef:
    name: worker                       # Deployment to scale
  pollingInterval: 15                  # check every 15 seconds
  cooldownPeriod: 300                  # wait 5 min before scaling to zero
  minReplicaCount: 0                   # scale to zero when idle!
  maxReplicaCount: 30
  triggers:
  - type: rabbitmq
    metadata:
      queueName: tasks
      queueLength: "5"                 # 1 replica per 5 messages
      host: amqp://user:pass@rabbitmq.default.svc.cluster.local:5672
```

If the queue has 25 messages, KEDA creates 5 replicas (25 / 5 = 5). When the queue drains to zero, KEDA scales the Deployment to zero Pods after the cooldown period.

#### Other KEDA Triggers

KEDA supports 60+ triggers. Common ones:

| Trigger | Scales on | Example Use Case |
|---------|----------|-----------------|
| `kafka` | Consumer group lag | Event processing pipeline |
| `aws-sqs-queue` | Queue depth | Async job processing |
| `prometheus` | PromQL query result | Custom application metrics |
| `cron` | Time schedule | Scale up for business hours |
| `redis-lists` | List length | Task queue |
| `postgresql` | Query result count | Pending orders in database |
| `http` | Concurrent request count | HTTP-triggered workloads |

*KEDA cron trigger — scale up for business hours*

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: business-hours
spec:
  scaleTargetRef:
    name: web
  triggers:
  - type: cron
    metadata:
      timezone: America/New_York
      start: 0 8 * * 1-5            # 8 AM Mon-Fri
      end: 0 18 * * 1-5             # 6 PM Mon-Fri
      desiredReplicas: "10"          # 10 replicas during business hours
```

> **Tip:** KEDA doesn't replace the HPA — it creates and manages an HPA behind the scenes. When you create a ScaledObject, KEDA creates a corresponding HPA with external metrics. You can see it with `kubectl get hpa`.

### Load Testing for Autoscaling

The best way to understand autoscaling is to watch it happen. Here's a complete workflow.

#### Step 1: Deploy an App with Resource Requests

*load-test-deploy.yaml*

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: php-apache
spec:
  replicas: 1
  selector:
    matchLabels:
      app: php-apache
  template:
    metadata:
      labels:
        app: php-apache
    spec:
      containers:
      - name: php-apache
        image: registry.k8s.io/hpa-example
        resources:
          requests:
            cpu: 200m
          limits:
            cpu: 500m
        ports:
        - containerPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: php-apache
spec:
  selector:
    app: php-apache
  ports:
  - port: 80
```

```bash
kubectl apply -f load-test-deploy.yaml
```

#### Step 2: Create an HPA

```bash
kubectl autoscale deployment php-apache --cpu-percent=50 --min=1 --max=10
# horizontalpodautoscaler.autoscaling/php-apache autoscaled
```

#### Step 3: Generate Load

Open a separate terminal and blast the service:

```bash
# Start a load generator Pod
kubectl run load-generator --image=busybox:1.36 --restart=Never -- \
  /bin/sh -c "while true; do wget -q -O- http://php-apache; done"
```

#### Step 4: Watch the Scaling

In another terminal, watch the HPA and Pods:

```bash
# Watch the HPA react
kubectl get hpa php-apache --watch
# NAME         REFERENCE               TARGETS    MINPODS   MAXPODS   REPLICAS   AGE
# php-apache   Deployment/php-apache   0%/50%     1         10        1          1m
# php-apache   Deployment/php-apache   165%/50%   1         10        1          2m
# php-apache   Deployment/php-apache   165%/50%   1         10        4          2m30s
# php-apache   Deployment/php-apache   82%/50%    1         10        4          3m
# php-apache   Deployment/php-apache   65%/50%    1         10        7          3m30s
# php-apache   Deployment/php-apache   45%/50%    1         10        7          4m

# Watch Pods spin up
kubectl get pods -l app=php-apache --watch
# NAME                          READY   STATUS    RESTARTS   AGE
# php-apache-6c4f8b5d9-abc12    1/1     Running   0          5m
# php-apache-6c4f8b5d9-def34    0/1     Pending   0          0s
# php-apache-6c4f8b5d9-def34    1/1     Running   0          5s
# php-apache-6c4f8b5d9-ghi56    0/1     Pending   0          0s
# php-apache-6c4f8b5d9-ghi56    1/1     Running   0          4s
# ...
```

#### Step 5: Stop Load and Watch Scale Down

```bash
# Delete the load generator
kubectl delete pod load-generator

# Watch the HPA scale back down (takes ~5 minutes due to stabilization window)
kubectl get hpa php-apache --watch
# NAME         REFERENCE               TARGETS   MINPODS   MAXPODS   REPLICAS   AGE
# php-apache   Deployment/php-apache   45%/50%   1         10        7          8m
# php-apache   Deployment/php-apache   0%/50%    1         10        7          9m
# php-apache   Deployment/php-apache   0%/50%    1         10        7          12m
# php-apache   Deployment/php-apache   0%/50%    1         10        1          14m

# Clean up
kubectl delete deployment php-apache
kubectl delete svc php-apache
kubectl delete hpa php-apache
```

The full timeline:

```
Time    Event                          Replicas
─────   ─────────────────────────────  ────────
0:00    Deploy with 1 replica          1
1:00    Start load generator           1
2:00    HPA detects 165% CPU           1 → 4
3:30    CPU still high, scale again    4 → 7
4:00    Load distributed, CPU ~45%     7
8:00    Stop load generator            7
9:00    CPU drops to 0%                7 (stabilization)
14:00   Stabilization window expires   7 → 1
```

### Autoscaling Comparison

| Feature | HPA | VPA | Cluster Autoscaler | KEDA |
|---------|-----|-----|-------------------|------|
| **What it scales** | Pod replica count | Pod CPU/memory requests | Number of nodes | Pod replica count |
| **Trigger** | CPU, memory, custom metrics | Observed resource usage | Pods stuck in Pending | External events (queues, cron, HTTP) |
| **Scale to zero** | No (min=1) | N/A | Yes (removes empty nodes) | Yes |
| **Built-in** | Yes | No (separate install) | No (separate install) | No (separate install) |
| **Use case** | Stateless web apps under variable load | Right-sizing unknown workloads | Dynamic cluster capacity | Event-driven / async workers |
| **Works with** | Deployments, ReplicaSets, StatefulSets | Deployments, ReplicaSets | Cloud provider node groups | Deployments, Jobs |

### Best Practices

1. **Always set resource requests.** Without them, HPA shows `<unknown>` and VPA has nothing to tune.

2. **Start with HPA on CPU.** It's the simplest, most predictable autoscaler. Add complexity only when needed.

3. **Scale up fast, scale down slow.** Use `behavior.scaleDown.stabilizationWindowSeconds` of at least 300 seconds to prevent flapping.

4. **Don't mix HPA and VPA on the same metric.** Use VPA in `Off` mode alongside HPA to get recommendations without conflicts.

5. **Use KEDA for event-driven workloads.** Queue consumers, batch processors, and cron-triggered jobs benefit from scale-to-zero.

6. **Pair HPA with Cluster Autoscaler.** HPA creates more Pods, which may need more nodes. Cluster Autoscaler provisions them. They work together naturally:

```
Traffic spike
  → HPA adds Pods
    → Pods stuck Pending (no room)
      → Cluster Autoscaler adds nodes
        → Pods scheduled on new nodes

Traffic drops
  → HPA removes Pods
    → Nodes underutilized
      → Cluster Autoscaler removes nodes
```

7. **Set `minReplicas` to at least 2 for production.** One replica means no redundancy during scaling events or node failures.

8. **Monitor your autoscalers.** Watch `kubectl get hpa` and set up alerts for when the HPA hits `maxReplicas` — that means you're capped and might need to raise the ceiling or optimize the app.

> **Tip:** In an interview, if asked "how would you handle unpredictable traffic?", the answer is: HPA for Pod scaling with appropriate min/max bounds, Cluster Autoscaler for node capacity, resource requests on all Pods, and PodDisruptionBudgets to protect availability during scale-down. Mention KEDA if the workload is event-driven.

## Exercises

Progress through each section in order, or jump to where you need practice.

Practice individual concepts you just learned.

<div id="warmups-container">
            <noscript><p class="js-required">JavaScript is required for the interactive exercises.</p></noscript>
            </div>

### Challenges

Combine concepts and learn patterns. Each challenge has multiple variants at different difficulties.

<div id="challenges-container">
            <noscript><p class="js-required">JavaScript is required for the interactive exercises.</p></noscript>
            </div>

## Module 20 Summary

- **Static replica counts** waste money (over-provisioned) or cause outages (under-provisioned) — autoscaling adjusts dynamically
- **Resource requests are required** for autoscaling — without them, the HPA cannot calculate utilization percentages
- **HPA** scales Pod replica count based on CPU, memory, or custom metrics using `desiredReplicas = ceil(currentReplicas * currentMetric / targetMetric)`
- **HPA scaling behavior** controls flapping — scale up aggressively, scale down conservatively with stabilization windows
- **VPA** adjusts CPU/memory requests automatically — three modes: `Off` (recommend only), `Initial` (set at creation), `Auto` (evict and recreate)
- **Never combine HPA and VPA on the same metric** (CPU or memory) — they conflict and cause unpredictable behavior
- **Cluster Autoscaler** adds nodes when Pods are stuck Pending and removes underutilized nodes after a cooldown period
- **Karpenter** (AWS) provisions best-fit instance types directly, bypassing fixed node groups for faster, more efficient scaling
- **KEDA** scales on external events (queues, cron, HTTP) and can scale to zero — something the standard HPA cannot do
- **HPA + Cluster Autoscaler** work together naturally: HPA creates Pods, Cluster Autoscaler provides the nodes to run them
- **metrics-server** must be installed for HPA to function — verify with `kubectl top pods`
- **Load testing** validates your autoscaling config — generate load, watch scale-up, stop load, confirm scale-down
