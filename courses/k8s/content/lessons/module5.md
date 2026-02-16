## Workload Controllers

You rarely create Pods directly. If a bare Pod crashes, nothing restarts it. If the node dies, that Pod is gone forever. **Controllers** solve this by managing the Pod lifecycle for you.

### The Reconciliation Loop

Every controller in Kubernetes follows the same pattern:

```
       ┌────────────────────────────────────────────┐
       │           RECONCILIATION LOOP               │
       │                                             │
       │   1. Read DESIRED state (your YAML spec)    │
       │              │                              │
       │              ▼                              │
       │   2. OBSERVE actual state (running Pods)    │
       │              │                              │
       │              ▼                              │
       │   3. ACT to make actual match desired       │
       │              │                              │
       │              └──────── loop forever ─────►  │
       └────────────────────────────────────────────┘

Example: You declare replicas: 3
  - Controller sees 2 Pods running → creates 1 more
  - Controller sees 4 Pods running → deletes 1
  - Controller sees 3 Pods running → does nothing
```

This "desired state vs actual state" model is fundamental. You never say "start a Pod." You say "I want 3 Pods running" and the controller makes it so, continuously.

> **Tip:** This reconciliation pattern is the reason Kubernetes is called a **declarative** system. You declare the end state; controllers figure out how to get there. This is also how self-healing works: if a Pod dies, the controller notices the drift and creates a replacement.

---

## ReplicaSets

A **ReplicaSet** ensures a specified number of identical Pods are running at any time. It is the basic building block behind Deployments.

### ReplicaSet YAML

*replicaset.yaml*

```yaml
apiVersion: apps/v1
kind: ReplicaSet
metadata:
  name: web
  labels:
    app: web
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web           # ← must match template labels
  template:              # ← Pod template (same as a Pod spec)
    metadata:
      labels:
        app: web         # ← must match selector above
    spec:
      containers:
      - name: nginx
        image: nginx:1.25
        ports:
        - containerPort: 80
```

The **selector** and **template labels** must match. The selector tells the ReplicaSet which Pods to count as "mine." The template defines what new Pods should look like.

```bash
kubectl apply -f replicaset.yaml

kubectl get rs
# NAME   DESIRED   CURRENT   READY   AGE
# web    3         3         3       10s

kubectl get pods -l app=web
# NAME        READY   STATUS    RESTARTS   AGE
# web-7k2xq   1/1     Running   0          10s
# web-b8m4t   1/1     Running   0          10s
# web-dn5rz   1/1     Running   0          10s

# Delete a Pod — the ReplicaSet immediately creates a replacement
kubectl delete pod web-7k2xq
kubectl get pods -l app=web
# NAME        READY   STATUS    RESTARTS   AGE
# web-b8m4t   1/1     Running   0          45s
# web-dn5rz   1/1     Running   0          45s
# web-pq8nv   1/1     Running   0          3s    ← replacement
```

> **Gotcha:** You almost never create ReplicaSets directly. **Deployments** manage ReplicaSets for you and add rolling update capabilities. If an interviewer asks "when would you create a ReplicaSet directly?", the answer is almost always "I wouldn't — I'd use a Deployment."

---

## Deployments

Deployments are the workhorse of Kubernetes. They manage ReplicaSets, which in turn manage Pods. This three-layer hierarchy enables rolling updates and rollbacks.

### The Deployment Hierarchy

```
  ┌─────────────────────────────────────────────────────────────┐
  │                      DEPLOYMENT                              │
  │                      name: web                               │
  │                      replicas: 3                             │
  │                      image: nginx:1.25                       │
  │                                                              │
  │   ┌──────────────────────────────────────────────────────┐   │
  │   │              REPLICASET (managed)                      │   │
  │   │              web-7d4b8c6f5                             │   │
  │   │              replicas: 3                               │   │
  │   │                                                        │   │
  │   │   ┌──────────┐  ┌──────────┐  ┌──────────┐            │   │
  │   │   │  Pod     │  │  Pod     │  │  Pod     │            │   │
  │   │   │  web-    │  │  web-    │  │  web-    │            │   │
  │   │   │  7d4b-   │  │  7d4b-   │  │  7d4b-   │            │   │
  │   │   │  abc12   │  │  def34   │  │  ghi56   │            │   │
  │   │   └──────────┘  └──────────┘  └──────────┘            │   │
  │   └──────────────────────────────────────────────────────┘   │
  └─────────────────────────────────────────────────────────────┘

  Deployment → creates/manages → ReplicaSet → creates/manages → Pods
```

The Pod names follow the pattern: `<deployment>-<replicaset-hash>-<random>`. When you see `web-7d4b8c6f5-abc12`, the `7d4b8c6f5` is the ReplicaSet template hash.

### Complete Deployment YAML

*deployment.yaml*

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels:
    app: web
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web
  strategy:
    type: RollingUpdate           # default
    rollingUpdate:
      maxSurge: 1                 # max Pods over desired count during update
      maxUnavailable: 0           # max Pods that can be unavailable during update
  revisionHistoryLimit: 10        # keep 10 old ReplicaSets for rollback (default)
  minReadySeconds: 5              # wait 5s after Pod is Ready before considering it Available
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
      - name: nginx
        image: nginx:1.25
        ports:
        - containerPort: 80
        resources:
          requests:
            cpu: 100m
            memory: 128Mi
          limits:
            cpu: 250m
            memory: 256Mi
```

### Creating a Deployment

*Imperative (quick ad-hoc)*

```bash
kubectl create deployment web --image=nginx:1.25 --replicas=3
# deployment.apps/web created
```

*Declarative (production)*

```bash
kubectl apply -f deployment.yaml
# deployment.apps/web created

kubectl get deploy
# NAME   READY   UP-TO-DATE   AVAILABLE   AGE
# web    3/3     3            3           15s

kubectl get rs
# NAME              DESIRED   CURRENT   READY   AGE
# web-7d4b8c6f5     3         3         3       15s

kubectl get pods
# NAME                   READY   STATUS    RESTARTS   AGE
# web-7d4b8c6f5-abc12    1/1     Running   0          15s
# web-7d4b8c6f5-def34    1/1     Running   0          15s
# web-7d4b8c6f5-ghi56    1/1     Running   0          15s
```

### Scaling

```bash
# Imperative scaling
kubectl scale deployment web --replicas=5
# deployment.apps/web scaled

kubectl get deploy web
# NAME   READY   UP-TO-DATE   AVAILABLE   AGE
# web    5/5     5            5           2m

# Or edit the YAML and re-apply
# spec:
#   replicas: 5
kubectl apply -f deployment.yaml
```

Scaling doesn't create a new ReplicaSet. The existing ReplicaSet simply adjusts its Pod count.

### Rolling Updates

Rolling updates are the default strategy. When you change the Pod template (image, env, resources, etc.), the Deployment creates a **new ReplicaSet** and gradually shifts Pods from old to new.

```
Rolling Update: nginx:1.25 → nginx:1.26

Step 1: New RS created, starts scaling up
  OLD RS (web-7d4b8c6f5):  ████ ████ ████     3 Pods
  NEW RS (web-59d6c8b449):                     0 Pods

Step 2: New RS scales up, old RS scales down
  OLD RS (web-7d4b8c6f5):  ████ ████           2 Pods
  NEW RS (web-59d6c8b449): ████ ████           2 Pods

Step 3: Continues until complete
  OLD RS (web-7d4b8c6f5):  ████                1 Pod
  NEW RS (web-59d6c8b449): ████ ████ ████      3 Pods

Step 4: Complete
  OLD RS (web-7d4b8c6f5):                      0 Pods (kept for rollback)
  NEW RS (web-59d6c8b449): ████ ████ ████      3 Pods
```

*Trigger a rolling update*

```bash
# Change the image
kubectl set image deployment/web nginx=nginx:1.26
# deployment.apps/web image updated

# Watch the rollout
kubectl rollout status deployment web
# Waiting for deployment "web" rollout to finish: 1 out of 3 new replicas have been updated...
# Waiting for deployment "web" rollout to finish: 2 out of 3 new replicas have been updated...
# Waiting for deployment "web" rollout to finish: 2 of 3 updated replicas are available...
# deployment "web" successfully rolled out

# Now you'll see two ReplicaSets
kubectl get rs
# NAME              DESIRED   CURRENT   READY   AGE
# web-59d6c8b449    3         3         3       30s    ← new (nginx:1.26)
# web-7d4b8c6f5     0         0         0       5m     ← old (kept for rollback)
```

### maxSurge and maxUnavailable

These two parameters control the speed and safety of rolling updates:

| Parameter | Meaning | Example (3 replicas) |
|-----------|---------|---------------------|
| `maxSurge` | Max extra Pods allowed above desired count | `1` means up to 4 Pods total |
| `maxUnavailable` | Max Pods that can be down during update | `1` means at least 2 must be ready |

Common configurations:

```yaml
# Default — balanced speed and availability
strategy:
  rollingUpdate:
    maxSurge: 25%           # rounds up: ceil(3 * 0.25) = 1
    maxUnavailable: 25%     # rounds down: floor(3 * 0.25) = 0 → at least 1

# Zero-downtime — always have full capacity
strategy:
  rollingUpdate:
    maxSurge: 1
    maxUnavailable: 0       # never go below 3 running Pods

# Fast update — allow temporary reduced capacity
strategy:
  rollingUpdate:
    maxSurge: 2
    maxUnavailable: 1       # can drop to 2 Pods briefly
```

> **Tip:** For production, use `maxUnavailable: 0` with `maxSurge: 1`. This means you always have at least the desired number of Pods running. The trade-off: you need one extra Pod worth of cluster capacity during updates.

### Rollback

Every time a Deployment's Pod template changes, a new **revision** is recorded. You can roll back to any previous revision.

```bash
# View revision history
kubectl rollout history deployment web
# deployment.apps/web
# REVISION  CHANGE-CAUSE
# 1         <none>
# 2         <none>

# See details of a specific revision
kubectl rollout history deployment web --revision=1
# deployment.apps/web with revision #1
# Pod Template:
#   Labels:       app=web
#                 pod-template-hash=7d4b8c6f5
#   Containers:
#    nginx:
#     Image:      nginx:1.25

# Roll back to the previous revision
kubectl rollout undo deployment web
# deployment.apps/web rolled back

# Roll back to a specific revision
kubectl rollout undo deployment web --to-revision=1
# deployment.apps/web rolled back

# Verify
kubectl get deploy web -o jsonpath='{.spec.template.spec.containers[0].image}'
# nginx:1.25
```

> **Tip:** To make `CHANGE-CAUSE` useful, annotate your Deployments when updating:
> ```bash
> kubectl annotate deployment web kubernetes.io/change-cause="Update nginx to 1.26"
> ```
> Or use `kubectl apply -f deployment.yaml` with `--record` (deprecated but still works in older clusters).

The `revisionHistoryLimit` field controls how many old ReplicaSets are kept. Default is 10. Set it lower if you have many Deployments and want to save resources (each old ReplicaSet is a Kubernetes object, even with 0 replicas).

### Update Strategies

#### RollingUpdate (default)

Gradually replaces Pods. Zero downtime when configured correctly. Suitable for most stateless applications.

#### Recreate

Kills all existing Pods **before** creating new ones. There **will** be downtime.

```yaml
spec:
  strategy:
    type: Recreate           # no rollingUpdate settings needed
```

When to use Recreate:

- **Database schema migrations** — you can't have old code and new code running simultaneously against different schema versions
- **Singleton workloads** — only one instance can run at a time (e.g., a controller that holds a lock)
- **Incompatible versions** — old and new versions can't coexist (different API contracts, shared file locks)
- **GPU workloads** — can't afford to double-allocate expensive GPU resources during updates

### Pause and Resume Rollouts

You can pause a rollout partway through to test the new version with a fraction of traffic (a simple canary technique):

```bash
# Start an update
kubectl set image deployment/web nginx=nginx:1.26

# Immediately pause — only some Pods will have updated
kubectl rollout pause deployment web
# deployment.apps/web paused

# Check the current state
kubectl get rs
# NAME              DESIRED   CURRENT   READY   AGE
# web-59d6c8b449    1         1         1       5s     ← new, partially rolled out
# web-7d4b8c6f5     2         2         2       10m    ← old, still running

# Test the new version, check metrics, verify logs...

# If everything looks good, resume
kubectl rollout resume deployment web
# deployment.apps/web resumed

# If something is wrong, undo instead
kubectl rollout undo deployment web
```

---

## DaemonSets

A **DaemonSet** ensures that **one Pod** runs on every node (or a subset of nodes). When a new node joins the cluster, the DaemonSet automatically schedules a Pod on it. When a node is removed, the Pod is garbage collected.

### Use Cases

- **Log collection** — Fluentd, Filebeat, Fluent Bit on every node
- **Monitoring agents** — Prometheus node-exporter, Datadog agent
- **Networking** — kube-proxy, CNI plugins (Calico, Cilium), kube-dns
- **Storage** — CSI node drivers, Ceph agents

### DaemonSet YAML

*daemonset.yaml*

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: fluentd
  namespace: kube-system
  labels:
    app: fluentd
spec:
  selector:
    matchLabels:
      app: fluentd
  updateStrategy:
    type: RollingUpdate            # or OnDelete
    rollingUpdate:
      maxUnavailable: 1            # update one node at a time
  template:
    metadata:
      labels:
        app: fluentd
    spec:
      tolerations:
      - key: node-role.kubernetes.io/control-plane
        effect: NoSchedule         # run on control-plane nodes too
      containers:
      - name: fluentd
        image: fluentd:v1.16
        resources:
          limits:
            memory: 200Mi
          requests:
            cpu: 100m
            memory: 200Mi
        volumeMounts:
        - name: varlog
          mountPath: /var/log
      volumes:
      - name: varlog
        hostPath:
          path: /var/log
```

```bash
kubectl apply -f daemonset.yaml

kubectl get ds -n kube-system
# NAME      DESIRED   CURRENT   READY   UP-TO-DATE   AVAILABLE   NODE SELECTOR   AGE
# fluentd   3         3         3       3            3           <none>          10s

# One Pod per node
kubectl get pods -n kube-system -l app=fluentd -o wide
# NAME            READY   STATUS    RESTARTS   AGE   IP          NODE
# fluentd-abc12   1/1     Running   0          10s   10.1.0.5    node-1
# fluentd-def34   1/1     Running   0          10s   10.1.1.8    node-2
# fluentd-ghi56   1/1     Running   0          10s   10.1.2.3    node-3
```

### DaemonSet on a Subset of Nodes

Use `nodeSelector` or `nodeAffinity` to target specific nodes:

```yaml
spec:
  template:
    spec:
      nodeSelector:
        disk: ssd                  # only nodes labeled disk=ssd
```

### Update Strategies

| Strategy | Behavior |
|----------|----------|
| **RollingUpdate** (default) | Updates Pods one node at a time. `maxUnavailable` controls the pace. |
| **OnDelete** | Only updates a Pod when you manually delete it. Gives you full control over when each node updates. |

> **Gotcha:** DaemonSets don't have `maxSurge` — you can't run two DaemonSet Pods on the same node. Each node gets exactly one. During a rolling update, the old Pod is killed before the new one starts on that node.

---

## StatefulSets

StatefulSets are for workloads that need **stable identity** and **persistent storage**. Unlike Deployments, which treat all Pods as interchangeable, StatefulSets give each Pod a unique, predictable identity.

### Three Guarantees

1. **Stable network identity** — Pods are named `<statefulset>-0`, `<statefulset>-1`, `<statefulset>-2`, etc. These names never change.
2. **Stable persistent storage** — Each Pod gets its own PersistentVolumeClaim that survives Pod rescheduling.
3. **Ordered deployment and scaling** — Pods are created in order (0, 1, 2) and deleted in reverse (2, 1, 0).

```
  Deployment Pods:              StatefulSet Pods:
  (interchangeable)             (unique identity)

  web-7d4b-abc12                mysql-0    ← always the primary
  web-7d4b-def34                mysql-1    ← always a replica
  web-7d4b-ghi56                mysql-2    ← always a replica

  Random names,                 Predictable names,
  shared storage,               per-Pod storage,
  any order                     strict ordering
```

### Headless Service Requirement

StatefulSets require a **headless Service** (`clusterIP: None`) to give each Pod a stable DNS name:

```
Normal Service:     mysql.default.svc.cluster.local → random Pod IP
Headless Service:   mysql-0.mysql.default.svc.cluster.local → Pod 0's IP
                    mysql-1.mysql.default.svc.cluster.local → Pod 1's IP
                    mysql-2.mysql.default.svc.cluster.local → Pod 2's IP
```

### StatefulSet YAML

*statefulset.yaml*

```yaml
apiVersion: v1
kind: Service
metadata:
  name: mysql
  labels:
    app: mysql
spec:
  clusterIP: None                  # ← headless Service
  selector:
    app: mysql
  ports:
  - port: 3306
    name: mysql
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: mysql
spec:
  serviceName: mysql               # ← must reference the headless Service
  replicas: 3
  selector:
    matchLabels:
      app: mysql
  podManagementPolicy: OrderedReady  # default: create 0, wait, create 1, wait, create 2
  updateStrategy:
    type: RollingUpdate
    rollingUpdate:
      partition: 0                 # update all Pods (set higher for canary)
  template:
    metadata:
      labels:
        app: mysql
    spec:
      containers:
      - name: mysql
        image: mysql:8.0
        ports:
        - containerPort: 3306
          name: mysql
        env:
        - name: MYSQL_ROOT_PASSWORD
          valueFrom:
            secretKeyRef:
              name: mysql-secret
              key: password
        volumeMounts:
        - name: data
          mountPath: /var/lib/mysql
  volumeClaimTemplates:            # ← per-Pod persistent storage
  - metadata:
      name: data
    spec:
      accessModes: ["ReadWriteOnce"]
      storageClassName: standard
      resources:
        requests:
          storage: 10Gi
```

```bash
kubectl apply -f statefulset.yaml

# Pods are created in order
kubectl get pods -w
# NAME      READY   STATUS    RESTARTS   AGE
# mysql-0   1/1     Running   0          30s    ← created first
# mysql-1   1/1     Running   0          20s    ← created after mysql-0 is Ready
# mysql-2   1/1     Running   0          10s    ← created after mysql-1 is Ready

# Each Pod has its own PVC
kubectl get pvc
# NAME           STATUS   VOLUME         CAPACITY   ACCESS MODES   STORAGECLASS   AGE
# data-mysql-0   Bound    pv-abc123      10Gi       RWO            standard       30s
# data-mysql-1   Bound    pv-def456      10Gi       RWO            standard       20s
# data-mysql-2   Bound    pv-ghi789      10Gi       RWO            standard       10s

# Stable DNS names via the headless Service
kubectl run test --image=busybox --rm -it -- nslookup mysql-0.mysql
# Name:      mysql-0.mysql.default.svc.cluster.local
# Address:   10.1.0.50
```

### Pod Management Policies

| Policy | Behavior |
|--------|----------|
| **OrderedReady** (default) | Create Pods sequentially (0 → 1 → 2). Wait for each to be Ready before creating the next. Delete in reverse order (2 → 1 → 0). |
| **Parallel** | Create and delete all Pods simultaneously. Use when ordering doesn't matter but you still need stable identity and storage. |

### Key Behaviors

- **Scaling up:** Pods are added in order. `mysql-3` is created after `mysql-2` is Ready.
- **Scaling down:** Pods are removed in reverse order. `mysql-2` is deleted first, then `mysql-1`.
- **Pod rescheduled:** If `mysql-1` dies, it is recreated with the **same name** and reattached to the **same PVC** (`data-mysql-1`).
- **Deletion:** `kubectl delete statefulset mysql` deletes the StatefulSet but does **not** delete the PVCs. Data is preserved. You must delete PVCs manually.

> **Gotcha:** `volumeClaimTemplates` create PVCs that persist after the StatefulSet is deleted. This is intentional — it protects data. But it also means you can accumulate orphaned PVCs. Always clean up PVCs when decommissioning a StatefulSet: `kubectl delete pvc -l app=mysql`.

### Use Cases

- **Databases:** MySQL, PostgreSQL, MongoDB (primary/replica topology)
- **Distributed systems:** Kafka brokers, ZooKeeper nodes, etcd members
- **Search engines:** Elasticsearch nodes
- **Any workload** where Pods need to know their own identity or maintain unique state

---

## Jobs

A **Job** creates Pods that run to completion. Unlike Deployments (which restart Pods forever), a Job's Pods exit when done and are not restarted.

### Job YAML

*job.yaml*

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: data-migration
spec:
  completions: 1                   # how many Pods must succeed (default: 1)
  parallelism: 1                   # how many Pods run at once (default: 1)
  backoffLimit: 3                  # retry count before marking as Failed
  activeDeadlineSeconds: 600       # timeout: kill after 10 minutes
  template:
    spec:
      restartPolicy: Never         # required: Never or OnFailure
      containers:
      - name: migrate
        image: myapp/migrate:v2
        command: ["python", "migrate.py"]
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: db-secret
              key: url
```

```bash
kubectl apply -f job.yaml

kubectl get jobs
# NAME              COMPLETIONS   DURATION   AGE
# data-migration    1/1           25s        30s

kubectl get pods
# NAME                    READY   STATUS      RESTARTS   AGE
# data-migration-7k2xq    0/1     Completed   0          30s

# Check logs
kubectl logs data-migration-7k2xq
# Running migration v2...
# Applied 15 migrations.
# Done.
```

### Completion and Parallelism Patterns

```yaml
# Single task (default)
completions: 1
parallelism: 1
# → 1 Pod runs to completion

# Fixed completion count — process exactly 5 items
completions: 5
parallelism: 2
# → 2 Pods run at a time, until 5 total succeed

# Work queue — Pods determine when to stop themselves
completions: null        # or omit
parallelism: 3
# → 3 Pods run simultaneously, each pulls work from a queue
# → Job completes when any Pod succeeds (all others are stopped)
```

### restartPolicy: Never vs OnFailure

| Policy | Behavior |
|--------|----------|
| `Never` | If the Pod fails, the Job creates a **new** Pod. Old Pods are kept (for log inspection). You may see multiple failed Pods. |
| `OnFailure` | If the container fails, kubelet restarts it **in the same Pod**. Cleaner, but you lose logs from previous attempts. |

> **Tip:** Use `restartPolicy: Never` during development (you can inspect failed Pods). Use `OnFailure` in production (fewer leftover Pods to clean up).

### activeDeadlineSeconds

A hard timeout for the entire Job. If the Job hasn't completed in this many seconds, Kubernetes kills all running Pods and marks the Job as Failed:

```yaml
spec:
  activeDeadlineSeconds: 3600      # fail after 1 hour
  backoffLimit: 3                  # also fail after 3 retries
```

Both limits apply. Whichever triggers first marks the Job as Failed.

---

## CronJobs

A **CronJob** creates Jobs on a schedule, using standard cron syntax.

### CronJob YAML

*cronjob.yaml*

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: db-backup
spec:
  schedule: "0 2 * * *"                     # daily at 2:00 AM
  concurrencyPolicy: Forbid                 # don't start new if previous is still running
  startingDeadlineSeconds: 300               # if missed by 5 min, skip this run
  successfulJobsHistoryLimit: 3              # keep last 3 successful Jobs
  failedJobsHistoryLimit: 1                  # keep last 1 failed Job
  suspend: false                             # set true to pause the schedule
  jobTemplate:
    spec:
      backoffLimit: 2
      activeDeadlineSeconds: 3600
      template:
        spec:
          restartPolicy: OnFailure
          containers:
          - name: backup
            image: myapp/db-backup:latest
            command: ["/bin/sh", "-c", "pg_dump $DATABASE_URL | gzip > /backups/$(date +%F).sql.gz"]
            env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: db-secret
                  key: url
```

```bash
kubectl apply -f cronjob.yaml

kubectl get cronjobs
# NAME        SCHEDULE      SUSPEND   ACTIVE   LAST SCHEDULE   AGE
# db-backup   0 2 * * *     False     0        <none>          5s

# Manually trigger a run (for testing)
kubectl create job db-backup-manual --from=cronjob/db-backup
# job.batch/db-backup-manual created

# Check the Job
kubectl get jobs
# NAME               COMPLETIONS   DURATION   AGE
# db-backup-manual   1/1           12s        15s
```

### Cron Schedule Reference

```
┌───────────── minute (0 - 59)
│ ┌───────────── hour (0 - 23)
│ │ ┌───────────── day of month (1 - 31)
│ │ │ ┌───────────── month (1 - 12)
│ │ │ │ ┌───────────── day of week (0 - 6, Sun = 0)
│ │ │ │ │
* * * * *
```

| Expression | Meaning |
|-----------|---------|
| `*/5 * * * *` | Every 5 minutes |
| `0 * * * *` | Every hour, on the hour |
| `0 2 * * *` | Daily at 2:00 AM |
| `0 0 * * 0` | Weekly, Sunday at midnight |
| `0 0 1 * *` | Monthly, 1st day at midnight |
| `30 8 * * 1-5` | Weekdays at 8:30 AM |
| `0 0,12 * * *` | Twice daily at midnight and noon |

### concurrencyPolicy

Controls what happens when a new scheduled run fires while the previous Job is still running:

| Policy | Behavior |
|--------|----------|
| **Allow** (default) | Multiple Jobs can run concurrently. Use for independent tasks. |
| **Forbid** | Skip the new run if the previous is still active. Use for tasks that shouldn't overlap (DB backups). |
| **Replace** | Kill the running Job and start a new one. Use for tasks where only the latest run matters. |

> **Gotcha:** If `startingDeadlineSeconds` is not set and the CronJob controller misses more than 100 consecutive schedules (e.g., the controller was down), it will stop scheduling entirely. Always set `startingDeadlineSeconds` to avoid this edge case.

---

## Controller Comparison

| Controller | Replicas | Identity | Storage | Use Case |
|-----------|----------|----------|---------|----------|
| **ReplicaSet** | N identical | Random names | Shared | (Managed by Deployments) |
| **Deployment** | N identical | Random names | Shared | Stateless apps: web servers, APIs |
| **DaemonSet** | 1 per node | Per-node | Shared/host | Node agents: logs, monitoring, networking |
| **StatefulSet** | N ordered | Stable names (0,1,2) | Per-Pod PVC | Databases, distributed systems |
| **Job** | Run-to-completion | Random names | Optional | Migrations, batch processing |
| **CronJob** | Scheduled Jobs | Per-Job | Optional | Backups, reports, periodic cleanup |

Decision flow:

```
Does the workload run forever or to completion?

  RUN FOREVER:
    Need one Pod per node? ──────────────► DaemonSet
    Need stable identity/storage? ───────► StatefulSet
    Stateless? ──────────────────────────► Deployment

  RUN TO COMPLETION:
    Run on a schedule? ──────────────────► CronJob
    Run once (or fixed count)? ──────────► Job
```

---

## Hands-On: Deploy, Update, and Rollback

Let's walk through the complete lifecycle of a Deployment with a rolling update and rollback.

*Step 1 — Create the Deployment*

```bash
# Create a Deployment with 3 replicas running nginx:1.24
kubectl create deployment webapp --image=nginx:1.24 --replicas=3
# deployment.apps/webapp created

kubectl rollout status deployment webapp
# deployment "webapp" successfully rolled out

kubectl get deploy webapp
# NAME     READY   UP-TO-DATE   AVAILABLE   AGE
# webapp   3/3     3            3           15s

kubectl get rs
# NAME               DESIRED   CURRENT   READY   AGE
# webapp-6b7c4f8d9    3         3         3       15s
```

*Step 2 — Rolling update to nginx:1.25*

```bash
# Update the image
kubectl set image deployment/webapp nginx=nginx:1.25
# deployment.apps/webapp image updated

# Watch the rollout
kubectl rollout status deployment webapp
# Waiting for deployment "webapp" rollout to finish: 1 out of 3 new replicas have been updated...
# Waiting for deployment "webapp" rollout to finish: 2 out of 3 new replicas have been updated...
# deployment "webapp" successfully rolled out

# Two ReplicaSets now exist
kubectl get rs
# NAME               DESIRED   CURRENT   READY   AGE
# webapp-6b7c4f8d9    0         0         0       2m     ← old (nginx:1.24)
# webapp-85b4d7f69    3         3         3       30s    ← new (nginx:1.25)
```

*Step 3 — Another update to nginx:1.26*

```bash
kubectl set image deployment/webapp nginx=nginx:1.26
kubectl rollout status deployment webapp
# deployment "webapp" successfully rolled out

kubectl get rs
# NAME               DESIRED   CURRENT   READY   AGE
# webapp-6b7c4f8d9    0         0         0       4m     ← revision 1 (nginx:1.24)
# webapp-85b4d7f69    0         0         0       2m     ← revision 2 (nginx:1.25)
# webapp-c4e6a1b32    3         3         3       30s    ← revision 3 (nginx:1.26)
```

*Step 4 — Check revision history*

```bash
kubectl rollout history deployment webapp
# deployment.apps/webapp
# REVISION  CHANGE-CAUSE
# 1         <none>
# 2         <none>
# 3         <none>

# Inspect revision 1
kubectl rollout history deployment webapp --revision=1
# Pod Template:
#   Containers:
#    nginx:
#     Image:      nginx:1.24

# Inspect revision 2
kubectl rollout history deployment webapp --revision=2
# Pod Template:
#   Containers:
#    nginx:
#     Image:      nginx:1.25
```

*Step 5 — Rollback to nginx:1.25 (revision 2)*

```bash
kubectl rollout undo deployment webapp --to-revision=2
# deployment.apps/webapp rolled back

# Verify the image
kubectl get deploy webapp -o jsonpath='{.spec.template.spec.containers[0].image}'
# nginx:1.25

# The old ReplicaSet for nginx:1.25 scales back up
kubectl get rs
# NAME               DESIRED   CURRENT   READY   AGE
# webapp-6b7c4f8d9    0         0         0       6m     ← nginx:1.24
# webapp-85b4d7f69    3         3         3       30s    ← nginx:1.25 (rolled back to)
# webapp-c4e6a1b32    0         0         0       2m     ← nginx:1.26

# Note: the rollback creates a NEW revision (4), which reuses the old RS
kubectl rollout history deployment webapp
# REVISION  CHANGE-CAUSE
# 1         <none>
# 3         <none>
# 4         <none>      ← revision 2 became revision 4 after rollback
```

*Step 6 — Clean up*

```bash
kubectl delete deployment webapp
# deployment.apps/webapp deleted
```

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

## Module 5 Summary

- **Controllers** manage the Pod lifecycle via a reconciliation loop: compare desired state to actual state, then act
- You almost never create bare Pods — controllers provide self-healing, scaling, and update capabilities
- **ReplicaSets** ensure N identical Pods are running; they are managed by Deployments, not created directly
- **Deployments** are the primary controller for stateless apps: Deployment → ReplicaSet → Pods
- **Rolling updates** create a new ReplicaSet and gradually shift traffic; controlled by `maxSurge` and `maxUnavailable`
- **Rollback** with `kubectl rollout undo` — old ReplicaSets are kept (up to `revisionHistoryLimit`) for instant rollback
- **Recreate** strategy kills all old Pods before starting new ones — use for workloads that can't have two versions running
- `kubectl rollout pause/resume` enables canary-style partial rollouts
- **DaemonSets** run one Pod per node — log collectors, monitoring agents, network plugins
- **StatefulSets** provide stable network identity (`pod-0`, `pod-1`), persistent per-Pod storage, and ordered operations — use for databases and distributed systems
- StatefulSets require a **headless Service** (`clusterIP: None`) and use `volumeClaimTemplates` for storage
- **Jobs** run Pods to completion — batch processing, migrations, one-off tasks
- `completions` and `parallelism` control how many Pods run and how many must succeed
- **CronJobs** create Jobs on a cron schedule — backups, reports, periodic maintenance
- `concurrencyPolicy` (Allow, Forbid, Replace) controls overlapping CronJob runs
- Decision: stateless long-running → Deployment, per-node → DaemonSet, stateful → StatefulSet, run-once → Job, scheduled → CronJob
