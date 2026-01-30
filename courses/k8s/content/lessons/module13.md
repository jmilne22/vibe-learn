## Observability & Probes

Kubernetes assumes a running container is healthy. If your app deadlocks, runs out of memory connections, or gets stuck loading a cache, K8s has no way to know unless you tell it how to check. That is what **probes** do -- they give the kubelet instructions for checking the health of your containers.

Without probes, the only health signal K8s has is "the process is running." A Java app stuck in a `Thread.sleep(forever)` loop counts as running. A web server that returns 500 on every request counts as running. A database connection pool that has been exhausted counts as running.

```
Without probes:                       With probes:

  Container running? ──▶ Yes ──▶      Container running? ──▶ Yes
  K8s says: "All good!"                 Liveness check? ──▶ Failing!
                                        K8s says: "Restart it."
  Meanwhile, app is
  deadlocked and                        Readiness check? ──▶ Failing!
  serving zero requests.                K8s says: "Remove from Service."
```

### The Three Probe Types

Kubernetes provides three probes, each answering a different question:

| Probe | Question | On Failure |
|-------|----------|------------|
| **Liveness** | Is the container alive? | Container is **restarted** |
| **Readiness** | Can the container accept traffic? | Removed from **Service endpoints** |
| **Startup** | Has the container finished starting? | Delays liveness/readiness checks |

```
  Container starts
       │
       ▼
  ┌─────────────┐     Startup probe runs repeatedly.
  │ Startup     │     Liveness and readiness are DISABLED
  │ Probe       │     until startup succeeds.
  └──────┬──────┘
         │ succeeds
         ▼
  ┌──────────────────────────────────┐
  │  Liveness + Readiness probes     │
  │  run concurrently from here on   │
  └──────────────────────────────────┘
         │                   │
    Liveness fails      Readiness fails
         │                   │
    Container is        Pod removed from
    RESTARTED           Service endpoints
    (CrashLoopBackOff   (no traffic, but
    if repeated)        container stays up)
```

---

## Liveness Probes

The liveness probe answers: **"Is this container still alive?"** If it fails the configured number of times, the kubelet kills the container and restarts it according to the Pod's `restartPolicy`.

Use cases:
- Application is deadlocked
- Stuck in an infinite loop
- Internal state is corrupted and only a restart can fix it

### Probe Mechanisms

Kubernetes supports four probe mechanisms. All four work for liveness, readiness, and startup probes.

**1. HTTP GET** -- most common for web apps

*liveness-http.yaml*

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: web-app
spec:
  containers:
  - name: app
    image: myapp:1.0
    ports:
    - containerPort: 8080
    livenessProbe:
      httpGet:
        path: /healthz
        port: 8080
        httpHeaders:          # optional custom headers
        - name: X-Custom
          value: LivenessCheck
      initialDelaySeconds: 5
      periodSeconds: 10
      timeoutSeconds: 3
      failureThreshold: 3
      successThreshold: 1
```

The kubelet sends an HTTP GET to `/healthz` on port 8080. Any status code between 200 and 399 is success. 400+ is failure.

**2. TCP Socket** -- useful when there's no HTTP endpoint

*liveness-tcp.yaml*

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: db-app
spec:
  containers:
  - name: db
    image: postgres:16
    ports:
    - containerPort: 5432
    livenessProbe:
      tcpSocket:
        port: 5432
      initialDelaySeconds: 15
      periodSeconds: 20
```

The kubelet tries to open a TCP connection on port 5432. If the connection succeeds, the probe passes. If the connection is refused or times out, it fails.

**3. Exec command** -- runs a command inside the container

*liveness-exec.yaml*

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: worker
spec:
  containers:
  - name: worker
    image: busybox
    args: ["/bin/sh", "-c", "touch /tmp/healthy; sleep 3600"]
    livenessProbe:
      exec:
        command:
        - cat
        - /tmp/healthy
      initialDelaySeconds: 5
      periodSeconds: 5
```

The kubelet runs `cat /tmp/healthy` inside the container. Exit code 0 = success, non-zero = failure. If someone deletes `/tmp/healthy`, the probe fails and the container restarts.

**4. gRPC** -- for gRPC services implementing the health checking protocol

*liveness-grpc.yaml*

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: grpc-app
spec:
  containers:
  - name: server
    image: my-grpc-server:1.0
    ports:
    - containerPort: 50051
    livenessProbe:
      grpc:
        port: 50051
        service: my.package.MyService   # optional, defaults to ""
      initialDelaySeconds: 10
      periodSeconds: 10
```

The container must implement the [gRPC Health Checking Protocol](https://github.com/grpc/grpc/blob/master/doc/health-checking.md). The kubelet calls `Check()` on the health service.

### Probe Parameters Explained

Every probe type accepts the same timing parameters:

```yaml
livenessProbe:
  httpGet:
    path: /healthz
    port: 8080
  initialDelaySeconds: 5    # wait 5s after container starts before first probe
  periodSeconds: 10          # check every 10 seconds
  timeoutSeconds: 3          # probe must respond within 3 seconds
  failureThreshold: 3        # 3 consecutive failures → container is restarted
  successThreshold: 1        # 1 success → considered healthy again
```

| Parameter | Default | Description |
|-----------|---------|-------------|
| `initialDelaySeconds` | 0 | Seconds to wait before the first probe |
| `periodSeconds` | 10 | How often to probe |
| `timeoutSeconds` | 1 | Probe timeout (counts as failure if exceeded) |
| `failureThreshold` | 3 | Consecutive failures before taking action |
| `successThreshold` | 1 | Consecutive successes before considered healthy |

> **Gotcha:** Liveness probe failure restarts the **container**, not the entire Pod. The Pod stays on the same node, keeps its IP, and shares the same volumes. Only the failing container process is killed and restarted. But if the container keeps crashing, you will see `CrashLoopBackOff` with increasing backoff delays.

### Seeing Liveness in Action

```bash
# Deploy a Pod that becomes unhealthy after 30 seconds
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: liveness-demo
spec:
  containers:
  - name: app
    image: busybox
    args:
    - /bin/sh
    - -c
    - "touch /tmp/healthy; sleep 30; rm /tmp/healthy; sleep 600"
    livenessProbe:
      exec:
        command: ["cat", "/tmp/healthy"]
      initialDelaySeconds: 5
      periodSeconds: 5
      failureThreshold: 3
EOF

# Watch the Pod — after ~45s, RESTARTS increments
kubectl get pod liveness-demo -w
# NAME            READY   STATUS    RESTARTS   AGE
# liveness-demo   1/1     Running   0          10s
# liveness-demo   1/1     Running   1 (2s ago) 47s
# liveness-demo   1/1     Running   2 (2s ago) 92s

# Check events to see why it restarted
kubectl describe pod liveness-demo | grep -A5 "Events:"
#   Warning  Unhealthy  Liveness probe failed: cat: /tmp/healthy: No such file or directory
#   Normal   Killing    Container app failed liveness probe, will be restarted
```

---

## Readiness Probes

The readiness probe answers: **"Is this container ready to accept traffic?"** If it fails, the Pod is removed from all Service endpoints. No traffic is routed to it. The container is **not** restarted.

Use cases:
- Application is still loading data or warming a cache
- Waiting for a database connection to be established
- Temporarily overloaded and needs to shed traffic

*readiness-probe.yaml*

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 3
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
        image: myapp:1.0
        ports:
        - containerPort: 8080
        readinessProbe:
          httpGet:
            path: /ready
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5
          failureThreshold: 3
        livenessProbe:
          httpGet:
            path: /healthz
            port: 8080
          initialDelaySeconds: 15
          periodSeconds: 10
          failureThreshold: 3
```

### Liveness vs. Readiness -- The Critical Difference

```
                    Liveness fails              Readiness fails
                    ──────────────              ───────────────
  What happens:     Container RESTARTED         Pod removed from
                                                Service endpoints

  Traffic:          Traffic stops (because      Traffic stops (because
                    container is restarting)     Pod is not in endpoints)

  Container:        Killed and recreated        Stays running

  Use when:         App is broken and           App is temporarily
                    needs a restart             unable to serve
```

```bash
# Watch endpoints change when readiness fails
kubectl get endpoints web -w
# NAME   ENDPOINTS                                    AGE
# web    10.1.0.15:8080,10.1.0.16:8080,10.1.0.17:8080  5s
# web    10.1.0.15:8080,10.1.0.17:8080                  35s  ← Pod .16 removed
# web    10.1.0.15:8080,10.1.0.16:8080,10.1.0.17:8080  65s  ← Pod .16 back
```

> **Tip:** If you define no readiness probe, the Pod is considered ready as soon as all containers start. This means the Service will send traffic to containers that may not be ready, resulting in errors during deployment rollouts.

---

## Startup Probes

The startup probe answers: **"Has this container finished starting up?"** While the startup probe is running, liveness and readiness probes are disabled. Once the startup probe succeeds, it never runs again -- liveness and readiness take over.

Use cases:
- Java/Spring Boot applications with long startup times
- Applications loading ML models into memory
- Applications running database migrations on start
- Legacy applications with unpredictable startup times

*startup-probe.yaml*

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: slow-start
spec:
  containers:
  - name: app
    image: spring-boot-app:2.0
    ports:
    - containerPort: 8080
    startupProbe:
      httpGet:
        path: /healthz
        port: 8080
      periodSeconds: 10
      failureThreshold: 30     # 30 * 10 = 300 seconds (5 min) to start
    livenessProbe:
      httpGet:
        path: /healthz
        port: 8080
      periodSeconds: 10
      failureThreshold: 3
    readinessProbe:
      httpGet:
        path: /ready
        port: 8080
      periodSeconds: 5
      failureThreshold: 3
```

The maximum startup time is `failureThreshold * periodSeconds`. In this example: 30 * 10 = **300 seconds** (5 minutes). If the app doesn't pass the startup probe within that window, the container is killed and restarted.

### Why Startup Probes Were Added

Before startup probes existed (pre-Kubernetes 1.18), the only way to handle slow-starting apps was to set a long `initialDelaySeconds` on the liveness probe:

```yaml
# THE OLD HACK -- don't do this
livenessProbe:
  httpGet:
    path: /healthz
    port: 8080
  initialDelaySeconds: 300   # wait 5 minutes before checking
  periodSeconds: 10
```

The problem: if the app crashes 2 minutes in, K8s waits the full 5 minutes before discovering it. With a startup probe, the liveness probe kicks in as soon as the app reports it has started -- no wasted waiting.

```
Old approach (initialDelaySeconds: 300):
  ├── 0s: Container starts
  ├── 60s: App is ready ← K8s doesn't know yet!
  ├── 300s: First liveness check ← 4 minutes wasted
  └── If app crashes at 60s, K8s waits until 300s to find out

Startup probe approach:
  ├── 0s: Container starts, startup probe begins
  ├── 60s: Startup probe succeeds → liveness probe starts immediately
  ├── 70s: First liveness check ← fast detection
  └── If app crashes at 60s, startup probe detects within 10s
```

---

## Probe Configuration Best Practices

### 1. Always Set Readiness Probes

Without a readiness probe, Pods receive traffic the moment the container starts. During rolling updates, users will hit Pods that haven't finished initializing.

```yaml
# ALWAYS have a readiness probe on any Pod that receives traffic
readinessProbe:
  httpGet:
    path: /ready
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 5
```

### 2. Use Liveness Probes Carefully

Liveness probes cause restarts. Aggressive liveness probes can create cascading failures:

```
Scenario: Database is slow for 30 seconds

Without liveness:                   With aggressive liveness:
  Apps wait for DB ──▶              Apps wait for DB ──▶
  DB recovers ──▶                   Liveness probes fail ──▶
  Apps resume serving               ALL Pods restart simultaneously ──▶
                                    Thundering herd hits DB ──▶
                                    DB slows down again ──▶
                                    Pods restart again ──▶ CASCADING FAILURE
```

### 3. Don't Check Dependencies in Liveness Probes

This is the most common probe mistake in production:

```yaml
# BAD -- liveness checks the database
livenessProbe:
  httpGet:
    path: /healthz        # this endpoint queries the database
    port: 8080
# If the database is down, ALL Pods restart. When the database comes
# back, all Pods reconnect simultaneously → thundering herd → DB crash

# GOOD -- liveness only checks the app process itself
livenessProbe:
  httpGet:
    path: /livez          # this endpoint returns 200 if the process is ok
    port: 8080
# If the database is down, Pods stay running. Readiness probe
# (which CAN check dependencies) removes them from Service endpoints.
```

> **Gotcha:** Put dependency checks (database, cache, downstream services) in the **readiness** probe, not the liveness probe. If a dependency is down, you want to stop sending traffic to the Pod -- not restart it.

### 4. Use Startup Probes Instead of Long initialDelaySeconds

```yaml
# BAD -- long initial delay wastes time if app starts fast
livenessProbe:
  initialDelaySeconds: 120

# GOOD -- startup probe allows up to 120s but kicks in as soon as app is ready
startupProbe:
  httpGet:
    path: /healthz
    port: 8080
  periodSeconds: 5
  failureThreshold: 24     # 5 * 24 = 120 seconds max
```

### Probe Comparison Summary

| Aspect | Liveness | Readiness | Startup |
|--------|----------|-----------|---------|
| **Purpose** | Is the app alive? | Can it serve traffic? | Has it finished starting? |
| **On failure** | Container restarted | Removed from endpoints | Keeps checking (until threshold) |
| **Check dependencies?** | No | Yes | Same as liveness endpoint |
| **When it runs** | After startup succeeds | After startup succeeds | Only during startup |
| **Required?** | No (but recommended) | Yes (for any Service) | Only for slow-starting apps |
| **Default if missing** | Container assumed alive | Container assumed ready | N/A (liveness starts immediately) |

---

## Container Logging

Kubernetes expects applications to write logs to **stdout** and **stderr**. The kubelet captures these streams and makes them available through the API.

### kubectl logs

```bash
# Current logs from a Pod
kubectl logs my-pod
# [2025-06-15 10:23:01] INFO  Server started on port 8080
# [2025-06-15 10:23:05] INFO  Connected to database
# [2025-06-15 10:23:10] INFO  Ready to accept connections

# Specific container in a multi-container Pod
kubectl logs my-pod -c sidecar
# [2025-06-15 10:23:02] INFO  Sidecar proxy started

# Previous (crashed) container -- essential for debugging CrashLoopBackOff
kubectl logs my-pod --previous
# [2025-06-15 10:22:55] INFO  Server started on port 8080
# [2025-06-15 10:22:58] FATAL Out of memory: unable to allocate 2GB buffer

# Follow/stream logs in real-time
kubectl logs my-pod -f
# (streams live output, Ctrl+C to stop)

# Time-based filtering
kubectl logs my-pod --since=1h        # last hour
kubectl logs my-pod --since=30m       # last 30 minutes
kubectl logs my-pod --since-time="2025-06-15T10:00:00Z"  # since specific time

# Line-based filtering
kubectl logs my-pod --tail=50         # last 50 lines

# Logs from all Pods with a label
kubectl logs -l app=web
# (aggregates logs from all matching Pods)

kubectl logs -l app=web --all-containers
# (all containers in all matching Pods)

# Logs from a Deployment (shorthand for selecting Pods)
kubectl logs deployment/web
# (picks one Pod from the Deployment)
```

> **Tip:** `kubectl logs --previous` is your best friend when debugging `CrashLoopBackOff`. It shows the logs from the container that just crashed, which usually contains the error message.

### Log Aggregation

`kubectl logs` works for development and troubleshooting, but in production you need centralized logging. Logs are ephemeral -- when a Pod is deleted, its logs are gone.

```
  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │  Pod A   │  │  Pod B   │  │  Pod C   │
  │  stdout  │  │  stdout  │  │  stdout  │
  └────┬─────┘  └────┬─────┘  └────┬─────┘
       │              │              │
       ▼              ▼              ▼
  ┌───────────────────────────────────────┐
  │   Node-level log collector            │
  │   (Fluent Bit / Fluentd DaemonSet)    │
  └───────────────────┬───────────────────┘
                      │
              ┌───────▼───────┐
              │  Log Backend  │
              │  Elasticsearch│
              │  Loki         │
              │  CloudWatch   │
              └───────┬───────┘
                      │
              ┌───────▼───────┐
              │  Dashboard    │
              │  Kibana       │
              │  Grafana      │
              └───────────────┘
```

Common stacks:
- **EFK**: Elasticsearch + Fluentd + Kibana
- **PLG**: Promtail + Loki + Grafana (lightweight, recommended for smaller clusters)
- **Cloud-native**: Fluent Bit to CloudWatch (AWS), Cloud Logging (GCP), Azure Monitor

> **Gotcha:** Log collectors run as DaemonSets (one Pod per node) and read logs from `/var/log/containers/` on the node's filesystem. If your app writes logs to files inside the container instead of stdout, the collector won't see them. Always log to stdout/stderr.

---

## Metrics Server

The **Metrics Server** collects resource metrics (CPU and memory) from kubelets and exposes them through the Kubernetes API. It is required for `kubectl top` and for the Horizontal Pod Autoscaler (HPA).

### Installing Metrics Server

```bash
# On minikube
minikube addons enable metrics-server

# On kind / kubeadm / generic clusters
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

# Verify it's running (may take a minute to collect first metrics)
kubectl get pods -n kube-system -l k8s-app=metrics-server
# NAME                              READY   STATUS    RESTARTS   AGE
# metrics-server-6d94bc8694-abc12   1/1     Running   0          30s

# Wait for metrics to be available
kubectl top nodes
# error: metrics not available yet   ← wait ~60 seconds and retry
```

> **Gotcha:** On kind or self-signed clusters, Metrics Server may fail with TLS errors. Add `--kubelet-insecure-tls` to the Metrics Server Deployment args for development environments. Never use this in production.

### kubectl top

```bash
# Node resource usage
kubectl top nodes
# NAME           CPU(cores)   CPU%   MEMORY(bytes)   MEMORY%
# node-1         250m         12%    1024Mi          52%
# node-2         180m         9%     890Mi           45%
# node-3         320m         16%    1200Mi          61%

# Pod resource usage (current namespace)
kubectl top pods
# NAME                     CPU(cores)   MEMORY(bytes)
# web-7d4b8c6f5-abc12      15m          64Mi
# web-7d4b8c6f5-def34      12m          58Mi
# api-5c8f9d7b2-ghi56      45m          128Mi
# worker-8e2a1c4d-jkl78    200m         512Mi

# Pod resource usage sorted by CPU
kubectl top pods --sort-by=cpu
# NAME                     CPU(cores)   MEMORY(bytes)
# worker-8e2a1c4d-jkl78    200m         512Mi
# api-5c8f9d7b2-ghi56      45m          128Mi
# web-7d4b8c6f5-abc12      15m          64Mi
# web-7d4b8c6f5-def34      12m          58Mi

# Pod resource usage sorted by memory
kubectl top pods --sort-by=memory

# Container-level metrics
kubectl top pods --containers
# NAME                     NAME        CPU(cores)   MEMORY(bytes)
# web-7d4b8c6f5-abc12      web         12m          58Mi
# web-7d4b8c6f5-abc12      sidecar     3m           6Mi

# All namespaces
kubectl top pods -A --sort-by=cpu
```

Metrics Server provides **point-in-time** resource usage. It does not store history. For historical metrics and alerting, you need Prometheus.

---

## Prometheus and Monitoring

Prometheus is the standard monitoring system for Kubernetes. It uses a **pull-based** model: Prometheus scrapes metrics endpoints from your applications and Kubernetes components.

### How Prometheus Works

```
  ┌─────────────────────────────────────────────────────┐
  │                    Prometheus                         │
  │                                                       │
  │  Scrapes /metrics endpoints every N seconds           │
  │  Stores time-series data in local TSDB                │
  │  Evaluates alerting rules                             │
  │  Exposes PromQL query API                             │
  └──────┬──────────────┬──────────────┬────────────────┘
         │              │              │
    ┌────▼────┐   ┌─────▼─────┐   ┌───▼──────┐
    │ kube    │   │ Your app  │   │ Node     │
    │ state   │   │ /metrics  │   │ exporter │
    │ metrics │   │           │   │          │
    └─────────┘   └───────────┘   └──────────┘

  kube-state-metrics: Pod/Deployment/Service state (phase, replicas, etc.)
  Your app /metrics:  Application-level metrics (request count, latency, etc.)
  Node exporter:      Node-level metrics (CPU, memory, disk, network)
```

### Installing Prometheus (kube-prometheus-stack)

The easiest way to install a full monitoring stack is with the kube-prometheus-stack Helm chart:

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

helm install monitoring prometheus-community/kube-prometheus-stack \
  --namespace monitoring --create-namespace

# Verify
kubectl get pods -n monitoring
# NAME                                                    READY   STATUS
# alertmanager-monitoring-kube-prometheus-alertmanager-0   2/2     Running
# monitoring-grafana-7d4b8c6f5-abc12                      3/3     Running
# monitoring-kube-prometheus-operator-5c8f9d7b2-def34     1/1     Running
# monitoring-kube-state-metrics-8e2a1c4d-ghi56            1/1     Running
# monitoring-prometheus-node-exporter-jkl78               1/1     Running
# prometheus-monitoring-kube-prometheus-prometheus-0       2/2     Running
```

### ServiceMonitor and PodMonitor

The Prometheus Operator uses CRDs (Custom Resource Definitions) to configure what Prometheus scrapes:

*servicemonitor.yaml*

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: my-app
  labels:
    release: monitoring       # must match Prometheus operator selector
spec:
  selector:
    matchLabels:
      app: my-app             # targets Services with this label
  endpoints:
  - port: metrics             # named port on the Service
    interval: 30s
    path: /metrics
```

### Key Kubernetes Metrics

| Metric | Source | What It Tells You |
|--------|--------|-------------------|
| `container_cpu_usage_seconds_total` | cAdvisor | CPU time consumed by container |
| `container_memory_working_set_bytes` | cAdvisor | Memory in active use (OOM killer uses this) |
| `kube_pod_status_phase` | kube-state-metrics | Pod phase (Pending, Running, Failed) |
| `kube_deployment_status_replicas_available` | kube-state-metrics | Healthy replicas |
| `kube_pod_container_status_restarts_total` | kube-state-metrics | Container restart count |
| `kubelet_running_pods` | kubelet | Pods running on each node |

### Grafana

Grafana provides dashboards for visualizing Prometheus metrics. The kube-prometheus-stack installs preconfigured dashboards:

```bash
# Port-forward to access Grafana
kubectl port-forward svc/monitoring-grafana -n monitoring 3000:80

# Open http://localhost:3000
# Default credentials: admin / prom-operator

# Pre-installed dashboards include:
# - Kubernetes / Compute Resources / Cluster
# - Kubernetes / Compute Resources / Namespace (Pods)
# - Kubernetes / Compute Resources / Pod
# - Node Exporter / Nodes
```

> **Tip:** In a production cluster, Prometheus + Grafana gives you dashboards for Pod restarts, resource usage trends, and alerting. Combined with probes, you get both reactive (K8s auto-restarts) and proactive (alerts before things break) reliability.

---

## Events

Kubernetes Events are records of things that happened in the cluster. They are critical for debugging because they capture state transitions that logs may not show.

```bash
# All events in current namespace, sorted by time
kubectl get events --sort-by=.lastTimestamp
# LAST SEEN   TYPE      REASON              OBJECT              MESSAGE
# 2m          Normal    Scheduled           pod/web-abc12       Successfully assigned default/web-abc12 to node-1
# 2m          Normal    Pulling             pod/web-abc12       Pulling image "nginx:1.25"
# 1m          Normal    Pulled              pod/web-abc12       Successfully pulled image "nginx:1.25"
# 1m          Normal    Created             pod/web-abc12       Created container web
# 1m          Normal    Started             pod/web-abc12       Started container web
# 30s         Warning   Unhealthy           pod/api-def34       Readiness probe failed: connection refused
# 10s         Warning   Unhealthy           pod/api-def34       Liveness probe failed: HTTP probe failed with statuscode: 500
# 5s          Normal    Killing             pod/api-def34       Container api failed liveness probe, will be restarted
# 2s          Warning   BackOff             pod/worker-ghi56    Back-off restarting failed container

# Events for a specific Pod
kubectl describe pod api-def34
# (Events section at the bottom shows the Pod's event history)

# Events across all namespaces
kubectl get events -A --sort-by=.lastTimestamp

# Watch events in real-time
kubectl get events -w
# (streams new events as they happen)

# Filter by event type
kubectl get events --field-selector type=Warning
# (shows only Warning events -- failed probes, image pull errors, OOM kills)

# Filter by reason
kubectl get events --field-selector reason=Unhealthy
```

> **Gotcha:** Events are namespaced resources and they **expire after 1 hour** by default (controlled by `--event-ttl` on the API server). Don't rely on events for auditing -- use a log aggregation stack to persist them. For critical debugging, check events first because they disappear fast.

Common events to watch for:

| Event Reason | Type | What It Means |
|-------------|------|---------------|
| `FailedScheduling` | Warning | No node has enough resources for this Pod |
| `Unhealthy` | Warning | A probe failed |
| `Killing` | Normal | Container is being killed (liveness failure, OOM, etc.) |
| `BackOff` | Warning | Container is in CrashLoopBackOff |
| `FailedMount` | Warning | Volume mount failed (Secret/ConfigMap missing) |
| `OOMKilled` | Warning | Container exceeded memory limit |
| `ErrImagePull` | Warning | Can't pull the container image |
| `FailedCreate` | Warning | ReplicaSet can't create a Pod |

---

## Hands-On: Deploy an App with All Three Probes

Let's deploy an app and observe what happens when probes fail.

*Step 1: Deploy with all three probes*

*probed-app.yaml*

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: probed-app
spec:
  replicas: 2
  selector:
    matchLabels:
      app: probed-app
  template:
    metadata:
      labels:
        app: probed-app
    spec:
      containers:
      - name: app
        image: nginx:1.25
        ports:
        - containerPort: 80
        startupProbe:
          httpGet:
            path: /
            port: 80
          periodSeconds: 5
          failureThreshold: 6       # 5 * 6 = 30s max startup
        livenessProbe:
          httpGet:
            path: /
            port: 80
          periodSeconds: 10
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /
            port: 80
          periodSeconds: 5
          failureThreshold: 2
---
apiVersion: v1
kind: Service
metadata:
  name: probed-app
spec:
  selector:
    app: probed-app
  ports:
  - port: 80
    targetPort: 80
```

*Step 2: Deploy and verify*

```bash
kubectl apply -f probed-app.yaml

# Watch the Pods start up
kubectl get pods -l app=probed-app -w
# NAME                          READY   STATUS    RESTARTS   AGE
# probed-app-7d4b8c6f5-abc12   1/1     Running   0          15s
# probed-app-7d4b8c6f5-def34   1/1     Running   0          15s

# Verify endpoints
kubectl get endpoints probed-app
# NAME         ENDPOINTS                          AGE
# probed-app   10.1.0.50:80,10.1.0.51:80          20s
```

*Step 3: Simulate readiness failure*

```bash
# Exec into a Pod and break the readiness check
kubectl exec probed-app-7d4b8c6f5-abc12 -- \
  sh -c "mv /usr/share/nginx/html/index.html /usr/share/nginx/html/index.bak"

# Watch -- the Pod becomes NOT READY but is NOT restarted
kubectl get pods -l app=probed-app -w
# NAME                          READY   STATUS    RESTARTS   AGE
# probed-app-7d4b8c6f5-abc12   0/1     Running   0          2m    ← not ready!
# probed-app-7d4b8c6f5-def34   1/1     Running   0          2m

# Check endpoints -- the unready Pod is removed
kubectl get endpoints probed-app
# NAME         ENDPOINTS        AGE
# probed-app   10.1.0.51:80     2m    ← only one Pod

# Restore it
kubectl exec probed-app-7d4b8c6f5-abc12 -- \
  sh -c "mv /usr/share/nginx/html/index.bak /usr/share/nginx/html/index.html"

# Pod becomes ready again, endpoint is restored
kubectl get endpoints probed-app
# NAME         ENDPOINTS                          AGE
# probed-app   10.1.0.50:80,10.1.0.51:80          3m
```

*Step 4: Simulate liveness failure*

```bash
# Stop nginx inside the container -- liveness probe will fail
kubectl exec probed-app-7d4b8c6f5-def34 -- nginx -s stop

# Watch -- after failureThreshold * periodSeconds (3 * 10 = 30s), container restarts
kubectl get pods -l app=probed-app -w
# NAME                          READY   STATUS    RESTARTS   AGE
# probed-app-7d4b8c6f5-def34   0/1     Running   0          4m
# probed-app-7d4b8c6f5-def34   0/1     Running   1 (2s ago) 4m30s   ← restarted!
# probed-app-7d4b8c6f5-def34   1/1     Running   1 (15s ago) 4m45s  ← healthy again

# Check events
kubectl get events --field-selector involvedObject.name=probed-app-7d4b8c6f5-def34
# Warning  Unhealthy   Liveness probe failed: dial tcp 10.1.0.51:80: connect: connection refused
# Normal   Killing     Container app failed liveness probe, will be restarted
```

Notice the difference: readiness failure removed the Pod from Service endpoints but kept it running. Liveness failure restarted the container entirely.

*Step 5: Clean up*

```bash
kubectl delete -f probed-app.yaml
```

---

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

## Module 13 Summary

- **Probes** tell Kubernetes how to check container health -- without them, K8s only knows if the process is running
- **Liveness probes** answer "is the container alive?" -- failure causes the container to be **restarted** (not the Pod)
- **Readiness probes** answer "can the container serve traffic?" -- failure removes the Pod from **Service endpoints** (no restart)
- **Startup probes** answer "has the container finished starting?" -- delays liveness/readiness until startup completes
- Four probe mechanisms: **httpGet**, **tcpSocket**, **exec**, and **grpc**
- Key parameters: `initialDelaySeconds`, `periodSeconds`, `timeoutSeconds`, `failureThreshold`, `successThreshold`
- **Never check dependencies in liveness probes** -- a database outage should not restart all your Pods (thundering herd)
- Use **startup probes** for slow-starting apps instead of long `initialDelaySeconds` values
- **`kubectl logs`** reads container stdout/stderr -- use `--previous` for crashed containers, `-f` to stream, `--since` for time filtering
- Centralized logging (Fluent Bit/Fluentd to Elasticsearch or Loki) is essential for production -- Pod logs are ephemeral
- **Metrics Server** provides real-time CPU/memory metrics via `kubectl top` and is required for HPA
- **Prometheus** provides pull-based metrics collection, time-series storage, and alerting -- the standard for Kubernetes monitoring
- **Grafana** visualizes Prometheus metrics with preconfigured Kubernetes dashboards
- **Events** (`kubectl get events`) capture cluster state transitions and expire after 1 hour by default -- check them first when debugging
