## Cluster Management

Running a Kubernetes cluster means more than deploying workloads. You need to manage nodes, control where Pods land, perform upgrades without downtime, and back up cluster state. This module covers the operational side of Kubernetes — the skills that separate someone who uses K8s from someone who runs it.

```
                            Cluster Management
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐        │
│  │ Node Mgmt    │   │ Scheduling   │   │  Maintenance │        │
│  │              │   │  Controls    │   │              │        │
│  │ labels       │   │ taints       │   │ cordon       │        │
│  │ conditions   │   │ tolerations  │   │ drain        │        │
│  │ roles        │   │ affinity     │   │ uncordon     │        │
│  │ capacity     │   │ topology     │   │ upgrades     │        │
│  └──────────────┘   └──────────────┘   └──────────────┘        │
│                                                                 │
│  ┌──────────────┐   ┌──────────────┐                           │
│  │ etcd Backup  │   │ Multi-Cluster│                           │
│  │ & Restore    │   │ Operations   │                           │
│  │              │   │              │                           │
│  │ snapshot     │   │ contexts     │                           │
│  │ restore      │   │ federation   │                           │
│  └──────────────┘   └──────────────┘                           │
└─────────────────────────────────────────────────────────────────┘
```

### Node Management

Nodes are the machines (physical or virtual) that run your workloads. Managing them is a core cluster admin task.

#### Listing Nodes

```bash
kubectl get nodes
# NAME           STATUS   ROLES           AGE   VERSION
# control-01     Ready    control-plane   45d   v1.30.2
# worker-01      Ready    <none>          45d   v1.30.2
# worker-02      Ready    <none>          45d   v1.30.2
# worker-03      Ready    <none>          44d   v1.30.2

# Wider output shows OS, kernel, container runtime
kubectl get nodes -o wide
# NAME         STATUS   ROLES           AGE   VERSION   INTERNAL-IP   OS-IMAGE             KERNEL-VERSION   CONTAINER-RUNTIME
# control-01   Ready    control-plane   45d   v1.30.2   10.0.1.10     Ubuntu 22.04.3 LTS   5.15.0-91        containerd://1.7.11
# worker-01    Ready    <none>          45d   v1.30.2   10.0.1.11     Ubuntu 22.04.3 LTS   5.15.0-91        containerd://1.7.11
# worker-02    Ready    <none>          45d   v1.30.2   10.0.1.12     Ubuntu 22.04.3 LTS   5.15.0-91        containerd://1.7.11
```

#### Describing a Node

`kubectl describe node` gives you everything — capacity, allocatable resources, conditions, taints, labels, and running Pods:

```bash
kubectl describe node worker-01
# Name:               worker-01
# Roles:              <none>
# Labels:             kubernetes.io/arch=amd64
#                     kubernetes.io/hostname=worker-01
#                     kubernetes.io/os=linux
#                     node.kubernetes.io/instance-type=m5.xlarge
# Annotations:        ...
# Taints:             <none>
# Conditions:
#   Type                 Status  Reason                       Message
#   ----                 ------  ------                       -------
#   MemoryPressure       False   KubeletHasSufficientMemory   kubelet has sufficient memory
#   DiskPressure         False   KubeletHasNoDiskPressure     kubelet has no disk pressure
#   PIDPressure          False   KubeletHasSufficientPID      kubelet has sufficient PID
#   Ready                True    KubeletReady                 kubelet is posting ready status
# Capacity:
#   cpu:                4
#   memory:             16384Mi
#   pods:               110
# Allocatable:
#   cpu:                3800m
#   memory:             15168Mi
#   pods:               110
# Non-terminated Pods:  (12 in total)
#   Namespace   Name                CPU Requests  Memory Requests
#   ---------   ----                ------------  ---------------
#   default     web-abc123          100m          128Mi
#   default     api-def456          250m          256Mi
#   ...
```

**Capacity** is the total resources on the node. **Allocatable** is what's available for Pods after reserving resources for the OS and kubelet. The difference is the system reserved overhead.

#### Node Conditions

Every node reports five conditions. These drive scheduling decisions and alerting:

| Condition | Healthy Value | What It Means |
|-----------|--------------|---------------|
| `Ready` | `True` | Node is healthy and can accept Pods |
| `MemoryPressure` | `False` | Node is not running low on memory |
| `DiskPressure` | `False` | Node is not running low on disk space |
| `PIDPressure` | `False` | Node is not running too many processes |
| `NetworkUnavailable` | `False` | Node network is correctly configured |

If `Ready` is `False` or `Unknown` for the `pod-eviction-timeout` (default 5 minutes), the node controller starts evicting Pods to healthy nodes.

> **Gotcha:** A node stuck in `NotReady` does not immediately kill Pods. Kubernetes waits for the eviction timeout. During that window, Pods on the failing node are still reported as `Running` but are unreachable. StatefulSet Pods are especially tricky — they won't be rescheduled until the old Pod is confirmed terminated (or you force-delete it).

#### Node Labels

Labels let you classify nodes by hardware, location, or role:

```bash
# Add a label
kubectl label node worker-01 disktype=ssd
# node/worker-01 labeled

# Add multiple labels
kubectl label node worker-01 gpu=nvidia-a100 zone=us-east-1a
# node/worker-01 labeled

# View labels on all nodes
kubectl get nodes --show-labels
# NAME         STATUS   ROLES           AGE   VERSION   LABELS
# worker-01    Ready    <none>          45d   v1.30.2   disktype=ssd,gpu=nvidia-a100,zone=us-east-1a,...

# Remove a label
kubectl label node worker-01 gpu-
# node/worker-01 unlabeled

# Overwrite an existing label
kubectl label node worker-01 disktype=nvme --overwrite
# node/worker-01 labeled
```

#### Node Roles

Roles are just labels with a special prefix. The control plane node has:

```bash
kubectl get nodes
# NAME         STATUS   ROLES           AGE   VERSION
# control-01   Ready    control-plane   45d   v1.30.2

# The role comes from this label:
kubectl get node control-01 --show-labels | tr ',' '\n' | grep role
# node-role.kubernetes.io/control-plane=

# You can assign custom roles to workers
kubectl label node worker-01 node-role.kubernetes.io/gpu-worker=
# node/worker-01 labeled

kubectl get nodes
# NAME         STATUS   ROLES           AGE   VERSION
# control-01   Ready    control-plane   45d   v1.30.2
# worker-01    Ready    gpu-worker      45d   v1.30.2
# worker-02    Ready    <none>          45d   v1.30.2
```

> **Tip:** The role label value is irrelevant — Kubernetes only checks if the label key exists. `node-role.kubernetes.io/worker=""` and `node-role.kubernetes.io/worker="true"` both display as `worker` in the ROLES column.

### Taints and Tolerations

Taints and tolerations work together to control which Pods can run on which nodes. A **taint** on a node repels Pods. A **toleration** on a Pod lets it ignore a specific taint.

```
Taints = "Keep out" signs on nodes
Tolerations = "I'm allowed in" badges on Pods

  Node with taint                 Pod without toleration
  ┌──────────────┐                ┌──────┐
  │  ⛔ taint:   │  ──── X ────  │ Pod  │  Rejected
  │  gpu=true:   │                └──────┘
  │  NoSchedule  │
  └──────────────┘                Pod with toleration
                                  ┌──────┐
                   ──── ✓ ────    │ Pod  │  Allowed
                                  │ tol: │
                                  │ gpu  │
                                  └──────┘
```

#### Applying Taints

```bash
# Taint a node
kubectl taint node worker-01 dedicated=gpu:NoSchedule
# node/worker-01 tainted

# View taints
kubectl describe node worker-01 | grep Taints
# Taints:  dedicated=gpu:NoSchedule

# Remove a taint (add minus sign at the end)
kubectl taint node worker-01 dedicated=gpu:NoSchedule-
# node/worker-01 untainted
```

The taint format is `key=value:effect`. The three effects are:

| Effect | Behavior |
|--------|----------|
| `NoSchedule` | New Pods without a matching toleration are not scheduled. Existing Pods stay. |
| `PreferNoSchedule` | Scheduler tries to avoid the node, but will use it if no other option exists. Soft rule. |
| `NoExecute` | New Pods are rejected **and** existing Pods without a matching toleration are evicted. |

#### Adding Tolerations to Pods

To schedule a Pod on a tainted node, add a matching toleration:

*gpu-pod.yaml*

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: gpu-training
spec:
  containers:
  - name: trainer
    image: nvidia/cuda:12.0-base
    resources:
      limits:
        nvidia.com/gpu: 1
  tolerations:
  - key: "dedicated"
    operator: "Equal"
    value: "gpu"
    effect: "NoSchedule"
  nodeSelector:
    gpu: nvidia-a100          # also select the right node
```

The toleration operators:

| Operator | Meaning |
|----------|---------|
| `Equal` | Key, value, and effect must all match |
| `Exists` | Key and effect must match (value is ignored — use when taint has no value) |

```yaml
# Match any taint with key "dedicated" regardless of value
tolerations:
- key: "dedicated"
  operator: "Exists"
  effect: "NoSchedule"

# Match ALL taints (use with caution — this Pod goes anywhere)
tolerations:
- operator: "Exists"
```

#### NoExecute and tolerationSeconds

With `NoExecute`, you can control how long a Pod stays before eviction:

```yaml
tolerations:
- key: "node.kubernetes.io/unreachable"
  operator: "Exists"
  effect: "NoExecute"
  tolerationSeconds: 300       # stay for 5 minutes, then evict
```

If `tolerationSeconds` is omitted, the Pod tolerates the taint forever and is never evicted.

#### Built-in Taints

Kubernetes automatically applies taints to nodes in certain conditions:

| Taint | When Applied |
|-------|-------------|
| `node-role.kubernetes.io/control-plane:NoSchedule` | Control plane nodes — prevents user workloads on master |
| `node.kubernetes.io/not-ready:NoExecute` | Node condition `Ready` is `False` |
| `node.kubernetes.io/unreachable:NoExecute` | Node condition `Ready` is `Unknown` (lost contact) |
| `node.kubernetes.io/disk-pressure:NoSchedule` | Node has disk pressure |
| `node.kubernetes.io/memory-pressure:NoSchedule` | Node has memory pressure |
| `node.kubernetes.io/pid-pressure:NoSchedule` | Node has PID pressure |
| `node.kubernetes.io/unschedulable:NoSchedule` | Node is cordoned |

> **Tip:** Kubernetes automatically adds tolerations for `not-ready` and `unreachable` to every Pod with a default `tolerationSeconds` of 300 (5 minutes). That is why Pods are not immediately evicted when a node goes down — they wait 5 minutes first.

#### Use Cases for Taints

- **Dedicated nodes:** Taint GPU nodes so only ML workloads run there
- **Control plane isolation:** Built-in taint keeps user Pods off master nodes
- **Preemption:** Mark nodes for specific teams — `team=data-science:NoSchedule`
- **Maintenance:** `NoExecute` taints evict Pods during node maintenance (drain does this automatically)

### Node Affinity and Anti-Affinity

Node affinity is a more expressive alternative to `nodeSelector`. It lets you specify rules about which nodes a Pod can or should be scheduled on.

#### nodeSelector (Simple Approach)

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: ssd-app
spec:
  containers:
  - name: app
    image: myapp:latest
  nodeSelector:
    disktype: ssd              # must land on a node with this label
```

`nodeSelector` is a hard requirement — if no node matches, the Pod stays `Pending`. It only supports equality matching.

#### Node Affinity (Expressive Approach)

Node affinity supports two rule types:

| Rule | Behavior |
|------|----------|
| `requiredDuringSchedulingIgnoredDuringExecution` | Hard requirement — Pod is not scheduled unless a node matches. Like `nodeSelector` but more flexible. |
| `preferredDuringSchedulingIgnoredDuringExecution` | Soft preference — scheduler tries to match but schedules elsewhere if needed. |

The `IgnoredDuringExecution` part means: if the node labels change after the Pod is running, the Pod stays put. It is not evicted.

*node-affinity-pod.yaml*

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: zone-aware-app
spec:
  containers:
  - name: app
    image: myapp:latest
  affinity:
    nodeAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
        nodeSelectorTerms:
        - matchExpressions:
          - key: topology.kubernetes.io/zone
            operator: In
            values:
            - us-east-1a
            - us-east-1b
      preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 80
        preference:
          matchExpressions:
          - key: disktype
            operator: In
            values:
            - ssd
      - weight: 20
        preference:
          matchExpressions:
          - key: node-type
            operator: In
            values:
            - high-memory
```

This Pod:
1. **Must** land in zone `us-east-1a` or `us-east-1b` (hard requirement)
2. **Prefers** nodes with `disktype=ssd` (weight 80) or `node-type=high-memory` (weight 20)

The `weight` field (1-100) lets the scheduler rank preferred nodes. Higher weight = stronger preference.

Supported operators for `matchExpressions`:

| Operator | Meaning |
|----------|---------|
| `In` | Label value is in the provided list |
| `NotIn` | Label value is not in the list |
| `Exists` | Label key exists (value ignored) |
| `DoesNotExist` | Label key does not exist |
| `Gt` | Label value is greater than (numeric strings only) |
| `Lt` | Label value is less than (numeric strings only) |

#### nodeSelector vs Node Affinity

| Feature | nodeSelector | Node Affinity |
|---------|-------------|---------------|
| Matching | Exact label match only | In, NotIn, Exists, DoesNotExist, Gt, Lt |
| Hard/soft | Hard only | Both required and preferred |
| Multiple rules | AND only | OR within a term, AND across terms |
| Complexity | Simple | More verbose but more powerful |

**When to use which:** Use `nodeSelector` for simple cases (e.g., "run on SSD nodes"). Use node affinity when you need OR logic, soft preferences, or operators beyond equality.

### Pod Affinity and Anti-Affinity

While node affinity controls Pod-to-node relationships, **pod affinity** controls Pod-to-Pod relationships — whether Pods should be co-located or spread apart.

#### Pod Affinity (Co-locate Pods)

Use case: place a web frontend on the same node as its Redis cache for low-latency access.

*colocated-app.yaml*

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-frontend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web-frontend
  template:
    metadata:
      labels:
        app: web-frontend
    spec:
      containers:
      - name: web
        image: myapp/frontend:latest
      affinity:
        podAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
          - labelSelector:
              matchExpressions:
              - key: app
                operator: In
                values:
                - redis-cache
            topologyKey: kubernetes.io/hostname    # same node
```

This says: "Schedule this Pod on a node that already runs a Pod with label `app=redis-cache`."

#### Pod Anti-Affinity (Spread Pods)

Use case: spread replicas across different nodes so a single node failure doesn't take down all instances.

*spread-replicas.yaml*

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-server
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api-server
  template:
    metadata:
      labels:
        app: api-server
    spec:
      containers:
      - name: api
        image: myapp/api:latest
      affinity:
        podAntiAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
          - labelSelector:
              matchExpressions:
              - key: app
                operator: In
                values:
                - api-server
            topologyKey: kubernetes.io/hostname    # different nodes
```

This says: "Don't put two api-server Pods on the same node."

#### The topologyKey

The `topologyKey` determines the scope of "co-located" or "spread":

| topologyKey | Scope | Use Case |
|-------------|-------|----------|
| `kubernetes.io/hostname` | Per node | Spread replicas across nodes |
| `topology.kubernetes.io/zone` | Per availability zone | Spread across AZs for HA |
| `topology.kubernetes.io/region` | Per region | Multi-region workloads |

*Spread across zones example:*

```yaml
affinity:
  podAntiAffinity:
    preferredDuringSchedulingIgnoredDuringExecution:
    - weight: 100
      podAffinityTerm:
        labelSelector:
          matchExpressions:
          - key: app
            operator: In
            values:
            - api-server
        topologyKey: topology.kubernetes.io/zone
```

> **Gotcha:** Hard pod anti-affinity (`required`) with `topologyKey: kubernetes.io/hostname` limits your replicas to the number of nodes. If you have 3 nodes but want 5 replicas, 2 Pods will stay `Pending` forever. Use `preferred` anti-affinity if you want best-effort spreading without blocking.

### Topology Spread Constraints

Topology spread constraints provide more fine-grained control over how Pods are distributed than pod anti-affinity. They let you specify a maximum allowed imbalance (`maxSkew`) across topology domains.

*even-spread.yaml*

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 6
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
      topologySpreadConstraints:
      - maxSkew: 1
        topologyKey: topology.kubernetes.io/zone
        whenUnsatisfiable: DoNotSchedule
        labelSelector:
          matchLabels:
            app: web
      - maxSkew: 1
        topologyKey: kubernetes.io/hostname
        whenUnsatisfiable: ScheduleAnyway
        labelSelector:
          matchLabels:
            app: web
```

This distributes 6 replicas so:
1. **Across zones** — no zone has more than 1 extra Pod compared to any other zone (hard rule)
2. **Across nodes** — best-effort even spread within each zone (soft rule)

```
Zone A (2 nodes)          Zone B (2 nodes)          Zone C (2 nodes)
┌──────┐  ┌──────┐       ┌──────┐  ┌──────┐       ┌──────┐  ┌──────┐
│ web  │  │ web  │       │ web  │  │ web  │       │ web  │  │ web  │
│      │  │      │       │      │  │      │       │      │  │      │
└──────┘  └──────┘       └──────┘  └──────┘       └──────┘  └──────┘
 node-1    node-2         node-3    node-4         node-5    node-6

Zone A: 2 Pods    Zone B: 2 Pods    Zone C: 2 Pods
maxSkew = 1 → satisfied (max difference between any two zones is 0)
```

Key fields:

| Field | Description |
|-------|-------------|
| `maxSkew` | Maximum allowed difference in Pod count between any two topology domains. `1` means evenly distributed. |
| `topologyKey` | The node label that defines domains (zone, hostname, region) |
| `whenUnsatisfiable` | `DoNotSchedule` (hard) or `ScheduleAnyway` (soft, with skew minimization) |
| `labelSelector` | Which Pods to count when computing the spread |

> **Tip:** Topology spread constraints are the recommended way to distribute Pods evenly. They are more predictable than pod anti-affinity for workloads where you want even distribution rather than strict "no two on the same node" rules.

### Cordoning and Draining Nodes

When you need to perform maintenance on a node — OS updates, hardware replacement, Kubernetes upgrades — you must safely move workloads off it first.

#### Cordon: Mark Unschedulable

```bash
kubectl cordon worker-02
# node/worker-02 cordoned

kubectl get nodes
# NAME         STATUS                     ROLES           AGE   VERSION
# control-01   Ready                      control-plane   45d   v1.30.2
# worker-01    Ready                      <none>          45d   v1.30.2
# worker-02    Ready,SchedulingDisabled   <none>          45d   v1.30.2
# worker-03    Ready                      <none>          44d   v1.30.2
```

A cordoned node shows `SchedulingDisabled`. **Existing Pods continue running** — no evictions happen. New Pods will not be scheduled there.

#### Uncordon: Make Schedulable Again

```bash
kubectl uncordon worker-02
# node/worker-02 uncordoned

kubectl get nodes
# NAME         STATUS   ROLES           AGE   VERSION
# worker-02    Ready    <none>          45d   v1.30.2
```

#### Drain: Evict All Pods

Draining cordons the node and then evicts all Pods:

```bash
kubectl drain worker-02 --ignore-daemonsets --delete-emptydir-data
# node/worker-02 cordoned
# evicting pod default/web-abc123
# evicting pod default/api-def456
# evicting pod monitoring/prometheus-node-exporter-xyz
# pod/web-abc123 evicted
# pod/api-def456 evicted
# node/worker-02 drained
```

Common drain flags:

| Flag | Purpose |
|------|---------|
| `--ignore-daemonsets` | Skip DaemonSet Pods (they're supposed to run on every node) |
| `--delete-emptydir-data` | Delete Pods using emptyDir volumes (data will be lost) |
| `--force` | Force-delete Pods not managed by a controller (standalone Pods) |
| `--grace-period=30` | Override the Pod's termination grace period |
| `--timeout=300s` | Abort drain if it takes longer than this |
| `--pod-selector='app=web'` | Only evict Pods matching the selector |

> **Gotcha:** `kubectl drain` without `--ignore-daemonsets` will fail if DaemonSet Pods exist on the node. Without `--delete-emptydir-data`, it fails if any Pods use emptyDir. Without `--force`, it fails if standalone Pods (not managed by a controller) exist. In practice, you almost always need `--ignore-daemonsets --delete-emptydir-data`.

#### Drain and PodDisruptionBudgets

Drain respects PodDisruptionBudgets (PDBs). If evicting a Pod would violate a PDB, the drain blocks:

```bash
kubectl drain worker-02 --ignore-daemonsets --delete-emptydir-data
# evicting pod default/web-abc123
# error when evicting pods/"web-abc123" -n "default" (will retry after 5s):
#   Cannot evict pod as it would violate the pod's disruption budget.
# evicting pod default/web-abc123
# pod/web-abc123 evicted
# node/worker-02 drained
```

The drain retries until the PDB is satisfied (other replicas are ready) or the timeout expires.

#### The Maintenance Workflow

```
Step 1: Cordon          Step 2: Drain           Step 3: Maintain        Step 4: Uncordon
┌──────────────┐       ┌──────────────┐        ┌──────────────┐        ┌──────────────┐
│ worker-02    │       │ worker-02    │        │ worker-02    │        │ worker-02    │
│ Scheduling   │  ──▶  │ No Pods      │  ──▶   │ OS update    │  ──▶   │ Ready        │
│ Disabled     │       │ (evicted)    │        │ K8s upgrade  │        │ Schedulable  │
│ Pods running │       │ Unschedulable│        │ Reboot       │        │ New Pods OK  │
└──────────────┘       └──────────────┘        └──────────────┘        └──────────────┘
```

```bash
# Full maintenance workflow
kubectl cordon worker-02
kubectl drain worker-02 --ignore-daemonsets --delete-emptydir-data

# ... perform maintenance (upgrade OS, kubelet, etc.) ...

kubectl uncordon worker-02
```

### Cluster Upgrades

Kubernetes releases a new minor version roughly every 4 months. Staying current is important for security patches, bug fixes, and new features.

#### Upgrade Rules

1. **Control plane first, then worker nodes** — never upgrade workers ahead of the control plane
2. **One minor version at a time** — upgrade from 1.29 to 1.30, not 1.29 to 1.31
3. **Version skew policy** — kubelet can be up to 2 minor versions behind the API server

```
Version Skew Policy:
API Server: v1.30   ← must be the highest version component
         │
         ├── kubelet: v1.30  ✓  (same version)
         ├── kubelet: v1.29  ✓  (one behind)
         ├── kubelet: v1.28  ✓  (two behind)
         └── kubelet: v1.27  ✗  (three behind — not supported)
```

#### Managed Kubernetes (EKS, GKE, AKS)

Managed services handle control plane upgrades for you:

```bash
# GKE — upgrade control plane
gcloud container clusters upgrade my-cluster \
  --master --cluster-version=1.30.2

# EKS — upgrade control plane
aws eks update-cluster-version \
  --name my-cluster --kubernetes-version 1.30

# AKS — upgrade control plane
az aks upgrade --resource-group mygroup \
  --name my-cluster --kubernetes-version 1.30.2
```

For node pools, managed services can perform rolling upgrades automatically (new nodes come up, old nodes drain and terminate).

#### Self-Managed Upgrades (kubeadm)

For clusters built with kubeadm, the upgrade is manual. Here is the workflow:

*Step 1: Upgrade the control plane*

```bash
# Check available versions
sudo kubeadm upgrade plan
# Components that must be upgraded manually after you have upgraded the control plane:
# COMPONENT   CURRENT   TARGET
# kubelet     v1.29.5   v1.30.2
#
# Upgrade to the latest stable version:
# COMPONENT                CURRENT   TARGET
# kube-apiserver            v1.29.5   v1.30.2
# kube-controller-manager   v1.29.5   v1.30.2
# kube-scheduler            v1.29.5   v1.30.2
# kube-proxy                v1.29.5   v1.30.2
# CoreDNS                   v1.11.1   v1.11.3
# etcd                      3.5.10    3.5.12

# Upgrade kubeadm first
sudo apt-get update
sudo apt-get install -y kubeadm=1.30.2-1.1

# Apply the upgrade
sudo kubeadm upgrade apply v1.30.2
# [upgrade/successful] SUCCESS! Your cluster was upgraded to "v1.30.2". Enjoy!

# Upgrade kubelet and kubectl on the control plane node
sudo apt-get install -y kubelet=1.30.2-1.1 kubectl=1.30.2-1.1
sudo systemctl daemon-reload
sudo systemctl restart kubelet
```

*Step 2: Upgrade each worker node (one at a time)*

```bash
# On the admin machine: drain the worker
kubectl drain worker-01 --ignore-daemonsets --delete-emptydir-data

# On the worker node: upgrade kubeadm, kubelet
sudo apt-get update
sudo apt-get install -y kubeadm=1.30.2-1.1
sudo kubeadm upgrade node

sudo apt-get install -y kubelet=1.30.2-1.1
sudo systemctl daemon-reload
sudo systemctl restart kubelet

# On the admin machine: uncordon the worker
kubectl uncordon worker-01
```

Repeat for each worker node. Verify after each node:

```bash
kubectl get nodes
# NAME         STATUS   ROLES           AGE   VERSION
# control-01   Ready    control-plane   45d   v1.30.2
# worker-01    Ready    <none>          45d   v1.30.2   ← upgraded
# worker-02    Ready    <none>          45d   v1.29.5   ← still on old version
# worker-03    Ready    <none>          44d   v1.29.5
```

> **Tip:** Always take an etcd snapshot before upgrading the control plane. If the upgrade fails, you can restore the cluster from the backup. Also, read the changelog for each version — some releases have breaking changes or deprecated APIs that require manifest updates.

### etcd Backup and Restore

etcd is the brain of the cluster. It stores every object — Pods, Services, Secrets, ConfigMaps, RBAC rules — everything. If etcd is lost without a backup, **the entire cluster state is gone**.

```
┌──────────────────────────────────────────┐
│            Kubernetes Cluster            │
│                                          │
│  API Server ────▶  etcd                  │
│                    ┌──────────────────┐  │
│  Controller ────▶  │ All cluster data │  │
│  Manager           │ - Pods           │  │
│                    │ - Services       │  │
│  Scheduler  ────▶  │ - Secrets        │  │
│                    │ - ConfigMaps     │  │
│                    │ - RBAC           │  │
│                    │ - ...everything  │  │
│                    └──────────────────┘  │
└──────────────────────────────────────────┘
```

#### Taking an etcd Snapshot

```bash
# Set environment variables for etcd connection
export ETCDCTL_API=3

# Take a snapshot
etcdctl snapshot save /opt/backup/etcd-snapshot-$(date +%Y%m%d).db \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key
# Snapshot saved at /opt/backup/etcd-snapshot-20260131.db

# Verify the snapshot
etcdctl snapshot status /opt/backup/etcd-snapshot-20260131.db --write-out=table
# +----------+----------+------------+------------+
# |   HASH   | REVISION | TOTAL KEYS | TOTAL SIZE |
# +----------+----------+------------+------------+
# | 3c9768e5 |   412850 |       1243 |     5.1 MB |
# +----------+----------+------------+------------+
```

The certificates are required because etcd uses mutual TLS. On kubeadm clusters, the certs are in `/etc/kubernetes/pki/etcd/`.

#### Restoring from a Snapshot

Restoring replaces all cluster state with the snapshot contents:

```bash
# Stop the API server (on kubeadm, move the static pod manifest)
sudo mv /etc/kubernetes/manifests/kube-apiserver.yaml /tmp/

# Restore the snapshot to a new data directory
etcdctl snapshot restore /opt/backup/etcd-snapshot-20260131.db \
  --data-dir=/var/lib/etcd-restored \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key
# 2026-01-31T10:00:00Z info restored snapshot
# 2026-01-31T10:00:00Z info added member

# Update the etcd static pod to use the restored data directory
# Edit /etc/kubernetes/manifests/etcd.yaml:
#   - --data-dir=/var/lib/etcd-restored
# Also update the hostPath volume:
#   path: /var/lib/etcd-restored

# Restore the API server manifest
sudo mv /tmp/kube-apiserver.yaml /etc/kubernetes/manifests/

# Wait for the control plane to restart
kubectl get nodes
# NAME         STATUS   ROLES           AGE   VERSION
# control-01   Ready    control-plane   45d   v1.30.2
```

#### Backup Strategy

| When | Why |
|------|-----|
| Before cluster upgrades | Rollback point if upgrade fails |
| Before major changes | Rollback point for risky operations |
| Scheduled (daily/hourly) | Disaster recovery |
| Before etcd maintenance | Safety net |

> **Gotcha:** An etcd backup captures cluster state at a point in time. Anything created after the snapshot is lost on restore. In production, automate regular snapshots with a CronJob or external tool like Velero. Also, store backups off-cluster — if the cluster is destroyed, you need the backup to be somewhere else.

### Multi-Cluster Considerations

As organizations grow, a single cluster often is not enough. Multiple clusters provide stronger isolation, separate failure domains, and meet compliance requirements.

#### When to Use Multiple Clusters vs Namespaces

| Scenario | Namespaces | Multiple Clusters |
|----------|-----------|------------------|
| Team isolation (same trust level) | Yes | Overkill |
| Dev/staging/prod environments | Maybe | Recommended |
| Regulatory compliance (PCI, HIPAA) | Usually insufficient | Required |
| Multi-region HA | No | Yes |
| Blast radius reduction | Partial | Full |
| Noisy neighbor protection | ResourceQuotas help | Complete isolation |

#### Context Switching

kubectl uses **contexts** to connect to different clusters. Each context combines a cluster, user, and namespace:

```bash
# View all contexts
kubectl config get-contexts
# CURRENT   NAME            CLUSTER         AUTHINFO        NAMESPACE
# *         dev-cluster     dev-cluster     dev-admin       default
#           staging-cluster staging-cluster staging-admin   default
#           prod-cluster    prod-cluster    prod-admin      default

# Switch to a different cluster
kubectl config use-context prod-cluster
# Switched to context "prod-cluster".

# Verify
kubectl config current-context
# prod-cluster

# Run a command against a specific context without switching
kubectl --context=staging-cluster get nodes
```

#### Useful Multi-Cluster Tools

```bash
# kubectx — fast context switching
kubectx prod-cluster
# Switched to context "prod-cluster".

kubectx -                # switch back to previous context

# kubens — fast namespace switching
kubens kube-system
# Context "prod-cluster" modified.
# Active namespace is "kube-system".
```

#### Federation Concepts

Kubernetes federation allows you to manage multiple clusters from a single control plane. While the original Federation v1 was deprecated, the **KubeFed** project and newer tools like **Admiralty** and **Liqo** provide multi-cluster capabilities:

- **Federated resources** — deploy a single manifest that creates objects across multiple clusters
- **Federated services** — DNS-based routing across clusters
- **Policy-based placement** — control which clusters run which workloads

> **Tip:** For most teams, federation is overkill. Start with separate clusters and a GitOps tool (ArgoCD, Flux) that deploys to multiple clusters from a single Git repo. This gives you multi-cluster management without the complexity of federation.

### Hands-On: Taints, Tolerations, Drain, and Node Affinity

Let's combine everything in a practical scenario. We will taint a node, deploy Pods with tolerations, drain a node for maintenance, and use node affinity to control scheduling.

*Step 1: Label and taint a node*

```bash
# Label worker-01 as a GPU node
kubectl label node worker-01 hardware=gpu
# node/worker-01 labeled

# Taint it so only GPU workloads run there
kubectl taint node worker-01 hardware=gpu:NoSchedule
# node/worker-01 tainted

# Verify
kubectl describe node worker-01 | grep -E "Taints|Labels" | head -5
# Labels:   hardware=gpu,kubernetes.io/hostname=worker-01,...
# Taints:   hardware=gpu:NoSchedule
```

*Step 2: Deploy a regular Pod (it avoids the tainted node)*

```bash
kubectl run regular-app --image=nginx
# pod/regular-app created

kubectl get pod regular-app -o wide
# NAME          READY   STATUS    NODE
# regular-app   1/1     Running   worker-02     ← not on worker-01
```

*Step 3: Deploy a GPU Pod with a toleration*

*gpu-workload.yaml*

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: gpu-workload
spec:
  containers:
  - name: ml-training
    image: nvidia/cuda:12.0-base
    command: ["sleep", "3600"]
  tolerations:
  - key: "hardware"
    operator: "Equal"
    value: "gpu"
    effect: "NoSchedule"
  affinity:
    nodeAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
        nodeSelectorTerms:
        - matchExpressions:
          - key: hardware
            operator: In
            values:
            - gpu
```

```bash
kubectl apply -f gpu-workload.yaml
# pod/gpu-workload created

kubectl get pod gpu-workload -o wide
# NAME           READY   STATUS    NODE
# gpu-workload   1/1     Running   worker-01    ← landed on the GPU node
```

*Step 4: Drain a node for maintenance*

```bash
# Drain worker-02 (where regular-app is running)
kubectl drain worker-02 --ignore-daemonsets --delete-emptydir-data
# node/worker-02 cordoned
# evicting pod default/regular-app
# pod/regular-app evicted
# node/worker-02 drained

kubectl get nodes
# NAME         STATUS                     ROLES           AGE   VERSION
# control-01   Ready                      control-plane   45d   v1.30.2
# worker-01    Ready                      <none>          45d   v1.30.2
# worker-02    Ready,SchedulingDisabled   <none>          45d   v1.30.2
# worker-03    Ready                      <none>          44d   v1.30.2

# regular-app is gone — it was a standalone Pod, not managed by a controller
kubectl get pods
# NAME           READY   STATUS    NODE
# gpu-workload   1/1     Running   worker-01
```

> **Gotcha:** Standalone Pods (not managed by a Deployment, StatefulSet, or DaemonSet) are permanently lost during a drain. They are evicted but nothing recreates them. Always use a controller for production workloads.

*Step 5: Uncordon after maintenance*

```bash
kubectl uncordon worker-02
# node/worker-02 uncordoned

kubectl get nodes
# NAME         STATUS   ROLES           AGE   VERSION
# worker-02    Ready    <none>          45d   v1.30.2    ← back to normal
```

*Step 6: Clean up*

```bash
kubectl delete pod gpu-workload
kubectl taint node worker-01 hardware=gpu:NoSchedule-
kubectl label node worker-01 hardware-
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

## Module 21 Summary

- **Node management** starts with `kubectl get nodes` and `kubectl describe node`. Key info: capacity vs allocatable resources, conditions (Ready, MemoryPressure, DiskPressure, PIDPressure, NetworkUnavailable), labels, and taints.
- **Node labels** classify nodes by hardware (`disktype=ssd`), location (`zone=us-east-1a`), or role (`node-role.kubernetes.io/gpu-worker`). Use them for scheduling control.
- **Taints** repel Pods from nodes. Three effects: `NoSchedule` (block new Pods), `PreferNoSchedule` (soft avoid), `NoExecute` (block new + evict existing). Applied with `kubectl taint node`.
- **Tolerations** on Pods let them schedule onto tainted nodes. Must match the taint's key, value, and effect. Use `operator: Exists` to match any value.
- **Built-in taints** are applied automatically: `control-plane:NoSchedule`, `not-ready:NoExecute`, `unreachable:NoExecute`. Default toleration for not-ready/unreachable is 300 seconds.
- **Node affinity** is an expressive alternative to `nodeSelector`: `required` (hard) and `preferred` (soft, with weights). Supports operators: In, NotIn, Exists, DoesNotExist, Gt, Lt.
- **Pod affinity** co-locates Pods (e.g., frontend near cache). **Pod anti-affinity** spreads Pods apart (e.g., replicas across nodes). The `topologyKey` controls scope: per-node, per-zone, or per-region.
- **Topology spread constraints** provide fine-grained distribution using `maxSkew`, `topologyKey`, and `whenUnsatisfiable`. More predictable than pod anti-affinity for even distribution.
- **Cordon** marks a node as unschedulable (existing Pods stay). **Drain** evicts all Pods (respects PDBs). **Uncordon** makes the node schedulable again. Maintenance workflow: cordon, drain, maintain, uncordon.
- **Drain flags** you need: `--ignore-daemonsets` (skip DaemonSet Pods), `--delete-emptydir-data` (accept emptyDir data loss), `--force` (remove standalone Pods).
- **Cluster upgrades** go control plane first, then workers, one minor version at a time. Version skew: kubelet can be up to 2 minor versions behind the API server.
- **kubeadm upgrade** workflow: `kubeadm upgrade plan` then `kubeadm upgrade apply` on control plane; drain, upgrade kubelet, uncordon on each worker.
- **etcd backup** with `etcdctl snapshot save` captures all cluster state. Restore with `etcdctl snapshot restore`. Always back up before upgrades and on a regular schedule.
- **Multi-cluster** setups provide hard isolation for compliance and separate failure domains. Use contexts (`kubectl config use-context`) to switch clusters. Tools like kubectx and GitOps (ArgoCD, Flux) simplify multi-cluster operations.
