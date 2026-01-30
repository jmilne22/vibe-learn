## Persistent Storage

Containers are ephemeral. When a Pod dies, everything inside its filesystem is gone. That works fine for stateless web servers, but not for databases, file uploads, or anything that needs to remember data across restarts.

Kubernetes solves this with **Volumes** — a way to decouple storage from the Pod lifecycle so data survives Pod restarts, rescheduling, and even node failures.

```
Without Volumes                    With Volumes
┌───────────┐                      ┌───────────┐
│   Pod     │                      │   Pod     │
│ ┌───────┐ │                      │ ┌───────┐ │
│ │ data  │ │  Pod dies →          │ │ mount │─┼──────┐
│ └───────┘ │  data lost           │ └───────┘ │      │
└───────────┘                      └───────────┘      │
                                                 ┌────▼────┐
                                   Pod dies →    │ Volume  │  ← data survives
                                   new Pod →     │ (disk)  │
                                                 └─────────┘
                                   ┌───────────┐      │
                                   │  New Pod   │      │
                                   │ ┌───────┐  │      │
                                   │ │ mount │──┼──────┘
                                   │ └───────┘  │
                                   └───────────┘
```

### The Storage Hierarchy

Kubernetes storage has three layers. Understanding this hierarchy is the key to the whole module:

```
┌─────────────────────────────────────────────────────────┐
│                       Pod                                │
│   volumes:                                               │
│     - name: data                                         │
│       persistentVolumeClaim:                             │
│         claimName: my-pvc          ← Pod references PVC  │
└─────────────────────────┬───────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────┐
│              PersistentVolumeClaim (PVC)                  │
│   User's request: "I need 10Gi of ReadWriteOnce storage" │
│   storageClassName: standard                             │
└─────────────────────────┬───────────────────────────────┘
                          │  binds to
┌─────────────────────────▼───────────────────────────────┐
│              PersistentVolume (PV)                        │
│   Cluster resource: 10Gi disk backed by cloud/NFS/local  │
│   Can be manually created or dynamically provisioned     │
└─────────────────────────────────────────────────────────┘
```

We'll build up to this step by step, starting with simple volume types.

## Volume Types

Kubernetes supports many volume types. Here are the ones you'll actually use:

| Type | Lifetime | Use Case |
|------|----------|----------|
| `emptyDir` | Dies with the Pod | Scratch space, caches, shared temp files between containers |
| `hostPath` | Tied to the node | Access node files (logs, Docker socket) — dev/test only |
| `configMap` | Managed separately | Mount config files into containers |
| `secret` | Managed separately | Mount sensitive data (certs, keys) as files |
| `persistentVolumeClaim` | Independent of Pod | Databases, uploads, anything that must survive Pod restarts |
| `nfs`, `cephfs` | External system | Shared storage across multiple Pods |
| `awsElasticBlockStore`, `gcePersistentDisk`, `azureDisk` | Cloud provider | Cloud-native block storage (legacy — use CSI drivers now) |

## emptyDir and hostPath in Practice

### emptyDir

An `emptyDir` volume is created when the Pod is scheduled to a node and deleted when the Pod is removed. It's useful for sharing files between containers in the same Pod or as scratch space.

*emptydir-pod.yaml*

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: shared-data
spec:
  containers:
  - name: writer
    image: busybox
    command: ["sh", "-c", "while true; do date >> /data/log.txt; sleep 5; done"]
    volumeMounts:
    - name: shared
      mountPath: /data
  - name: reader
    image: busybox
    command: ["sh", "-c", "tail -f /data/log.txt"]
    volumeMounts:
    - name: shared
      mountPath: /data
  volumes:
  - name: shared
    emptyDir: {}
```

```bash
kubectl apply -f emptydir-pod.yaml

# Both containers share the same /data directory
kubectl logs shared-data -c reader
# Sat Jan 31 10:00:00 UTC 2026
# Sat Jan 31 10:00:05 UTC 2026
# Sat Jan 31 10:00:10 UTC 2026

# Delete the Pod — the data is gone
kubectl delete pod shared-data
```

You can also use `emptyDir` backed by memory (tmpfs) for high-speed scratch space:

```yaml
volumes:
- name: cache
  emptyDir:
    medium: Memory        # RAM-backed — fast but counts against memory limits
    sizeLimit: 256Mi
```

> **Tip:** `emptyDir` with `medium: Memory` is great for caching layers in machine learning or image processing pipelines. But remember: it counts against the container's memory limit. If the volume grows past `sizeLimit`, the Pod gets evicted.

### hostPath

A `hostPath` volume mounts a file or directory from the host node's filesystem into the Pod. The data persists beyond the Pod's life, but it's tied to that specific node.

*hostpath-pod.yaml*

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: hostpath-demo
spec:
  containers:
  - name: app
    image: busybox
    command: ["sh", "-c", "cat /host-logs/syslog; sleep 3600"]
    volumeMounts:
    - name: logs
      mountPath: /host-logs
      readOnly: true
  volumes:
  - name: logs
    hostPath:
      path: /var/log
      type: Directory        # must exist, must be a directory
```

`hostPath` types:
- `""` (empty) — no checks, creates if needed
- `DirectoryOrCreate` — create directory if missing
- `Directory` — must already exist as directory
- `FileOrCreate` — create file if missing
- `File` — must already exist as file

> **Gotcha:** Never use `hostPath` for production workloads. If the Pod gets rescheduled to a different node, it sees different (or missing) data. `hostPath` is acceptable for DaemonSets that need access to node-level resources (log collectors, monitoring agents) and for single-node development clusters. The CKA exam may test you on this distinction.

### When to Use Each

| Volume | Survives Pod restart? | Survives node failure? | Shared across Pods? |
|--------|----------------------|----------------------|-------------------|
| `emptyDir` | No | No | No (same Pod only) |
| `hostPath` | Yes (same node) | No | Yes (same node) |
| PVC | Yes | Yes | Depends on access mode |

For anything that must survive reliably, use Persistent Volumes.

## Persistent Volumes (PV)

A **PersistentVolume** is a cluster-level storage resource provisioned by an administrator (or dynamically by a StorageClass). It represents a piece of actual storage — a cloud disk, an NFS share, a local SSD.

PVs exist independently of any Pod. They're like nodes — cluster infrastructure that Pods consume.

### PV YAML

*pv.yaml*

```yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: data-pv
spec:
  capacity:
    storage: 10Gi                          # how much storage
  accessModes:
  - ReadWriteOnce                          # who can mount it
  persistentVolumeReclaimPolicy: Retain    # what happens when released
  storageClassName: manual                 # matches PVCs by class
  hostPath:                                # backend storage (for demo only)
    path: /mnt/data
```

```bash
kubectl apply -f pv.yaml

kubectl get pv
# NAME      CAPACITY   ACCESS MODES   RECLAIM POLICY   STATUS      CLAIM   STORAGECLASS   AGE
# data-pv   10Gi       RWO            Retain           Available           manual         5s
```

The PV starts in `Available` status — waiting for a PVC to claim it.

### Access Modes

Access modes describe how the volume can be mounted:

| Mode | Abbreviation | Description |
|------|-------------|-------------|
| ReadWriteOnce | RWO | Mounted as read-write by a single node |
| ReadOnlyMany | ROX | Mounted as read-only by many nodes |
| ReadWriteMany | RWX | Mounted as read-write by many nodes |
| ReadWriteOncePod | RWOP | Mounted as read-write by a single Pod (K8s 1.27+) |

```
RWO — One node writes          ROX — Many nodes read       RWX — Many nodes write
┌──────┐                        ┌──────┐  ┌──────┐          ┌──────┐  ┌──────┐
│ Node │ ← read/write           │ Node │  │ Node │          │ Node │  │ Node │
└──┬───┘                        └──┬───┘  └──┬───┘          └──┬───┘  └──┬───┘
   │                               │         │                 │         │
┌──▼────────┐                   ┌──▼─────────▼──┐           ┌──▼─────────▼──┐
│  Volume   │                   │    Volume     │           │    Volume     │
│  (disk)   │                   │  (NFS/CephFS) │           │  (NFS/CephFS) │
└───────────┘                   └───────────────┘           └───────────────┘
```

> **Gotcha:** RWO means one **node**, not one Pod. Multiple Pods on the same node can all mount an RWO volume. Cloud block storage (EBS, Persistent Disk) only supports RWO. For RWX, you need a network filesystem like NFS, CephFS, or a cloud file service (EFS, Filestore, Azure Files).

### Reclaim Policies

When a PVC is deleted, what happens to the PV?

| Policy | Effect | Use Case |
|--------|--------|----------|
| Retain | PV stays, data preserved, status becomes `Released`. Admin must manually reclaim. | Production databases — you never want accidental deletion |
| Delete | PV and underlying storage are deleted automatically | Dev/test environments, dynamically provisioned volumes |
| Recycle | Deprecated. Was `rm -rf /thevolume/*` | Don't use this |

```bash
kubectl get pv
# NAME      CAPACITY   ACCESS MODES   RECLAIM POLICY   STATUS      CLAIM               AGE
# data-pv   10Gi       RWO            Retain           Bound       default/data-pvc     5m
# dyn-pv    5Gi        RWO            Delete           Bound       default/app-pvc      2m
```

> **Tip:** In production, always use `Retain` for important data. Dynamic provisioning defaults to `Delete`, so set `reclaimPolicy: Retain` on your StorageClass if you want to keep volumes after PVC deletion.

### PV Lifecycle

```
Available ──── PVC binds ────▶ Bound ──── PVC deleted ────▶ Released
                                                               │
                                              Retain policy:   │  Delete policy:
                                              admin reclaims   │  PV + disk deleted
                                              or deletes PV    │  automatically
```

A `Released` PV cannot be rebound to a new PVC automatically (even with `Retain`). The admin must either delete the PV and create a new one, or remove the `spec.claimRef` to make it `Available` again.

## Persistent Volume Claims (PVC)

A **PersistentVolumeClaim** is a user's request for storage. You specify how much storage you need and what access mode, and Kubernetes finds (or creates) a PV that matches.

Think of it like this: PVs are supply, PVCs are demand.

### PVC YAML

*pvc.yaml*

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: data-pvc
spec:
  accessModes:
  - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
  storageClassName: manual           # must match the PV's storageClassName
```

```bash
kubectl apply -f pvc.yaml

kubectl get pvc
# NAME       STATUS   VOLUME    CAPACITY   ACCESS MODES   STORAGECLASS   AGE
# data-pvc   Bound    data-pv   10Gi       RWO            manual         5s

kubectl get pv
# NAME      CAPACITY   ACCESS MODES   RECLAIM POLICY   STATUS   CLAIM              STORAGECLASS   AGE
# data-pv   10Gi       RWO            Retain           Bound    default/data-pvc   manual         5m
```

The PVC matched our PV because:
1. The `storageClassName` matches (`manual`)
2. The requested storage (10Gi) fits the PV's capacity (10Gi)
3. The access mode matches (ReadWriteOnce)

### Binding Rules

Kubernetes binds a PVC to a PV when:
- **storageClassName** matches (or both are empty)
- **accessModes** requested by the PVC are a subset of the PV's modes
- **capacity** of the PV is >= the PVC's request
- **selector** (if specified on the PVC) matches PV labels

If no PV matches, the PVC stays in `Pending` status until a matching PV is created (or dynamically provisioned).

```bash
kubectl get pvc
# NAME       STATUS    VOLUME   CAPACITY   ACCESS MODES   STORAGECLASS   AGE
# data-pvc   Pending                                      fast           30s

# No PV matches — PVC stays Pending
kubectl describe pvc data-pvc | grep -A 2 Events
# Events:
#   Type     Reason              Age   Message
#   Normal   FailedBinding       10s   no persistent volumes available for this claim
```

### Using a PVC in a Pod

Once you have a bound PVC, reference it in your Pod spec:

*pod-with-pvc.yaml*

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: db
spec:
  containers:
  - name: mysql
    image: mysql:8.0
    env:
    - name: MYSQL_ROOT_PASSWORD
      value: "secret"
    volumeMounts:
    - name: mysql-storage
      mountPath: /var/lib/mysql       # MySQL data directory
  volumes:
  - name: mysql-storage
    persistentVolumeClaim:
      claimName: data-pvc             # reference the PVC by name
```

```bash
kubectl apply -f pod-with-pvc.yaml

kubectl get pods
# NAME   READY   STATUS    RESTARTS   AGE
# db     1/1     Running   0          30s

# Verify the mount
kubectl exec db -- df -h /var/lib/mysql
# Filesystem      Size  Used Avail Use% Mounted on
# /dev/sda1        10G  250M  9.8G   3% /var/lib/mysql
```

### The Complete Flow

Here's the full picture — PV, PVC, and Pod working together:

```
ADMIN creates PV                USER creates PVC               USER creates Pod
(or StorageClass               (request for storage)           (uses the PVC)
 provisions it)

┌──────────────┐    binds     ┌──────────────┐    mounts    ┌──────────────┐
│ PV           │◄────────────│ PVC          │◄────────────│ Pod          │
│              │              │              │              │              │
│ capacity:10Gi│              │ request:10Gi │              │ volumeMounts:│
│ accessMode:  │              │ accessMode:  │              │   /var/lib/  │
│   RWO        │              │   RWO        │              │     mysql    │
│ storageClass:│              │ storageClass:│              │ volumes:     │
│   manual     │              │   manual     │              │   claimName: │
│              │              │              │              │   data-pvc   │
└──────┬───────┘              └──────────────┘              └──────────────┘
       │
┌──────▼───────┐
│ Actual Disk  │
│ (cloud, NFS, │
│  local, etc) │
└──────────────┘
```

## Storage Classes and Dynamic Provisioning

In the real world, nobody creates PVs manually. That's like hand-provisioning VMs — it doesn't scale. Instead, you define a **StorageClass** and let Kubernetes create PVs automatically when a PVC requests one.

### StorageClass YAML

*storageclass.yaml*

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: fast
  annotations:
    storageclass.kubernetes.io/is-default-class: "true"    # default SC
provisioner: kubernetes.io/gce-pd        # cloud-specific provisioner
parameters:
  type: pd-ssd                           # provisioner-specific parameters
  fstype: ext4
reclaimPolicy: Delete                    # default for dynamic provisioning
allowVolumeExpansion: true               # allow PVC resize
volumeBindingMode: WaitForFirstConsumer  # don't provision until Pod is scheduled
```

Key fields:
- **provisioner** — the plugin that creates the actual disk (e.g., `kubernetes.io/aws-ebs`, `kubernetes.io/gce-pd`, `ebs.csi.aws.com`)
- **parameters** — provisioner-specific settings (disk type, IOPS, encryption)
- **reclaimPolicy** — `Delete` (default) or `Retain`
- **volumeBindingMode** — `Immediate` (create disk now) or `WaitForFirstConsumer` (wait until a Pod needs it)
- **allowVolumeExpansion** — whether PVCs using this class can be resized

### Common StorageClasses by Provider

| Provider | Provisioner (CSI) | Parameters |
|----------|------------------|------------|
| AWS EBS | `ebs.csi.aws.com` | `type: gp3`, `iops: "3000"` |
| GCP PD | `pd.csi.storage.gke.io` | `type: pd-ssd` |
| Azure Disk | `disk.csi.azure.com` | `skuName: Premium_LRS` |
| Local (Rancher) | `rancher.io/local-path` | `nodePath: /opt/local-path` |

### Dynamic Provisioning in Action

With a StorageClass in place, just create a PVC — the PV appears automatically:

*dynamic-pvc.yaml*

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: app-data
spec:
  accessModes:
  - ReadWriteOnce
  resources:
    requests:
      storage: 20Gi
  storageClassName: fast      # references the StorageClass
```

```bash
kubectl apply -f dynamic-pvc.yaml

# The PVC triggers dynamic provisioning
kubectl get pvc
# NAME       STATUS   VOLUME                                     CAPACITY   ACCESS MODES   STORAGECLASS   AGE
# app-data   Bound    pvc-3a4e7b2c-1234-5678-abcd-9876543210ab   20Gi       RWO            fast           10s

# A PV was created automatically
kubectl get pv
# NAME                                       CAPACITY   ACCESS MODES   RECLAIM POLICY   STATUS   CLAIM              STORAGECLASS   AGE
# pvc-3a4e7b2c-1234-5678-abcd-9876543210ab   20Gi       RWO            Delete           Bound    default/app-data   fast           10s
```

Notice the auto-generated PV name (`pvc-3a4e7b2c-...`). You never had to create it — the StorageClass provisioner did it for you.

### Default StorageClass

Most clusters have a default StorageClass. If a PVC doesn't specify `storageClassName`, it uses the default:

```bash
kubectl get sc
# NAME                 PROVISIONER                    RECLAIMPOLICY   VOLUMEBINDINGMODE      ALLOWVOLUMEEXPANSION   AGE
# fast (default)       pd.csi.storage.gke.io          Delete          WaitForFirstConsumer   true                   30d
# standard             kubernetes.io/gce-pd           Delete          Immediate              true                   30d
# premium-rwo          pd.csi.storage.gke.io          Delete          WaitForFirstConsumer   true                   30d
```

The `(default)` marker comes from the annotation `storageclass.kubernetes.io/is-default-class: "true"`.

```yaml
# PVC without storageClassName — uses the default class
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: simple-claim
spec:
  accessModes:
  - ReadWriteOnce
  resources:
    requests:
      storage: 5Gi
  # no storageClassName → uses default StorageClass
```

> **Gotcha:** If you explicitly set `storageClassName: ""` (empty string), the PVC will only bind to a PV that also has no storage class — it won't use the default. This is different from omitting the field entirely. This catches people in CKA exams.

### WaitForFirstConsumer

`volumeBindingMode: WaitForFirstConsumer` delays PV creation until a Pod actually needs the volume. This is important for topology-aware provisioning — the disk gets created in the same availability zone as the node running the Pod:

```bash
kubectl apply -f dynamic-pvc.yaml

kubectl get pvc
# NAME       STATUS    VOLUME   CAPACITY   ACCESS MODES   STORAGECLASS   AGE
# app-data   Pending                                      fast           5s

# PVC is Pending — no Pod is using it yet

# Create a Pod that uses the PVC
kubectl apply -f pod-with-pvc.yaml

kubectl get pvc
# NAME       STATUS   VOLUME                                     CAPACITY   ACCESS MODES   STORAGECLASS   AGE
# app-data   Bound    pvc-3a4e7b2c-1234-5678-abcd-9876543210ab   20Gi       RWO            fast           30s

# Now the PV was provisioned in the same zone as the Pod's node
```

> **Tip:** Always use `WaitForFirstConsumer` in multi-zone clusters. `Immediate` mode can create a disk in zone A while the scheduler puts the Pod in zone B, causing a scheduling failure.

## StatefulSet Storage

Deployments share PVCs — if you scale to 3 replicas, all 3 Pods mount the same volume (if the access mode allows it). StatefulSets are different. Each Pod gets its own dedicated PVC through **volumeClaimTemplates**.

### volumeClaimTemplates

*mysql-statefulset.yaml*

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: mysql
spec:
  serviceName: mysql
  replicas: 3
  selector:
    matchLabels:
      app: mysql
  template:
    metadata:
      labels:
        app: mysql
    spec:
      containers:
      - name: mysql
        image: mysql:8.0
        env:
        - name: MYSQL_ROOT_PASSWORD
          value: "secret"
        ports:
        - containerPort: 3306
        volumeMounts:
        - name: mysql-data
          mountPath: /var/lib/mysql
  volumeClaimTemplates:                    # <── instead of volumes:
  - metadata:
      name: mysql-data
    spec:
      accessModes:
      - ReadWriteOnce
      storageClassName: fast
      resources:
        requests:
          storage: 10Gi
```

```bash
kubectl apply -f mysql-statefulset.yaml

# Each Pod gets its own PVC
kubectl get pvc
# NAME                   STATUS   VOLUME                                     CAPACITY   STORAGECLASS   AGE
# mysql-data-mysql-0     Bound    pvc-aaa111-...                             10Gi       fast           2m
# mysql-data-mysql-1     Bound    pvc-bbb222-...                             10Gi       fast           90s
# mysql-data-mysql-2     Bound    pvc-ccc333-...                             10Gi       fast           60s

kubectl get pods
# NAME      READY   STATUS    RESTARTS   AGE
# mysql-0   1/1     Running   0          2m
# mysql-1   1/1     Running   0          90s
# mysql-2   1/1     Running   0          60s
```

The PVC naming convention is `<volumeClaimTemplate-name>-<statefulset-name>-<ordinal>`:
- `mysql-data-mysql-0`
- `mysql-data-mysql-1`
- `mysql-data-mysql-2`

### Stable Storage Identity

The critical property: when a StatefulSet Pod is deleted and recreated, it reconnects to the **same PVC**:

```bash
# Delete mysql-1 Pod
kubectl delete pod mysql-1

# StatefulSet recreates it — with the same name and same PVC
kubectl get pods
# NAME      READY   STATUS    RESTARTS   AGE
# mysql-0   1/1     Running   0          10m
# mysql-1   1/1     Running   0          15s    ← new Pod, same PVC
# mysql-2   1/1     Running   0          10m

kubectl get pvc
# mysql-data-mysql-1 is still Bound — same data, same volume
```

> **Gotcha:** Scaling down a StatefulSet does NOT delete PVCs. If you scale from 3 to 1, `mysql-data-mysql-1` and `mysql-data-mysql-2` remain. This is by design — you don't want to lose data. When you scale back up, the Pods reattach to their existing PVCs. To reclaim storage, you must manually delete the PVCs.

## Expanding Volumes

Sometimes you need more space. Kubernetes supports online volume expansion if the StorageClass allows it.

### Enable Volume Expansion

The StorageClass must have `allowVolumeExpansion: true`:

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: expandable
provisioner: ebs.csi.aws.com
allowVolumeExpansion: true       # ← this is the key
parameters:
  type: gp3
```

### Expand a PVC

Edit the PVC to request more storage:

```bash
# Current size
kubectl get pvc app-data
# NAME       STATUS   VOLUME       CAPACITY   ACCESS MODES   STORAGECLASS   AGE
# app-data   Bound    pvc-abc123   20Gi       RWO            expandable     1d

# Expand to 50Gi
kubectl patch pvc app-data -p '{"spec":{"resources":{"requests":{"storage":"50Gi"}}}}'
# persistentvolumeclaim/app-data patched

# Check the status — you may see a condition indicating resize in progress
kubectl get pvc app-data -o yaml | grep -A 5 conditions
# conditions:
# - type: FileSystemResizePending
#   status: "True"
#   message: Waiting for user to (re-)start a pod to finish file system resize

# After Pod restart (if needed):
kubectl get pvc app-data
# NAME       STATUS   VOLUME       CAPACITY   ACCESS MODES   STORAGECLASS   AGE
# app-data   Bound    pvc-abc123   50Gi       RWO            expandable     1d
```

> **Gotcha:** You can only expand PVCs, never shrink them. Some CSI drivers can resize the filesystem online (no Pod restart needed). Others require the Pod to be restarted for the filesystem to expand. Check your driver's documentation. AWS EBS CSI and GCP PD CSI both support online expansion.

## Hands-On: Data That Survives Pod Deletion

Let's prove that Persistent Volumes actually persist. We'll create a PV and PVC, write data, delete the Pod, create a new Pod, and verify the data is still there.

*Step 1: Create the PV and PVC*

*manual-pv.yaml*

```yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: demo-pv
spec:
  capacity:
    storage: 1Gi
  accessModes:
  - ReadWriteOnce
  persistentVolumeReclaimPolicy: Retain
  storageClassName: manual
  hostPath:
    path: /tmp/k8s-demo-data
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: demo-pvc
spec:
  accessModes:
  - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
  storageClassName: manual
```

```bash
kubectl apply -f manual-pv.yaml
# persistentvolume/demo-pv created
# persistentvolumeclaim/demo-pvc created

kubectl get pv,pvc
# NAME                       CAPACITY   ACCESS MODES   RECLAIM POLICY   STATUS   CLAIM              STORAGECLASS
# persistentvolume/demo-pv   1Gi        RWO            Retain           Bound    default/demo-pvc   manual
#
# NAME                             STATUS   VOLUME    CAPACITY   ACCESS MODES   STORAGECLASS
# persistentvolumeclaim/demo-pvc   Bound    demo-pv   1Gi        RWO            manual
```

*Step 2: Create a Pod that writes data*

*writer-pod.yaml*

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: writer
spec:
  containers:
  - name: app
    image: busybox
    command: ["sh", "-c", "echo 'Written at: '$(date) > /data/proof.txt; echo 'Data written.'; sleep 3600"]
    volumeMounts:
    - name: storage
      mountPath: /data
  volumes:
  - name: storage
    persistentVolumeClaim:
      claimName: demo-pvc
```

```bash
kubectl apply -f writer-pod.yaml

# Verify the data was written
kubectl exec writer -- cat /data/proof.txt
# Written at: Sat Jan 31 10:00:00 UTC 2026
```

*Step 3: Delete the Pod*

```bash
kubectl delete pod writer
# pod "writer" deleted

# The PVC and PV still exist
kubectl get pvc demo-pvc
# NAME       STATUS   VOLUME    CAPACITY   ACCESS MODES   STORAGECLASS   AGE
# demo-pvc   Bound    demo-pv   1Gi        RWO            manual         5m
```

*Step 4: Create a new Pod and verify data persists*

*reader-pod.yaml*

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: reader
spec:
  containers:
  - name: app
    image: busybox
    command: ["sh", "-c", "cat /data/proof.txt; sleep 3600"]
    volumeMounts:
    - name: storage
      mountPath: /data
  volumes:
  - name: storage
    persistentVolumeClaim:
      claimName: demo-pvc
```

```bash
kubectl apply -f reader-pod.yaml

kubectl logs reader
# Written at: Sat Jan 31 10:00:00 UTC 2026

# The data survived Pod deletion!
```

*Step 5: Clean up*

```bash
kubectl delete pod reader
kubectl delete pvc demo-pvc
kubectl delete pv demo-pv
```

> **Tip:** On a real cluster with dynamic provisioning, you skip the PV creation entirely. Just create the PVC, and the StorageClass handles the rest. The hands-on above uses manual provisioning (`hostPath`) so it works on any local cluster like minikube or kind.

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

## Module 10 Summary

- **Containers are ephemeral** — data inside a container dies with the Pod. Volumes decouple storage from the Pod lifecycle.
- **emptyDir** — scratch space shared between containers in a Pod. Dies with the Pod. Use `medium: Memory` for RAM-backed cache.
- **hostPath** — mounts a node directory into the Pod. Data is tied to the node. Avoid in production; acceptable for DaemonSets.
- **PersistentVolume (PV)** — cluster-level storage resource with capacity, access mode, and reclaim policy. Created by admins or dynamically by StorageClasses.
- **PersistentVolumeClaim (PVC)** — user's request for storage. Binds to a matching PV by class, capacity, and access mode. PVCs stuck in `Pending` mean no PV matches.
- **Access modes:** RWO (one node read-write), ROX (many nodes read-only), RWX (many nodes read-write). Cloud block storage is RWO only.
- **Reclaim policies:** `Retain` keeps data after PVC deletion (manual cleanup). `Delete` removes the PV and disk automatically.
- **StorageClasses** enable dynamic provisioning — create a PVC, get a PV automatically. This is how production works.
- **Default StorageClass** — PVCs without `storageClassName` use it. Set via annotation. `storageClassName: ""` explicitly opts out.
- **WaitForFirstConsumer** — delays PV creation until a Pod needs it. Essential for multi-zone clusters to avoid zone mismatches.
- **StatefulSet volumeClaimTemplates** — each Pod gets its own PVC (`data-mysql-0`, `data-mysql-1`). PVCs persist after Pod deletion. Scale-down does not delete PVCs.
- **Volume expansion** — patch the PVC to request more storage. Requires `allowVolumeExpansion: true` on the StorageClass. You can only expand, never shrink.
- **The flow:** StorageClass defines how → PVC requests what → PV provides where → Pod mounts it.
