## Pods

A Pod is the **smallest deployable unit** in Kubernetes. Not a container — a Pod. Every container you run in Kubernetes runs inside a Pod. Most Pods hold a single container, but a Pod can hold multiple containers that need to share network and storage.

```
┌─────────────────────────────────────────────────────────┐
│  POD                                                     │
│  IP: 10.1.0.15                                           │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  Container A  │  │  Container B  │  │  Container C  │   │
│  │  (main app)   │  │  (sidecar)    │  │  (log agent)  │   │
│  │  :8080        │  │  :9090        │  │  :5000        │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
│         │                 │                 │             │
│         └─────── localhost (shared) ────────┘             │
│                                                          │
│  ┌───────────────────────────────────────────────────┐   │
│  │              Shared Volumes                        │   │
│  └───────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

Key properties of a Pod:

- **Shared network namespace** — all containers in a Pod share the same IP address and port space. Container A can reach Container B on `localhost:9090`.
- **Shared storage volumes** — containers in a Pod can mount the same volumes to exchange files.
- **Co-scheduled** — all containers in a Pod run on the same node. They are scheduled, started, and stopped together.
- **Ephemeral** — Pods are mortal. When a Pod dies, it's gone. Controllers (Deployments, ReplicaSets) create new Pods — they don't resurrect old ones.

### Pod vs Container

| Aspect | Container | Pod |
|--------|-----------|-----|
| What it is | A single running process (Docker/containerd image) | A group of one or more containers |
| Network | Gets its own network namespace by default | All containers share one network namespace |
| Scheduling | N/A in Kubernetes | The unit the scheduler places on a node |
| Managed by | The container runtime (containerd) | The kubelet via the API Server |
| IP address | N/A (uses Pod IP) | Gets a unique cluster IP |

> **Gotcha:** You almost never create Pods directly in production. You use Deployments, StatefulSets, or Jobs — which create Pods for you and handle restarts, scaling, and rollouts. Standalone Pods are useful for debugging and one-off tasks.

### When to Use Multi-Container Pods

Use multiple containers in a Pod when the containers are **tightly coupled** — they need to share the same network, storage, or lifecycle. Common examples:

- A web server + a log collector that reads the server's log files from a shared volume
- An app + a proxy sidecar (like Envoy) that handles TLS, retries, and metrics
- An app + an init container that runs database migrations before the app starts

If two containers can run independently on different nodes, they belong in **separate Pods**.

---

### The Pod Spec

Every Pod manifest has the same four-part structure you learned in Module 3. Here's a complete, realistic Pod YAML with annotations explaining every key field:

*pod.yaml*

```yaml
apiVersion: v1                  # Pods are in the core API group
kind: Pod
metadata:
  name: web-app                 # unique within the namespace
  namespace: default            # optional — defaults to "default"
  labels:
    app: web                    # labels for selection by Services, etc.
    version: v1
  annotations:
    description: "Frontend web server"
spec:
  restartPolicy: Always         # Always | OnFailure | Never

  containers:
  - name: web                   # required — unique within the Pod
    image: nginx:1.25           # container image (registry/repo:tag)

    command: ["/bin/sh"]        # overrides the image ENTRYPOINT
    args: ["-c", "nginx -g 'daemon off;'"]  # overrides the image CMD

    ports:
    - containerPort: 80         # documentation only — does NOT expose the port
      name: http                # optional name (used by Services)
      protocol: TCP             # TCP (default) | UDP | SCTP

    env:
    - name: APP_ENV
      value: "production"
    - name: DB_HOST
      value: "postgres.default.svc.cluster.local"

    resources:
      requests:
        cpu: "100m"             # scheduling guarantee (100 millicores)
        memory: "128Mi"         # scheduling guarantee
      limits:
        cpu: "500m"             # hard ceiling — throttled beyond this
        memory: "256Mi"         # hard ceiling — OOMKilled beyond this

    volumeMounts:
    - name: html-volume
      mountPath: /usr/share/nginx/html
      readOnly: true

  volumes:
  - name: html-volume
    emptyDir: {}                # ephemeral volume — lives as long as the Pod
```

> **Gotcha:** `containerPort` is purely informational. It does NOT open or expose the port. It's documentation that tells other developers (and tools like Services) which port the container listens on. The container listens on whatever port its process binds to, regardless of what you put in `containerPort`.

Apply and verify:

```bash
kubectl apply -f pod.yaml
# pod/web-app created

kubectl get pod web-app
# NAME      READY   STATUS    RESTARTS   AGE
# web-app   1/1     Running   0          12s

kubectl get pod web-app -o wide
# NAME      READY   STATUS    RESTARTS   AGE   IP          NODE       ...
# web-app   1/1     Running   0          30s   10.1.0.15   node-1     ...
```

---

### Environment Variables

There are four ways to set environment variables on a container. You'll use all of them in production.

#### Direct Values

The simplest — hardcode the value:

```yaml
env:
- name: APP_ENV
  value: "production"
- name: LOG_LEVEL
  value: "info"
```

#### From a ConfigMap

Reference a key from a ConfigMap (covered in depth in a later module):

```yaml
env:
- name: DATABASE_URL
  valueFrom:
    configMapKeyRef:
      name: app-config         # ConfigMap name
      key: database_url        # key within the ConfigMap
```

#### From a Secret

Reference a key from a Secret (base64-encoded):

```yaml
env:
- name: DB_PASSWORD
  valueFrom:
    secretKeyRef:
      name: db-credentials     # Secret name
      key: password            # key within the Secret
```

#### From the Downward API (Field Refs)

Inject Pod metadata into the container as environment variables. This is the **Downward API** — the Pod tells the container about itself:

```yaml
env:
- name: POD_NAME
  valueFrom:
    fieldRef:
      fieldPath: metadata.name
- name: POD_NAMESPACE
  valueFrom:
    fieldRef:
      fieldPath: metadata.namespace
- name: POD_IP
  valueFrom:
    fieldRef:
      fieldPath: status.podIP
- name: NODE_NAME
  valueFrom:
    fieldRef:
      fieldPath: spec.nodeName
- name: CPU_LIMIT
  valueFrom:
    resourceFieldRef:
      containerName: web
      resource: limits.cpu
```

> **Tip:** The Downward API is invaluable for logging and metrics. Your application can log which Pod and node it's running on without any external configuration. It's also an interview favorite — know `fieldRef` and `resourceFieldRef`.

You can verify environment variables with `exec`:

```bash
kubectl exec web-app -- env | grep POD_
# POD_NAME=web-app
# POD_NAMESPACE=default
# POD_IP=10.1.0.15
```

---

### Multi-Container Patterns

Kubernetes supports three well-known multi-container patterns. All containers in a Pod share the same network and can share volumes.

#### Init Containers

Init containers run **before** any main containers start. They run sequentially (one at a time), and every init container must complete successfully before the next one starts or the main containers begin.

Use cases:
- Wait for a dependent service (database, cache) to be ready
- Clone a git repository into a shared volume
- Run database migrations
- Generate configuration files

*pod-with-init.yaml*

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: web-with-init
  labels:
    app: web
spec:
  initContainers:
  - name: wait-for-db
    image: busybox:1.36
    command:
    - sh
    - -c
    - |
      echo "Waiting for postgres to be ready..."
      until nc -z postgres.default.svc.cluster.local 5432; do
        echo "Postgres not ready, retrying in 2s..."
        sleep 2
      done
      echo "Postgres is ready!"

  - name: run-migrations
    image: myapp/migrations:v1.2
    command: ["./migrate", "--direction=up"]
    env:
    - name: DB_HOST
      value: "postgres.default.svc.cluster.local"

  containers:
  - name: web
    image: myapp/web:v1.2
    ports:
    - containerPort: 8080
```

```
Init Container Execution Flow:

  wait-for-db ──► run-migrations ──► web (main container)
     │                  │                    │
     ▼                  ▼                    ▼
  Must succeed      Must succeed       Starts only after
  before next       before main        all init containers
  init starts       containers         complete
```

Check init container status:

```bash
kubectl get pod web-with-init
# NAME            READY   STATUS     RESTARTS   AGE
# web-with-init   0/1     Init:0/2   0          5s

# After first init completes:
# web-with-init   0/1     Init:1/2   0          8s

# After all init containers complete:
# web-with-init   1/1     Running    0          15s

# View init container logs
kubectl logs web-with-init -c wait-for-db
# Waiting for postgres to be ready...
# Postgres not ready, retrying in 2s...
# Postgres is ready!
```

> **Gotcha:** If an init container fails, the kubelet restarts it (subject to the Pod's `restartPolicy`). The main containers will never start until every init container exits with status 0.

#### Sidecar Containers

Sidecar containers run **alongside** the main container for the entire life of the Pod. They add supporting functionality without modifying the main container.

Use cases:
- Log collection — a sidecar reads log files from a shared volume and ships them to a logging system
- Service mesh proxy — Envoy or Linkerd proxy handles traffic for the main container
- Monitoring agent — Prometheus exporter exposing metrics from the main app

*pod-with-sidecar.yaml*

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: web-with-logging
  labels:
    app: web
spec:
  containers:
  - name: web
    image: nginx:1.25
    ports:
    - containerPort: 80
    volumeMounts:
    - name: shared-logs
      mountPath: /var/log/nginx

  - name: log-collector
    image: fluent/fluent-bit:2.2
    volumeMounts:
    - name: shared-logs
      mountPath: /var/log/nginx
      readOnly: true
    - name: fluent-config
      mountPath: /fluent-bit/etc

  volumes:
  - name: shared-logs
    emptyDir: {}               # both containers read/write this volume
  - name: fluent-config
    configMap:
      name: fluent-bit-config
```

```
┌─────────────────────────────────────────────────┐
│  POD: web-with-logging                           │
│                                                  │
│  ┌───────────┐          ┌──────────────────┐    │
│  │   nginx    │  writes  │  fluent-bit       │    │
│  │  (main)    │ ──────► │  (sidecar)        │    │
│  │  :80       │  logs    │  reads & ships    │    │
│  └───────────┘          └──────────────────┘    │
│        │                         │               │
│        └────── shared-logs ──────┘               │
│               (emptyDir)                         │
└─────────────────────────────────────────────────┘
```

> **Tip:** Kubernetes 1.28+ introduced native sidecar support via `initContainers` with `restartPolicy: Always`. This ensures sidecars start before and stop after the main containers. For earlier versions, sidecar containers are just regular containers in the `containers` array.

#### Ambassador Pattern

The ambassador pattern uses a sidecar container as a **proxy** to simplify how the main container accesses external services. The main container talks to `localhost`, and the ambassador handles connection pooling, routing, or protocol translation.

*pod-with-ambassador.yaml*

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: app-with-ambassador
  labels:
    app: myapp
spec:
  containers:
  - name: app
    image: myapp/api:v2.0
    env:
    - name: REDIS_HOST
      value: "localhost"        # talks to ambassador, not Redis directly
    - name: REDIS_PORT
      value: "6379"

  - name: redis-ambassador
    image: myapp/redis-proxy:v1.0
    ports:
    - containerPort: 6379       # proxies to the actual Redis cluster
    env:
    - name: REDIS_CLUSTER_ADDR
      value: "redis-cluster.prod.svc.cluster.local:6379"
```

```
┌───────────────────────────────────────────────────────┐
│  POD                                                   │
│                                                        │
│  ┌──────────┐   localhost:6379   ┌────────────────┐   │
│  │   app     │ ────────────────► │  ambassador     │   │
│  │  (main)   │                   │  (redis-proxy)  │   │
│  └──────────┘                   └───────┬────────┘   │
│                                          │            │
└──────────────────────────────────────────┼────────────┘
                                           │
                                           ▼
                                  ┌─────────────────┐
                                  │  Redis Cluster    │
                                  │  (external svc)   │
                                  └─────────────────┘
```

The benefit: the app container has zero knowledge of Redis cluster topology, TLS configuration, or failover logic. The ambassador handles all of it.

---

### Resource Requests and Limits

Every production Pod should declare resource requests and limits. Without them, a single noisy Pod can starve the entire node.

#### How They Work

- **Requests** — the amount of CPU/memory the scheduler **guarantees** for the container. The scheduler uses requests to decide which node has capacity. If you request 500m CPU and a node only has 200m free, your Pod won't be scheduled there.
- **Limits** — the **maximum** the container is allowed to use. If it exceeds the memory limit, it gets OOMKilled. If it exceeds the CPU limit, it gets throttled (slowed down, not killed).

```yaml
resources:
  requests:
    cpu: "250m"           # 250 millicores = 0.25 CPU cores
    memory: "128Mi"       # 128 mebibytes
  limits:
    cpu: "1"              # 1 full CPU core (= 1000m)
    memory: "512Mi"       # 512 mebibytes
```

#### CPU and Memory Units

*CPU — measured in cores or millicores*

| Value | Meaning |
|-------|---------|
| `"1"` | 1 full CPU core |
| `"500m"` | 500 millicores = 0.5 cores |
| `"100m"` | 100 millicores = 0.1 cores |
| `"0.1"` | Same as 100m |

*Memory — measured in bytes with suffixes*

| Value | Meaning |
|-------|---------|
| `"128Mi"` | 128 mebibytes (binary: 128 * 1024 * 1024) |
| `"1Gi"` | 1 gibibyte (binary: 1024 * 1024 * 1024) |
| `"256M"` | 256 megabytes (decimal: 256 * 1000 * 1000) |

> **Tip:** Always use `Mi` and `Gi` (binary), not `M` and `G` (decimal). The binary units are what the kernel and kubelet actually use. `128Mi` != `128M`. This trips people up on exams.

#### What Happens When Limits Are Exceeded

```
CPU limit exceeded:
┌─────────────────────────────────────────────────────┐
│  Container wants 800m CPU, limit is 500m             │
│                                                      │
│  Result: THROTTLED                                   │
│  The kernel limits CPU time. The process runs         │
│  slower but stays alive. No restart.                  │
└─────────────────────────────────────────────────────┘

Memory limit exceeded:
┌─────────────────────────────────────────────────────┐
│  Container allocates 600Mi, limit is 512Mi           │
│                                                      │
│  Result: OOMKilled (Out Of Memory Killed)            │
│  The kernel kills the process. The kubelet restarts   │
│  the container (based on restartPolicy).             │
│  Status shows: OOMKilled                             │
└─────────────────────────────────────────────────────┘
```

*pod-with-resources.yaml*

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: resource-demo
spec:
  containers:
  - name: app
    image: myapp/api:v2.0
    resources:
      requests:
        cpu: "250m"
        memory: "256Mi"
      limits:
        cpu: "500m"
        memory: "512Mi"
  - name: sidecar
    image: fluent/fluent-bit:2.2
    resources:
      requests:
        cpu: "50m"
        memory: "64Mi"
      limits:
        cpu: "100m"
        memory: "128Mi"
```

Check resource usage:

```bash
kubectl top pod resource-demo
# NAME            CPU(cores)   MEMORY(bytes)
# resource-demo   120m         180Mi

# Check if a Pod was OOMKilled
kubectl get pod resource-demo -o jsonpath='{.status.containerStatuses[0].lastState}'
# {"terminated":{"exitCode":137,"reason":"OOMKilled",...}}
```

---

### Quality of Service (QoS) Classes

Kubernetes assigns every Pod a **QoS class** based on its resource configuration. The QoS class determines which Pods get evicted first when a node runs out of memory.

#### The Three Classes

**Guaranteed** — requests equal limits for ALL containers in the Pod, for both CPU and memory:

```yaml
# QoS: Guaranteed
containers:
- name: app
  resources:
    requests:
      cpu: "500m"
      memory: "256Mi"
    limits:
      cpu: "500m"           # same as request
      memory: "256Mi"       # same as request
```

**Burstable** — at least one container has a resource request or limit, but they're not all equal:

```yaml
# QoS: Burstable
containers:
- name: app
  resources:
    requests:
      cpu: "250m"
      memory: "128Mi"
    limits:
      cpu: "500m"           # different from request
      memory: "256Mi"       # different from request
```

**BestEffort** — no containers in the Pod have any resource requests or limits:

```yaml
# QoS: BestEffort
containers:
- name: app
  image: nginx:1.25
  # no resources block at all
```

#### Eviction Priority

When a node runs out of memory, the kubelet evicts Pods in this order:

```
Eviction priority (first evicted → last evicted):

  1. BestEffort     ← evicted first (no guarantees)
  2. Burstable      ← evicted next (sorted by how far over request)
  3. Guaranteed     ← evicted last (protected)
```

Check a Pod's QoS class:

```bash
kubectl get pod resource-demo -o jsonpath='{.status.qosClass}'
# Burstable

kubectl describe pod resource-demo | grep "QoS Class"
# QoS Class: Burstable
```

> **Tip:** For critical workloads (databases, core APIs), set requests == limits to get the Guaranteed QoS class. For less critical workloads, Burstable gives you flexibility. Never run BestEffort in production — those Pods will be the first to die.

---

### Pod Lifecycle

Understanding the Pod lifecycle is essential for debugging. A Pod moves through defined phases, and each container within it has its own state.

#### Pod Phases

```
                    ┌──────────┐
                    │ Pending   │  ← Accepted by API Server, waiting to
                    │           │    be scheduled or pull images
                    └────┬─────┘
                         │
                    ┌────▼─────┐
                    │ Running   │  ← At least one container is running
                    │           │    (or starting/restarting)
                    └────┬─────┘
                         │
              ┌──────────┴──────────┐
              │                     │
        ┌─────▼──────┐       ┌─────▼──────┐
        │ Succeeded   │       │  Failed     │
        │             │       │             │
        │ All exited  │       │ At least    │
        │ with 0      │       │ one exited  │
        └─────────────┘       │ non-zero    │
                              └─────────────┘
```

| Phase | Meaning |
|-------|---------|
| **Pending** | Pod is accepted but not yet running. Could be waiting for scheduling, image pull, or volume mount. |
| **Running** | Pod is bound to a node and at least one container is running or restarting. |
| **Succeeded** | All containers exited with code 0. Terminal state (won't restart). |
| **Failed** | All containers terminated and at least one exited non-zero. Terminal state. |
| **Unknown** | Pod state cannot be determined (usually lost communication with the node). |

#### Pod Conditions

Conditions give finer detail than the phase:

```bash
kubectl get pod web-app -o jsonpath='{range .status.conditions[*]}{.type}{"\t"}{.status}{"\n"}{end}'
# PodScheduled     True
# Initialized      True
# ContainersReady  True
# Ready            True
```

| Condition | Meaning |
|-----------|---------|
| **PodScheduled** | Pod has been assigned to a node |
| **Initialized** | All init containers have completed |
| **ContainersReady** | All containers in the Pod are ready |
| **Ready** | Pod can serve requests (used by Services and readiness gates) |

#### Container States

Each container within a Pod has its own state:

| State | Meaning |
|-------|---------|
| **Waiting** | Container is not running — pulling image, applying Secrets, etc. Includes a `reason` field (e.g., `ContainerCreating`, `CrashLoopBackOff`, `ImagePullBackOff`) |
| **Running** | Container is executing. Shows `startedAt` timestamp |
| **Terminated** | Container finished execution. Shows `exitCode`, `reason`, `startedAt`, `finishedAt` |

```bash
# Check container state
kubectl get pod web-app -o jsonpath='{.status.containerStatuses[0].state}'
# {"running":{"startedAt":"2025-01-31T10:00:02Z"}}
```

#### Restart Policy

The `restartPolicy` field controls what happens when a container exits:

| Policy | Behavior | Use With |
|--------|----------|----------|
| **Always** (default) | Restart on any exit (code 0 or non-zero) | Deployments, long-running services |
| **OnFailure** | Restart only on non-zero exit code | Jobs |
| **Never** | Never restart | Jobs (when you want to inspect the failed container) |

> **Gotcha:** `restartPolicy` applies to ALL containers in the Pod — you can't set different policies per container. On restart, the kubelet uses **exponential backoff**: 10s, 20s, 40s, ... up to 5 minutes. That's where CrashLoopBackOff comes from — the container keeps crashing and the wait between restarts keeps growing.

Check restart count:

```bash
kubectl get pod web-app
# NAME      READY   STATUS    RESTARTS     AGE
# web-app   1/1     Running   3 (2m ago)   10m

# See detailed restart info
kubectl describe pod web-app | grep -A 3 "Last State"
#     Last State:     Terminated
#       Reason:       Error
#       Exit Code:    1
#       Started:      Fri, 31 Jan 2025 10:08:00 +0000
```

---

### Debugging Pods

When something goes wrong, you need a systematic approach. Here is the debugging toolkit and a flowchart for the most common failures.

#### kubectl describe pod — Events Are Gold

The events section at the bottom of `describe` output tells you exactly what happened:

```bash
kubectl describe pod broken-app
# ...
# Events:
#   Type     Reason     Age   From               Message
#   ----     ------     ----  ----               -------
#   Normal   Scheduled  60s   default-scheduler  Successfully assigned default/broken-app to node-1
#   Normal   Pulling    58s   kubelet            Pulling image "myapp:latest"
#   Warning  Failed     55s   kubelet            Failed to pull image "myapp:latest":
#                                                 rpc error: image not found
#   Warning  Failed     55s   kubelet            Error: ErrImagePull
#   Normal   BackOff    40s   kubelet            Back-off pulling image "myapp:latest"
#   Warning  Failed     40s   kubelet            Error: ImagePullBackOff
```

#### kubectl logs — Container Output

```bash
# Logs from the default (or only) container
kubectl logs web-app

# Logs from a specific container in a multi-container Pod
kubectl logs web-with-logging -c log-collector

# Follow logs in real time (like tail -f)
kubectl logs web-app -f

# Logs from a previous crashed container (essential for CrashLoopBackOff)
kubectl logs web-app --previous

# Last 50 lines
kubectl logs web-app --tail=50

# Logs from the last hour
kubectl logs web-app --since=1h
```

> **Tip:** When a container is in CrashLoopBackOff, the current container has no logs (it hasn't started yet). Use `--previous` to see the logs from the last run that crashed.

#### kubectl exec — Shell Into a Container

```bash
# Run a single command
kubectl exec web-app -- ls /etc/nginx

# Open an interactive shell
kubectl exec -it web-app -- /bin/sh

# Exec into a specific container
kubectl exec -it web-with-logging -c web -- /bin/bash

# Check network connectivity from inside the Pod
kubectl exec web-app -- curl -s localhost:80
kubectl exec web-app -- nslookup postgres.default.svc.cluster.local
```

#### kubectl debug — Ephemeral Debug Containers

When a container doesn't have a shell (distroless images), you can attach an ephemeral debug container:

```bash
# Attach a debug container with networking tools
kubectl debug -it web-app --image=busybox:1.36 --target=web

# Create a copy of the Pod with a debug container
kubectl debug web-app -it --copy-to=debug-pod --image=ubuntu:22.04

# Debug a node
kubectl debug node/node-1 -it --image=busybox:1.36
```

#### Common Failure Patterns

Here are the failures you'll encounter most often and how to fix them:

**ImagePullBackOff** — Kubernetes can't pull the container image.

```bash
kubectl describe pod broken-app | grep -A 5 "Events"
# Warning  Failed   kubelet  Failed to pull image "myapp:v999": not found

# Fix: Check image name, tag, and registry credentials
# - Is the image name spelled correctly?
# - Does the tag exist?
# - Is the registry private? (you need an imagePullSecret)
```

**CrashLoopBackOff** — The container starts, crashes, and the kubelet keeps restarting it with increasing backoff delays.

```bash
kubectl logs broken-app --previous
# Error: cannot connect to database at postgres:5432

# Fix: Read the logs from the previous container to see why it crashed
# Common causes:
# - Missing environment variable or config
# - Database not reachable
# - Application bug
# - Wrong command/args
```

**Pending** — The Pod can't be scheduled to any node.

```bash
kubectl describe pod stuck-pod | grep -A 5 "Events"
# Warning  FailedScheduling  default-scheduler
#   0/3 nodes are available: 1 Insufficient cpu, 2 Insufficient memory

# Fix: Either reduce the Pod's resource requests
# or add more nodes to the cluster
```

**OOMKilled** — The container exceeded its memory limit.

```bash
kubectl get pod oom-pod -o jsonpath='{.status.containerStatuses[0].lastState.terminated.reason}'
# OOMKilled

# Fix: Increase the memory limit, or fix the memory leak in the application
```

#### Diagnostic Flowchart

```
Pod not working?
│
├── Status: Pending?
│   ├── Events: FailedScheduling?
│   │   └── Check: resource requests too high, node affinity, taints
│   └── Events: no events?
│       └── Check: is the scheduler running? (kube-system)
│
├── Status: ImagePullBackOff / ErrImagePull?
│   └── Check: image name, tag, registry credentials (imagePullSecrets)
│
├── Status: CrashLoopBackOff?
│   ├── kubectl logs <pod> --previous
│   └── Check: env vars, config, dependencies, command/args
│
├── Status: Running but not Ready?
│   └── Check: readiness probe is failing (describe → events/conditions)
│
├── Status: Running but wrong behavior?
│   ├── kubectl logs <pod>
│   ├── kubectl exec -it <pod> -- /bin/sh
│   └── Check: env vars, mounted volumes, network connectivity
│
└── Status: OOMKilled?
    └── Check: increase memory limit or fix memory leak
```

---

### Hands-On Exercise: Multi-Container Pod

Let's build a Pod with an init container, a main container, and a sidecar. Then we'll debug a failure.

**Step 1:** Create the Pod manifest.

*multi-container-exercise.yaml*

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: fullstack-pod
  labels:
    app: fullstack
spec:
  initContainers:
  - name: setup
    image: busybox:1.36
    command:
    - sh
    - -c
    - |
      echo "Generating index.html..."
      cat > /work-dir/index.html <<HTMLEOF
      <html><body>
        <h1>Hello from Kubernetes!</h1>
        <p>Generated by init container at $(date)</p>
      </body></html>
      HTMLEOF
      echo "Setup complete."
    volumeMounts:
    - name: content
      mountPath: /work-dir

  containers:
  - name: web
    image: nginx:1.25
    ports:
    - containerPort: 80
    resources:
      requests:
        cpu: "100m"
        memory: "64Mi"
      limits:
        cpu: "200m"
        memory: "128Mi"
    volumeMounts:
    - name: content
      mountPath: /usr/share/nginx/html
      readOnly: true
    - name: logs
      mountPath: /var/log/nginx

  - name: log-tailer
    image: busybox:1.36
    command: ["sh", "-c", "tail -f /var/log/nginx/access.log 2>/dev/null"]
    resources:
      requests:
        cpu: "50m"
        memory: "32Mi"
      limits:
        cpu: "100m"
        memory: "64Mi"
    volumeMounts:
    - name: logs
      mountPath: /var/log/nginx
      readOnly: true

  volumes:
  - name: content
    emptyDir: {}
  - name: logs
    emptyDir: {}
```

**Step 2:** Apply and watch the Pod come up.

```bash
kubectl apply -f multi-container-exercise.yaml
# pod/fullstack-pod created

# Watch the Pod progress through init → running
kubectl get pod fullstack-pod -w
# NAME            READY   STATUS     RESTARTS   AGE
# fullstack-pod   0/2     Init:0/1   0          2s
# fullstack-pod   0/2     PodInitializing   0   4s
# fullstack-pod   2/2     Running    0          6s
```

**Step 3:** Verify each component.

```bash
# Check init container logs — did it generate the HTML?
kubectl logs fullstack-pod -c setup
# Generating index.html...
# Setup complete.

# Check the web server is serving the generated page
kubectl exec fullstack-pod -c web -- curl -s localhost:80
# <html><body>
#   <h1>Hello from Kubernetes!</h1>
#   <p>Generated by init container at Fri Jan 31 10:00:03 UTC 2025</p>
# </body></html>

# Generate some traffic and check the sidecar picks up logs
kubectl exec fullstack-pod -c web -- curl -s localhost:80 > /dev/null
kubectl logs fullstack-pod -c log-tailer
# 127.0.0.1 - - [31/Jan/2025:10:01:15 +0000] "GET / HTTP/1.1" 200 142 "-" "curl/8.5.0"
```

**Step 4:** Check the Pod's QoS class and resource allocation.

```bash
kubectl describe pod fullstack-pod | grep "QoS Class"
# QoS Class: Burstable

# Why Burstable? Because requests != limits for the containers
```

**Step 5:** Debug a broken version. Let's introduce a failure — change the init container to reference a nonexistent image:

```bash
kubectl delete pod fullstack-pod
# pod "fullstack-pod" deleted

# Edit the manifest: change the init container image to busybox:nonexistent
# Then apply:
kubectl apply -f multi-container-exercise-broken.yaml
# pod/fullstack-pod created

kubectl get pod fullstack-pod
# NAME            READY   STATUS                  RESTARTS   AGE
# fullstack-pod   0/2     Init:ImagePullBackOff   0          30s

kubectl describe pod fullstack-pod | grep -A 4 "Events"
# Events:
#   Type     Reason     Age   From               Message
#   ----     ------     ----  ----               -------
#   Normal   Scheduled  35s   default-scheduler  Successfully assigned ...
#   Warning  Failed     33s   kubelet            Failed to pull image "busybox:nonexistent"

# Fix: correct the image tag and re-apply
```

> **Tip:** Always follow this debugging sequence: (1) `kubectl get pod` to see the status, (2) `kubectl describe pod` to read events, (3) `kubectl logs` (with `--previous` if CrashLoopBackOff) to see application output. This covers 90% of Pod issues.

---

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

## Module 4 Summary

- A **Pod** is the smallest deployable unit in Kubernetes — one or more containers sharing a network namespace and storage volumes
- All containers in a Pod share the same **IP address** and communicate via `localhost`
- The **Pod spec** includes containers, ports, env, resources, volumeMounts, and volumes
- `containerPort` is documentation only — it does not expose or restrict ports
- **Environment variables** can come from direct values, ConfigMaps, Secrets, or the Downward API (`fieldRef`)
- **Init containers** run sequentially before main containers — all must succeed before the Pod starts
- **Sidecar containers** run alongside the main container (log collectors, proxies, monitoring agents)
- **Ambassador containers** proxy external service access through localhost
- **Resource requests** are scheduling guarantees; **limits** are hard ceilings (OOMKilled for memory, throttled for CPU)
- Use `Mi`/`Gi` (binary) for memory and `m` (millicores) for CPU
- **QoS classes**: Guaranteed (requests == limits) > Burstable > BestEffort (evicted first under pressure)
- Pod phases: **Pending** → **Running** → **Succeeded** / **Failed**
- Container states: **Waiting**, **Running**, **Terminated**
- `restartPolicy`: **Always** (default, for services), **OnFailure** (for jobs), **Never**
- Debugging toolkit: `describe` (events), `logs` (`--previous`), `exec -it`, `debug` (ephemeral containers)
- Common failures: **ImagePullBackOff** (bad image), **CrashLoopBackOff** (app crashes), **Pending** (no resources), **OOMKilled** (memory limit exceeded)
