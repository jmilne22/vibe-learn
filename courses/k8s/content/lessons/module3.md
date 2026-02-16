## The Kubernetes API

Everything in Kubernetes is an **API object**. Pods, Services, Deployments, Secrets — they're all resources served by the API Server over HTTPS. kubectl is just a fancy HTTP client.

```
kubectl get pods  →  GET /api/v1/namespaces/default/pods

                     ┌──────────────────────────────────┐
                     │         API URL Structure         │
                     │                                   │
                     │  /api/v1                          │  ← core group
                     │  /apis/apps/v1                    │  ← named group
                     │  /apis/batch/v1                   │  ← named group
                     │  /apis/networking.k8s.io/v1       │  ← named group
                     │                                   │
                     │  /api/v1/namespaces/default/pods  │  ← specific resource
                     │  /apis/apps/v1/deployments        │  ← all deployments
                     └──────────────────────────────────┘
```

### API Groups and Versions

Resources are organized into **API groups**, each with a version:

| Group | apiVersion | Resources |
|-------|-----------|-----------|
| Core (legacy) | `v1` | Pod, Service, ConfigMap, Secret, Namespace, Node |
| apps | `apps/v1` | Deployment, ReplicaSet, StatefulSet, DaemonSet |
| batch | `batch/v1` | Job, CronJob |
| networking.k8s.io | `networking.k8s.io/v1` | Ingress, NetworkPolicy |
| rbac.authorization.k8s.io | `rbac.authorization.k8s.io/v1` | Role, ClusterRole, RoleBinding |

The `apiVersion` field in your YAML tells the API Server which group and version to use:

```yaml
apiVersion: apps/v1      # group "apps", version "v1"
kind: Deployment         # resource type within that group
```

> **Why does this matter?** If you use the wrong apiVersion, the API Server rejects the manifest. `kubectl explain <resource>` tells you the correct one. API versions also evolve — `extensions/v1beta1` for Ingress was replaced by `networking.k8s.io/v1`.

### Every Object Has the Same Structure

Every Kubernetes object follows the same four-part structure:

```yaml
apiVersion: apps/v1              # 1. API group + version
kind: Deployment                 # 2. Resource type
metadata:                        # 3. Identity — name, namespace, labels, annotations
  name: web
  namespace: default
  labels:
    app: web
spec:                            # 4. Desired state — what you want
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
      - name: nginx
        image: nginx:1.25
```

The API Server adds a fifth part — `status` — which you don't write. It's the **actual state**, updated by controllers:

```bash
kubectl get deployment web -o yaml | grep -A 5 "^status:"
# status:
#   availableReplicas: 3
#   readyReplicas: 3
#   replicas: 3
#   updatedReplicas: 3
```

## kubectl: Your Primary Interface

kubectl is the CLI for talking to the API Server. It reads your kubeconfig (`~/.kube/config`), authenticates, and sends HTTP requests.

### The Essential Verbs

*CRUD operations*

```bash
# CREATE — make a new resource
kubectl create deployment web --image=nginx
kubectl apply -f manifest.yaml            # create or update (preferred)

# READ — view resources
kubectl get pods                           # list
kubectl get pod nginx -o yaml             # full YAML
kubectl describe pod nginx                 # human-readable detail

# UPDATE — modify resources
kubectl apply -f manifest.yaml            # declarative update
kubectl edit deployment web               # opens in $EDITOR
kubectl patch deployment web -p '{"spec":{"replicas":5}}'
kubectl scale deployment web --replicas=5
kubectl set image deployment/web nginx=nginx:1.26

# DELETE — remove resources
kubectl delete pod nginx
kubectl delete -f manifest.yaml
kubectl delete deployment --all           # all deployments in namespace
```

### get — List and Filter

*Basic listing*

```bash
kubectl get pods
# NAME                   READY   STATUS    RESTARTS   AGE
# web-7d4b8c6f5-abc12    1/1     Running   0          5m
# web-7d4b8c6f5-def34    1/1     Running   0          5m

kubectl get pods,svc,deploy        # multiple resource types at once
kubectl get all                     # shorthand for common types
```

*Filtering with labels*

```bash
kubectl get pods -l app=web                    # exact match
kubectl get pods -l 'app in (web, api)'       # set-based
kubectl get pods -l app=web,tier=frontend     # multiple labels (AND)
kubectl get pods -l '!canary'                  # label doesn't exist
```

*Namespace control*

```bash
kubectl get pods -n kube-system     # specific namespace
kubectl get pods -A                  # all namespaces
kubectl get pods --all-namespaces    # same as -A
```

### Output Formats

kubectl supports several output formats. Mastering these is essential:

*Wide — show extra columns*

```bash
kubectl get pods -o wide
# NAME                   READY   STATUS    RESTARTS   AGE   IP           NODE
# web-7d4b8c6f5-abc12    1/1     Running   0          5m    10.1.0.15    node-1
```

*YAML/JSON — full object*

```bash
kubectl get pod nginx -o yaml      # full YAML (including status)
kubectl get pod nginx -o json      # full JSON
```

*jsonpath — extract specific fields*

```bash
# Get just the Pod IP
kubectl get pod nginx -o jsonpath='{.status.podIP}'
# 10.1.0.15

# Get all Pod names
kubectl get pods -o jsonpath='{.items[*].metadata.name}'
# web-abc12 web-def34 web-ghi56

# Get Pod name and IP as a table
kubectl get pods -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.status.podIP}{"\n"}{end}'
# web-abc12   10.1.0.15
# web-def34   10.1.0.16
# web-ghi56   10.1.0.17
```

*custom-columns — custom table*

```bash
kubectl get pods -o custom-columns=\
NAME:.metadata.name,\
STATUS:.status.phase,\
IP:.status.podIP,\
NODE:.spec.nodeName
# NAME                  STATUS    IP           NODE
# web-7d4b8c6f5-abc12   Running   10.1.0.15    node-1
# web-7d4b8c6f5-def34   Running   10.1.0.16    node-1
```

> **Tip:** `-o jsonpath` and `-o custom-columns` are CKA/CKAD exam essentials. Practice them until they're muscle memory. They let you script around kubectl output without `grep` and `awk`.

### describe — Human-Readable Detail

`describe` gives you everything about a resource in a readable format, including **events** (the most useful part for debugging):

```bash
kubectl describe pod web-7d4b8c6f5-abc12
# Name:             web-7d4b8c6f5-abc12
# Namespace:        default
# Priority:         0
# Service Account:  default
# Node:             docker-desktop/192.168.65.3
# Start Time:       Fri, 31 Jan 2025 10:00:00 +0000
# Labels:           app=web
#                   pod-template-hash=7d4b8c6f5
# Status:           Running
# IP:               10.1.0.15
# Controlled By:    ReplicaSet/web-7d4b8c6f5
# Containers:
#   nginx:
#     Image:          nginx:1.25
#     Port:           <none>
#     State:          Running
#       Started:      Fri, 31 Jan 2025 10:00:02 +0000
#     Ready:          True
#     Restart Count:  0
# Events:
#   Type    Reason     Age   From               Message
#   ----    ------     ----  ----               -------
#   Normal  Scheduled  5m    default-scheduler  Successfully assigned ...
#   Normal  Pulling    5m    kubelet            Pulling image "nginx:1.25"
#   Normal  Pulled     5m    kubelet            Successfully pulled image
#   Normal  Created    5m    kubelet            Created container nginx
#   Normal  Started    5m    kubelet            Started container nginx
```

The `Events` section at the bottom is gold. When something goes wrong, this is where you look first.

### explain — Built-in Documentation

`explain` is kubectl's built-in reference. It shows the schema for any resource or field:

*Using kubectl explain*

```bash
# Top-level fields for a Pod
kubectl explain pod
# KIND:     Pod
# VERSION:  v1
# DESCRIPTION:
#   Pod is a collection of containers that can run on a host.
# FIELDS:
#   apiVersion   <string>
#   kind         <string>
#   metadata     <ObjectMeta>
#   spec         <PodSpec>
#   status       <PodStatus>

# Drill into a specific field
kubectl explain pod.spec.containers
# KIND:     Pod
# VERSION:  v1
# FIELD:    containers <[]Container>
# DESCRIPTION:
#   List of containers belonging to the pod.
# FIELDS:
#   name          <string> -required-
#   image         <string>
#   command       <[]string>
#   args          <[]string>
#   ports         <[]ContainerPort>
#   env           <[]EnvVar>
#   resources     <ResourceRequirements>
#   ...

# See the full tree (recursive)
kubectl explain pod.spec --recursive | head -40
```

> **Tip:** `kubectl explain` is available during CKA/CKAD exams and doesn't require internet. Use it instead of googling. `kubectl explain deployment.spec.strategy` tells you exactly what fields are available and what they mean.

## Dry Run and Validation

Before applying manifests to a live cluster, validate them:

### Client-Side Dry Run

Validates the YAML locally without sending anything to the API Server. Useful for generating YAML templates:

```bash
# Generate a Deployment YAML without creating it
kubectl create deployment web --image=nginx --replicas=3 \
  --dry-run=client -o yaml
# apiVersion: apps/v1
# kind: Deployment
# metadata:
#   labels:
#     app: web
#   name: web
# spec:
#   replicas: 3
#   selector:
#     matchLabels:
#       app: web
#   template:
#     metadata:
#       labels:
#         app: web
#     spec:
#       containers:
#       - image: nginx
#         name: nginx

# Save it to a file
kubectl create deployment web --image=nginx --replicas=3 \
  --dry-run=client -o yaml > deployment.yaml
```

### Server-Side Dry Run

Sends the request to the API Server for full validation (schema checks, admission controllers) but doesn't persist:

```bash
kubectl apply -f deployment.yaml --dry-run=server
# deployment.apps/web created (server dry run)
```

### Diff

Shows what would change if you applied a manifest:

```bash
kubectl diff -f deployment.yaml
# diff -u -N /tmp/LIVE-123 /tmp/MERGED-456
# --- /tmp/LIVE-123
# +++ /tmp/MERGED-456
# @@ -6,7 +6,7 @@
#    spec:
# -    replicas: 3
# +    replicas: 5
```

> **Workflow:** Generate with `--dry-run=client -o yaml`, edit the YAML, validate with `--dry-run=server`, check with `diff`, then `apply`. This is the safest workflow.

## Sorting, Filtering, and Field Selectors

### Sorting

```bash
# Sort by creation time (newest last)
kubectl get pods --sort-by=.metadata.creationTimestamp

# Sort by restart count
kubectl get pods --sort-by=.status.containerStatuses[0].restartCount

# Sort events by time
kubectl get events --sort-by=.lastTimestamp
```

### Field Selectors

Filter by object fields (not labels):

```bash
# Pods on a specific node
kubectl get pods --field-selector spec.nodeName=node-1

# Pods not in Running phase
kubectl get pods --field-selector status.phase!=Running

# Combine field selectors
kubectl get pods --field-selector status.phase=Running,spec.nodeName=node-1

# All resources in a specific namespace (field selector)
kubectl get pods --field-selector metadata.namespace=kube-system
```

## Imperative vs Declarative

Two philosophies for managing resources:

*Imperative — tell K8s what to do*

```bash
kubectl create deployment web --image=nginx
kubectl scale deployment web --replicas=3
kubectl set image deployment/web nginx=nginx:1.26
```

*Declarative — tell K8s what you want*

```yaml
# deployment.yaml
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
      - name: nginx
        image: nginx:1.26
```

```bash
kubectl apply -f deployment.yaml
```

| Aspect | Imperative | Declarative |
|--------|-----------|-------------|
| How | Run commands | Write YAML, apply |
| History | No record of changes | YAML in git = audit trail |
| Reproducible | No | Yes — same YAML → same result |
| Automation | Hard | Natural — CI/CD applies YAML |
| Use for | Quick testing, debugging | Everything else |

> **Rule:** Use imperative commands for quick ad-hoc tasks and `--dry-run=client -o yaml` to generate starting YAML. Use declarative `apply` for anything you want to keep, version, or automate.

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

## Module 3 Summary

- The Kubernetes API is RESTful — `kubectl get pods` = `GET /api/v1/namespaces/default/pods`
- Every object has: `apiVersion`, `kind`, `metadata`, `spec` (desired state), and `status` (actual state)
- **get** — list resources, filter with `-l` (labels), `-o` for output format (wide, yaml, json, jsonpath)
- **describe** — human-readable detail with events (the first place to look when debugging)
- **explain** — built-in schema documentation for any resource or field
- **jsonpath** — extract specific fields for scripting (`-o jsonpath='{.status.podIP}'`)
- **Dry run** — `--dry-run=client` for local validation, `--dry-run=server` for full API validation
- **diff** — preview what would change before applying
- **Imperative** for quick tasks, **declarative** (`apply -f`) for everything real
- Generate YAML with `--dry-run=client -o yaml` instead of writing from scratch
