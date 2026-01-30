## Cluster Architecture

Every Kubernetes cluster has two halves: a **control plane** that makes decisions and a **data plane** (worker nodes) that runs your workloads. Understanding this split is the key to understanding everything else in Kubernetes.

```
                        ┌─────────────────────────────────────────────┐
                        │            CONTROL PLANE                    │
                        │                                             │
                        │  ┌───────────┐    ┌──────────────────────┐  │
   kubectl ─────────────┼─▶│ API Server │───▶│        etcd          │  │
                        │  └─────┬─────┘    │  (cluster database)  │  │
                        │        │          └──────────────────────┘  │
                        │        │                                    │
                        │  ┌─────▼──────┐   ┌──────────────────────┐  │
                        │  │ Scheduler  │   │ Controller Manager   │  │
                        │  │            │   │  • Deployment ctrl   │  │
                        │  │ "Where     │   │  • ReplicaSet ctrl   │  │
                        │  │  should    │   │  • Node ctrl         │  │
                        │  │  this Pod  │   │  • Job ctrl          │  │
                        │  │  run?"     │   │  • ...               │  │
                        │  └────────────┘   └──────────────────────┘  │
                        └────────────────────┬────────────────────────┘
                                             │
                        ─────────────────────┼────────────────────────
                                             │
            ┌────────────────────────────────┼────────────────────────────┐
            │                                │                            │
   ┌────────▼──────────┐  ┌─────────────────▼──┐  ┌──────────────────────▼┐
   │   WORKER NODE 1   │  │   WORKER NODE 2    │  │   WORKER NODE 3      │
   │                    │  │                    │  │                       │
   │ ┌──────────────┐  │  │ ┌──────────────┐   │  │ ┌──────────────┐     │
   │ │   kubelet    │  │  │ │   kubelet    │   │  │ │   kubelet    │     │
   │ ├──────────────┤  │  │ ├──────────────┤   │  │ ├──────────────┤     │
   │ │  kube-proxy  │  │  │ │  kube-proxy  │   │  │ │  kube-proxy  │     │
   │ ├──────────────┤  │  │ ├──────────────┤   │  │ ├──────────────┤     │
   │ │  containerd  │  │  │ │  containerd  │   │  │ │  containerd  │     │
   │ ├──────────────┤  │  │ ├──────────────┤   │  │ ├──────────────┤     │
   │ │ Pod Pod Pod  │  │  │ │ Pod Pod Pod  │   │  │ │ Pod Pod Pod  │     │
   │ └──────────────┘  │  │ └──────────────┘   │  │ └──────────────┘     │
   └───────────────────┘  └────────────────────┘  └──────────────────────┘
```

Every arrow in this diagram goes through the API Server. No component talks directly to another. This is a deliberate design choice -- the API Server is the single source of truth.

## The Control Plane

The control plane runs on one or more **master nodes** (in production, typically three for high availability). Its job is to watch your desired state and make reality match it.

### API Server (kube-apiserver)

The API Server is the **front door** to the cluster. Every interaction -- whether from kubectl, the dashboard, CI/CD pipelines, or other control plane components -- goes through it.

What it does:
- Authenticates and authorizes every request
- Validates the request (is this a well-formed Pod spec?)
- Persists the object to etcd
- Notifies watchers that something changed

*Everything talks to the API Server*

```bash
# Your kubectl commands hit the API Server
kubectl get pods

# Under the hood, that's an HTTP GET request:
# GET https://<api-server>:6443/api/v1/namespaces/default/pods

# You can see this with verbosity cranked up:
kubectl get pods -v=6
# I0131 10:15:23.456789  loader.go:373] Config loaded from /home/user/.kube/config
# I0131 10:15:23.567890  round_trippers.go:553]
#   GET https://127.0.0.1:6443/api/v1/namespaces/default/pods 200 OK
```

> **Tip:** The API Server is stateless. It reads from and writes to etcd. You can run multiple API Server replicas behind a load balancer for high availability -- they don't need to coordinate with each other.

### etcd

etcd is a distributed key-value store that holds **all cluster state**. Every Pod, Service, ConfigMap, Secret, and node registration lives here. If etcd dies and you have no backup, your cluster is gone.

What it stores:
- All Kubernetes objects (Pods, Deployments, Services, etc.)
- Cluster configuration
- RBAC policies
- Lease and leader election data

*etcd stores everything as key-value pairs*

```bash
# The keys look like filesystem paths:
# /registry/pods/default/nginx
# /registry/deployments/default/my-app
# /registry/services/default/my-service
# /registry/nodes/worker-1

# You don't interact with etcd directly in normal operations.
# The API Server is the only component that talks to etcd.

# But if you're curious (on a kubeadm cluster), you can peek:
kubectl exec -n kube-system etcd-controlplane -- etcdctl \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key \
  get /registry/pods/default --prefix --keys-only | head -10
# /registry/pods/default/nginx
# /registry/pods/default/my-app-7d4b8c6f5-abc12
# /registry/pods/default/my-app-7d4b8c6f5-def34
```

> **Warning:** Never write to etcd directly. Always go through the API Server. Direct writes bypass validation, admission controllers, and audit logging. You will break things.

### Scheduler (kube-scheduler)

The Scheduler watches for newly created Pods that have no node assigned. Its job is to pick the best node for each Pod.

How it decides:
1. **Filtering** -- eliminate nodes that can't run the Pod (not enough CPU, wrong node selector, taints that aren't tolerated)
2. **Scoring** -- rank the remaining nodes (spread Pods evenly, prefer nodes with the image cached, etc.)
3. **Binding** -- assign the Pod to the highest-scoring node

*Watching the Scheduler in action*

```bash
# Create a Pod and watch it get scheduled
kubectl run scheduler-test --image=nginx:1.25

# The describe output shows the scheduling decision
kubectl describe pod scheduler-test
# ...
# Events:
#   Type    Reason     Age   From               Message
#   ----    ------     ----  ----               -------
#   Normal  Scheduled  5s    default-scheduler  Successfully assigned
#                                               default/scheduler-test to docker-desktop
#   Normal  Pulling    4s    kubelet            Pulling image "nginx:1.25"
#   Normal  Pulled     2s    kubelet            Successfully pulled image
#   Normal  Created    2s    kubelet            Created container scheduler-test
#   Normal  Started    2s    kubelet            Started container scheduler-test

# Clean up
kubectl delete pod scheduler-test
```

The Scheduler only makes a decision. It writes `spec.nodeName` on the Pod object. The kubelet on that node sees the assignment and does the actual work.

> **Gotcha:** If no node can satisfy a Pod's requirements, the Pod stays in `Pending` state. The Scheduler keeps retrying, and you'll see events like `0/3 nodes are available: 3 Insufficient cpu`. This is the number one reason Pods get stuck.

### Controller Manager (kube-controller-manager)

The Controller Manager runs dozens of **controllers** -- each one a loop that watches a specific type of resource and takes action to make reality match the desired state.

Key controllers:
- **Deployment controller** -- watches Deployments, creates/updates ReplicaSets
- **ReplicaSet controller** -- watches ReplicaSets, creates/deletes Pods to match the replica count
- **Node controller** -- monitors node health, marks nodes as NotReady
- **Job controller** -- creates Pods for Jobs, tracks completion
- **ServiceAccount controller** -- creates default ServiceAccounts in new namespaces
- **Namespace controller** -- cleans up resources when a namespace is deleted

*Seeing controllers at work*

```bash
# Create a Deployment with 3 replicas
kubectl create deployment web --image=nginx:1.25 --replicas=3

# The Deployment controller created a ReplicaSet:
kubectl get replicasets
# NAME              DESIRED   CURRENT   READY   AGE
# web-7d4b8c6f5     3         3         3       10s

# The ReplicaSet controller created 3 Pods:
kubectl get pods
# NAME                   READY   STATUS    RESTARTS   AGE
# web-7d4b8c6f5-abc12    1/1     Running   0          10s
# web-7d4b8c6f5-def34    1/1     Running   0          10s
# web-7d4b8c6f5-ghi56    1/1     Running   0          10s

# Clean up
kubectl delete deployment web
```

These controllers don't talk to each other. Each one watches the API Server for changes to its resource type and acts independently. The Deployment controller doesn't tell the ReplicaSet controller what to do -- it creates a ReplicaSet object, and the ReplicaSet controller notices it.

## The Data Plane (Worker Nodes)

Worker nodes are where your application Pods actually run. Each node runs three components.

### kubelet

The kubelet is an **agent** that runs on every node (including control plane nodes). It's the bridge between the Kubernetes API and the container runtime.

What it does:
- Watches the API Server for Pods assigned to its node
- Tells the container runtime to start/stop containers
- Monitors container health (liveness and readiness probes)
- Reports node status and Pod status back to the API Server

*Checking the kubelet*

```bash
# The kubelet runs as a systemd service on each node (not as a Pod)
# On a kubeadm cluster, you can check it:
systemctl status kubelet
# ● kubelet.service - kubelet: The Kubernetes Node Agent
#    Loaded: loaded (/lib/systemd/system/kubelet.service; enabled)
#    Active: active (running) since ...

# In a local cluster (Docker Desktop/minikube), the kubelet runs
# inside the node container. You can see its effect in Pod events:
kubectl describe pod <any-pod-name>
# Events show the kubelet pulling images, creating containers, etc.
```

> **Tip:** The kubelet is the only component that doesn't run as a Pod (in most setups). It has to manage Pods, so it can't be a Pod itself -- that would be a chicken-and-egg problem. It runs as a system daemon.

### kube-proxy

kube-proxy runs on every node and manages **network rules** that allow Pods to communicate with Services. When you create a Service, kube-proxy ensures that traffic to the Service's ClusterIP gets routed to a healthy backend Pod.

How it works (three modes):
- **iptables mode** (default) -- programs iptables rules that DNAT traffic to Pod IPs
- **IPVS mode** -- uses Linux IPVS for more efficient load balancing at scale
- **nftables mode** (newer) -- uses nftables instead of iptables

*Seeing kube-proxy in action*

```bash
# kube-proxy runs as a DaemonSet (one Pod per node)
kubectl get daemonset -n kube-system
# NAME         DESIRED   CURRENT   READY   UP-TO-DATE   AVAILABLE
# kube-proxy   1         1         1       1            1

# Create a Service to see kube-proxy at work
kubectl create deployment web --image=nginx:1.25 --replicas=2
kubectl expose deployment web --port=80

# The Service gets a ClusterIP
kubectl get svc web
# NAME   TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)   AGE
# web    ClusterIP   10.96.123.45    <none>        80/TCP    5s

# kube-proxy created iptables rules to route 10.96.123.45 → Pod IPs
# You can verify (on the node):
# iptables -t nat -L KUBE-SERVICES | grep web

# Clean up
kubectl delete deployment web
kubectl delete svc web
```

### Container Runtime

The container runtime is the software that actually pulls images and runs containers. Kubernetes doesn't run containers itself -- it delegates to a runtime via the **Container Runtime Interface (CRI)**.

Common runtimes:
- **containerd** -- the default in most clusters (Docker Desktop, kind, GKE, EKS)
- **CRI-O** -- used in OpenShift and some bare-metal setups
- **Docker Engine** -- was removed as a runtime in K8s 1.24 (but Docker-built images still work everywhere)

```bash
# Check which runtime your cluster uses
kubectl get node -o wide
# NAME             STATUS   ROLES           AGE   VERSION   OS-IMAGE       CONTAINER-RUNTIME
# docker-desktop   Ready    control-plane   1h    v1.28.2   Docker Desktop containerd://1.6.22

# The kubelet talks to the runtime via a Unix socket
# containerd: /run/containerd/containerd.sock
# CRI-O:     /var/run/crio/crio.sock
```

> **Gotcha:** "Docker removed from Kubernetes" caused panic in 2020, but it was a non-event for most users. Docker images are OCI-compliant -- they work with containerd and CRI-O. Only the Docker Engine shim (`dockershim`) was removed. Your Dockerfiles are fine.

## The Reconciliation Loop

This is the single most important concept in Kubernetes. Every controller follows the same pattern:

```
           ┌──────────────────────────────────────────┐
           │                                          │
           ▼                                          │
   ┌───────────────┐     ┌───────────────┐    ┌──────┴───────┐
   │ Observe actual │────▶│   Compare to  │───▶│ Take action  │
   │     state      │     │ desired state │    │ to close gap │
   │                │     │               │    │              │
   │ "3 Pods exist" │     │ "Want 5 Pods" │    │ "Create 2    │
   │                │     │               │    │  more Pods"  │
   └───────────────┘     └───────────────┘    └──────────────┘
```

This is called a **reconciliation loop** (or control loop). It runs continuously. There is no "run once and done." If reality drifts from the desired state, the controller corrects it.

### Desired State vs Actual State

You tell Kubernetes **what** you want (desired state). Kubernetes figures out **how** to get there (actual state reconciliation).

*Desired state: "I want 3 nginx Pods"*

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 3          # ← This is your desired state
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
      - name: nginx
        image: nginx:1.25
```

*Apply it and watch*

```bash
kubectl apply -f deployment.yaml

# Desired: 3.  Actual: 3.  No action needed.
kubectl get deployment web
# NAME   READY   UP-TO-DATE   AVAILABLE   AGE
# web    3/3     3            3           30s
```

### What Happens When a Pod Dies?

The reconciliation loop kicks in automatically:

```bash
# Current state: 3 healthy Pods
kubectl get pods
# NAME                   READY   STATUS    RESTARTS   AGE
# web-7d4b8c6f5-abc12    1/1     Running   0          2m
# web-7d4b8c6f5-def34    1/1     Running   0          2m
# web-7d4b8c6f5-ghi56    1/1     Running   0          2m

# Kill one Pod manually
kubectl delete pod web-7d4b8c6f5-abc12

# Within seconds, check again
kubectl get pods
# NAME                   READY   STATUS    RESTARTS   AGE
# web-7d4b8c6f5-def34    1/1     Running   0          2m
# web-7d4b8c6f5-ghi56    1/1     Running   0          2m
# web-7d4b8c6f5-jkl78    1/1     Running   0          3s   ← NEW Pod!

# The ReplicaSet controller noticed: desired=3, actual=2.
# It created a replacement immediately.
```

> **Tip:** This is why you never manage Pods directly. Create a Deployment, set the replica count, and let the controllers handle the rest. If a node crashes at 3 AM, Kubernetes reschedules your Pods without waking you up.

### Reconciliation Happens at Every Level

The loop isn't just for replica counts. It applies everywhere:

| Controller | Desired State | Reconciliation Action |
|---|---|---|
| ReplicaSet | 3 replicas | Creates/deletes Pods |
| Deployment | Image v2 | Creates new ReplicaSet, scales down old |
| Node | Node reports healthy | Marks NotReady if heartbeat stops |
| Service | Route to `app=web` | Updates endpoints when Pods come/go |
| HPA | CPU < 70% | Adjusts replica count up or down |

## What Happens When You Run kubectl apply

Let's trace the full lifecycle of `kubectl apply -f deployment.yaml` step by step:

```
 YOU                 CONTROL PLANE                              WORKER NODE
  │                                                               │
  │  1. kubectl apply                                             │
  │─────────▶ API Server                                          │
  │           │  • Authenticates (who are you?)                   │
  │           │  • Authorizes (can you do this?)                  │
  │           │  • Validates (is this valid YAML?)                │
  │           │  • Runs admission controllers                     │
  │           │                                                   │
  │           │  2. Persists to etcd                              │
  │           │─────────▶ etcd                                    │
  │           │           (stores Deployment object)              │
  │           │                                                   │
  │           │  3. Deployment controller notices                 │
  │           │◀───watch── Controller Manager                     │
  │           │           (creates ReplicaSet object)             │
  │           │                                                   │
  │           │  4. ReplicaSet controller notices                 │
  │           │◀───watch── Controller Manager                     │
  │           │           (creates Pod objects with no node)      │
  │           │                                                   │
  │           │  5. Scheduler notices unscheduled Pods            │
  │           │◀───watch── Scheduler                              │
  │           │           (assigns Pods to nodes)                 │
  │           │                                                   │
  │           │  6. kubelet notices Pods assigned to it           │
  │           │──────────────────────────────────────────────────▶│
  │           │                                            kubelet│
  │           │                                              │    │
  │           │                              7. Pulls image  │    │
  │           │                              8. Starts       │    │
  │           │                                 container    │    │
  │           │                              9. Reports      │    │
  │           │◀─────────────────────────────── status back   │    │
  │           │                                               │
```

Let's observe each step with real commands:

*Step 1 -- kubectl sends the request*

```bash
# Watch what kubectl sends with high verbosity
kubectl apply -f deployment.yaml -v=8
# I0131 10:20:01.123456  request.go:1154]
#   Request Body: {"apiVersion":"apps/v1","kind":"Deployment",...}
# I0131 10:20:01.234567  round_trippers.go:463]
#   POST https://127.0.0.1:6443/apis/apps/v1/namespaces/default/deployments
#   Response Status: 201 Created
```

*Step 2 through 5 -- watch events unfold in real time*

```bash
# In one terminal, watch events as they happen:
kubectl get events --watch
# LAST SEEN   TYPE     REASON              OBJECT                    MESSAGE
# 0s          Normal   ScalingReplicaSet   deployment/web            Scaled up replica set web-7d4b8c6f5 to 3
# 0s          Normal   SuccessfulCreate    replicaset/web-7d4b8c6f5  Created pod: web-7d4b8c6f5-abc12
# 0s          Normal   SuccessfulCreate    replicaset/web-7d4b8c6f5  Created pod: web-7d4b8c6f5-def34
# 0s          Normal   SuccessfulCreate    replicaset/web-7d4b8c6f5  Created pod: web-7d4b8c6f5-ghi56
# 0s          Normal   Scheduled           pod/web-7d4b8c6f5-abc12   Successfully assigned default/web-7d4b8c6f5-abc12 to docker-desktop
# 0s          Normal   Pulling             pod/web-7d4b8c6f5-abc12   Pulling image "nginx:1.25"
# 0s          Normal   Pulled              pod/web-7d4b8c6f5-abc12   Successfully pulled image "nginx:1.25"
# 0s          Normal   Created             pod/web-7d4b8c6f5-abc12   Created container nginx
# 0s          Normal   Started             pod/web-7d4b8c6f5-abc12   Started container nginx
```

*Step 6 through 9 -- see the kubelet's work on a specific Pod*

```bash
# describe shows the full timeline for one Pod
kubectl describe pod web-7d4b8c6f5-abc12
# ...
# Events:
#   Type    Reason     Age   From               Message
#   ----    ------     ----  ----               -------
#   Normal  Scheduled  30s   default-scheduler  Successfully assigned to docker-desktop
#   Normal  Pulling    29s   kubelet            Pulling image "nginx:1.25"
#   Normal  Pulled     25s   kubelet            Successfully pulled image in 4.2s
#   Normal  Created    25s   kubelet            Created container nginx
#   Normal  Started    25s   kubelet            Started container nginx
```

Notice the `From` column. It tells you exactly which component generated each event: `default-scheduler` for scheduling, `kubelet` for container operations. This is how you debug issues -- read the events and identify which component is having trouble.

> **Tip:** Use `kubectl get events --sort-by=.metadata.creationTimestamp` to see events in chronological order. The default ordering can be confusing. Add `--watch` to see them in real time as you apply resources.

## Exploring Your Cluster's Components

Now let's poke around and see these components running in your cluster.

### Control Plane Pods

On most clusters (kubeadm, Docker Desktop, kind), control plane components run as **static Pods** in the `kube-system` namespace:

```bash
kubectl get pods -n kube-system
# NAME                                     READY   STATUS    RESTARTS   AGE
# coredns-5dd5756b68-7xhvs                1/1     Running   0          4h
# coredns-5dd5756b68-bk9lz                1/1     Running   0          4h
# etcd-docker-desktop                      1/1     Running   0          4h
# kube-apiserver-docker-desktop             1/1     Running   0          4h
# kube-controller-manager-docker-desktop    1/1     Running   0          4h
# kube-proxy-xxxxx                         1/1     Running   0          4h
# kube-scheduler-docker-desktop             1/1     Running   0          4h
# storage-provisioner                      1/1     Running   0          4h
```

Every component from our architecture diagram is right there. Let's examine them:

*Inspect the API Server*

```bash
kubectl describe pod kube-apiserver-docker-desktop -n kube-system
# Name:             kube-apiserver-docker-desktop
# Namespace:        kube-system
# Priority:         2000001000
# ...
# Containers:
#   kube-apiserver:
#     Image:         registry.k8s.io/kube-apiserver:v1.28.2
#     Command:
#       kube-apiserver
#       --advertise-address=192.168.65.3
#       --etcd-servers=https://127.0.0.1:2379
#       --secure-port=6443
#       --service-cluster-ip-range=10.96.0.0/12
#       ...
```

Notice `--etcd-servers=https://127.0.0.1:2379` in the command -- the API Server is configured to talk to etcd. And `--service-cluster-ip-range=10.96.0.0/12` defines the IP range for Services.

*Inspect etcd*

```bash
kubectl describe pod etcd-docker-desktop -n kube-system | grep -A 20 "Command:"
# Command:
#   etcd
#   --data-dir=/var/lib/etcd
#   --listen-client-urls=https://127.0.0.1:2379
#   --cert-file=/etc/kubernetes/pki/etcd/server.crt
#   --key-file=/etc/kubernetes/pki/etcd/server.key
#   ...
```

*Inspect the Scheduler and Controller Manager*

```bash
kubectl describe pod kube-scheduler-docker-desktop -n kube-system | grep Image:
#     Image:  registry.k8s.io/kube-scheduler:v1.28.2

kubectl describe pod kube-controller-manager-docker-desktop -n kube-system | grep Image:
#     Image:  registry.k8s.io/kube-controller-manager:v1.28.2
```

### Cluster Info Commands

```bash
# Quick overview of the cluster endpoints
kubectl cluster-info
# Kubernetes control plane is running at https://127.0.0.1:6443
# CoreDNS is running at https://127.0.0.1:6443/api/v1/namespaces/kube-system/services/kube-dns:dns/proxy

# Component statuses (deprecated in newer versions, but educational)
kubectl get componentstatuses
# Warning: v1 ComponentStatus is deprecated in v1.19+
# NAME                 STATUS    MESSAGE   ERROR
# scheduler            Healthy   ok
# controller-manager   Healthy   ok
# etcd-0               Healthy   ok

# Detailed node info shows kubelet version, OS, container runtime
kubectl describe node docker-desktop
# ...
# System Info:
#   Machine ID:                 ...
#   System UUID:                ...
#   Boot ID:                    ...
#   Kernel Version:             5.15.49-linuxkit
#   OS Image:                   Docker Desktop
#   Operating System:           linux
#   Architecture:               amd64
#   Container Runtime Version:  containerd://1.6.22
#   Kubelet Version:            v1.28.2
#   Kube-Proxy Version:         v1.28.2
# ...
# Capacity:
#   cpu:                4
#   memory:             8145440Ki
#   pods:               110
# Allocatable:
#   cpu:                4
#   memory:             8043040Ki
#   pods:               110
```

> **Tip:** `kubectl describe node` is invaluable for debugging. It shows the node's capacity, what's been allocated, conditions (MemoryPressure, DiskPressure), and a list of all Pods running on that node.

### API Resources

The API Server serves dozens of resource types. See them all:

```bash
kubectl api-resources | head -20
# NAME                  SHORTNAMES   APIVERSION   NAMESPACED   KIND
# bindings                           v1           true         Binding
# componentstatuses     cs           v1           false        ComponentStatus
# configmaps            cm           v1           true         ConfigMap
# endpoints             ep           v1           true         Endpoints
# events                ev           v1           true         Event
# namespaces            ns           v1           false        Namespace
# nodes                 no           v1           false        Node
# pods                  po           v1           true         Pod
# secrets                            v1           true         Secret
# services              svc          v1           true         Service
# deployments           deploy       apps/v1      true         Deployment
# replicasets           rs           apps/v1      true         ReplicaSet
# ...

# Count them
kubectl api-resources | wc -l
# 62  (varies by cluster and installed CRDs)
```

Each one of these is a resource the API Server knows about. When you `kubectl get pods`, you're hitting the `pods` resource. When you `kubectl get deployments`, you're hitting `deployments`. It's all the same API, just different resource types.

## Putting It All Together

Let's do a full exercise that touches every component. We'll create a Deployment and watch the entire chain react:

*Terminal 1 -- watch Pods*

```bash
kubectl get pods --watch
```

*Terminal 2 -- watch events*

```bash
kubectl get events --watch --sort-by=.metadata.creationTimestamp
```

*Terminal 3 -- create the Deployment*

```bash
kubectl create deployment demo --image=nginx:1.25 --replicas=3
```

You should see this cascade in your event stream:

1. **Deployment controller** scales up the ReplicaSet
2. **ReplicaSet controller** creates 3 Pod objects
3. **Scheduler** assigns each Pod to a node
4. **kubelet** pulls the image, creates containers, starts them
5. **kubelet** reports Pod status back as Running

Now break something and watch the repair:

```bash
# Delete a Pod -- the ReplicaSet controller will fix it
kubectl delete pod $(kubectl get pods -l app=demo -o name | head -1)

# Scale down -- the ReplicaSet controller will remove excess Pods
kubectl scale deployment demo --replicas=1

# Scale back up -- new Pods are created
kubectl scale deployment demo --replicas=3

# Clean up
kubectl delete deployment demo
```

> **Gotcha:** If you delete a standalone Pod (one not managed by a Deployment or ReplicaSet), it's gone forever. No controller is watching it. This is why you almost never create bare Pods -- always use a Deployment.

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

## Module 2 Summary

- **Control plane** = API Server + etcd + Scheduler + Controller Manager
- **API Server** is the front door -- every request goes through it, and it's the only component that talks to etcd
- **etcd** stores all cluster state as key-value pairs -- back it up or lose everything
- **Scheduler** assigns unscheduled Pods to nodes based on filtering and scoring
- **Controller Manager** runs reconciliation loops for Deployments, ReplicaSets, Nodes, Jobs, and more
- **Worker nodes** run kubelet (manages Pods), kube-proxy (routes Service traffic), and a container runtime (containerd/CRI-O)
- **Reconciliation loop** = observe actual state, compare to desired state, take action to close the gap -- this runs continuously
- `kubectl apply` triggers a chain: API Server → etcd → Controller Manager → Scheduler → kubelet → container runtime
- Use `kubectl get pods -n kube-system` to see your control plane components running
- Use `kubectl describe node` to see node capacity, runtime version, and running Pods
