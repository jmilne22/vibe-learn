## Troubleshooting

When something breaks in Kubernetes, the instinct is to start guessing. Resist that. Troubleshooting in Kubernetes is systematic. The cluster tells you exactly what is wrong — you just need to ask the right questions in the right order.

### The Troubleshooting Mindset

Follow this order every time:

```
┌─────────────────────────────────────────────────────────────────┐
│                  SYSTEMATIC DEBUGGING FLOW                       │
│                                                                  │
│  1. CHECK STATUS         kubectl get <resource>                  │
│         │                  What state is it in?                   │
│         ▼                                                        │
│  2. DESCRIBE              kubectl describe <resource>             │
│         │                  What do the Events say?                │
│         ▼                                                        │
│  3. CHECK LOGS            kubectl logs <pod>                     │
│         │                  What is the application saying?        │
│         ▼                                                        │
│  4. CHECK NETWORKING      Can Pods reach each other?             │
│         │                  Is DNS working? Endpoints populated?   │
│         ▼                                                        │
│  5. CHECK NODE            kubectl describe node                  │
│                           Is the node healthy?                    │
└─────────────────────────────────────────────────────────────────┘
```

Work from the **outside in**. Start with the broadest view (`get`) and drill down. Most problems reveal themselves by step 2 or 3.

> **Tip:** Before diving deep, always run `kubectl get events --sort-by=.lastTimestamp` to see a timeline of everything that happened recently across the cluster. This single command often points you straight to the problem.

## Pod Troubleshooting Flowchart

Pods are the most common thing that breaks. Here is every Pod failure state, what causes it, and how to diagnose it.

```
                    kubectl get pods
                         │
            ┌────────────┼──────────────┬──────────────────┐
            │            │              │                  │
         Pending    ImagePull      CrashLoop         Running
                    BackOff        BackOff           but not
            │            │              │             Ready
            │            │              │                  │
     ┌──────┴──────┐     │       ┌──────┴──────┐          │
     │ No node     │     │       │ App crash   │    Readiness
     │ fits (CPU/  │     │       │ OOMKilled   │    probe
     │ memory)     │     │       │ Bad cmd/args│    failing
     │ PVC not     │     │       │ Missing env │
     │ bound       │     │       │ or config   │
     │ Taint with  │     │       └─────────────┘
     │ no tolerate │     │
     └─────────────┘     │
                    Wrong image
                    No pull secret
                    Tag missing
```

### Pending Pods

A Pod stays Pending when the scheduler cannot place it on any node.

*Diagnose a Pending Pod*

```bash
kubectl get pods
# NAME                   READY   STATUS    RESTARTS   AGE
# web-7d4b8c6f5-abc12    0/1     Pending   0          3m

kubectl describe pod web-7d4b8c6f5-abc12
# ...
# Events:
#   Type     Reason            Age   From               Message
#   ----     ------            ----  ----               -------
#   Warning  FailedScheduling  3m    default-scheduler  0/3 nodes are available:
#            3 Insufficient cpu.
```

**Common causes and fixes:**

| Cause | Event Message | Fix |
|-------|--------------|-----|
| Not enough CPU/memory | `Insufficient cpu` or `Insufficient memory` | Lower resource requests, add nodes, or free up resources |
| nodeSelector mismatch | `didn't match Pod's node affinity/selector` | Fix the nodeSelector or label the node |
| Taint with no toleration | `had taint {key=value:NoSchedule}` | Add a toleration to the Pod spec |
| PVC not bound | `persistentvolumeclaim "data" not found` or `unbound` | Create the PV/PVC or fix the storageClass |

*Check node resources to find the bottleneck*

```bash
kubectl describe node node-1 | grep -A 5 "Allocated resources"
# Allocated resources:
#   Resource           Requests    Limits
#   --------           --------    ------
#   cpu                1900m (95%) 3000m (150%)
#   memory             1600Mi (82%) 2400Mi (123%)

# Node is nearly full — that's why the Pod can't schedule
```

*Check if PVC is the problem*

```bash
kubectl get pvc
# NAME    STATUS    VOLUME   CAPACITY   ACCESS MODES   STORAGECLASS   AGE
# data    Pending                                       standard       5m

kubectl describe pvc data
# Events:
#   Warning  ProvisioningFailed  no persistent volumes available for this claim
```

### ImagePullBackOff

The container runtime cannot pull the image.

*Diagnose ImagePullBackOff*

```bash
kubectl get pods
# NAME                   READY   STATUS             RESTARTS   AGE
# api-5f8b9c7d6-xyz99    0/1     ImagePullBackOff   0          2m

kubectl describe pod api-5f8b9c7d6-xyz99
# Events:
#   Type     Reason     Age   From     Message
#   ----     ------     ----  ----     -------
#   Normal   Pulling    2m    kubelet  Pulling image "myregistry.io/api:v2.1"
#   Warning  Failed     2m    kubelet  Failed to pull image "myregistry.io/api:v2.1":
#            rpc error: code = Unknown desc = Error response from daemon:
#            manifest for myregistry.io/api:v2.1 not found
#   Warning  Failed     2m    kubelet  Error: ImagePullBackOff
```

**Common causes and fixes:**

| Cause | What You'll See | Fix |
|-------|----------------|-----|
| Typo in image name | `repository does not exist` | Fix the image name in the spec |
| Tag doesn't exist | `manifest not found` | Use a valid tag, check your registry |
| Private registry, no auth | `unauthorized: authentication required` | Create an imagePullSecret |
| Registry unreachable | `dial tcp: lookup ... no such host` | Check network/DNS from the node |

*Fix a private registry auth issue*

```bash
# Create the pull secret
kubectl create secret docker-registry regcred \
  --docker-server=myregistry.io \
  --docker-username=myuser \
  --docker-password=mypass

# Reference it in the Pod spec
# spec:
#   imagePullSecrets:
#   - name: regcred
#   containers:
#   - name: api
#     image: myregistry.io/api:v2.1
```

### CrashLoopBackOff

The container starts, crashes, Kubernetes restarts it, it crashes again, repeat. The backoff delay increases each time (10s, 20s, 40s, ..., up to 5 minutes).

*Diagnose CrashLoopBackOff*

```bash
kubectl get pods
# NAME                   READY   STATUS             RESTARTS      AGE
# web-6c8f9d4e7-lmn01    0/1     CrashLoopBackOff   5 (45s ago)   4m

# Step 1: Check logs from the CURRENT crash attempt
kubectl logs web-6c8f9d4e7-lmn01
# Error: FATAL: database "mydb" does not exist

# Step 2: If the container has already restarted, check the PREVIOUS crash
kubectl logs web-6c8f9d4e7-lmn01 --previous
# Error: FATAL: database "mydb" does not exist
```

**Common causes and fixes:**

| Cause | Logs / Events | Fix |
|-------|--------------|-----|
| App crashes on start | Application error in logs | Fix the app code or configuration |
| OOMKilled | `OOMKilled` in describe output, exit code 137 | Increase memory limits or fix memory leak |
| Wrong command/args | `exec: "wrong-cmd": not found` | Fix `command` or `args` in the spec |
| Missing env var | `KeyError: 'DATABASE_URL'` | Add the env var via ConfigMap, Secret, or env |
| Missing config file | `FileNotFoundError: /etc/app/config.yaml` | Mount the ConfigMap/Secret as a volume |

*Identify OOMKilled*

```bash
kubectl describe pod web-6c8f9d4e7-lmn01
# Containers:
#   app:
#     State:          Waiting
#       Reason:       CrashLoopBackOff
#     Last State:     Terminated
#       Reason:       OOMKilled          ← the container exceeded memory limits
#       Exit Code:    137
#     Limits:
#       memory:  128Mi                   ← limit is too low
```

> **Gotcha:** Exit code 137 means the process was killed by SIGKILL (OOM killer). Exit code 1 means the application exited with an error. Exit code 0 means normal exit — but Kubernetes restarts it because it's supposed to keep running (CrashLoopBackOff with exit 0 means the process completed but the Pod's restartPolicy is Always).

### CreateContainerConfigError

The container cannot start because a referenced ConfigMap or Secret is missing.

```bash
kubectl get pods
# NAME                   READY   STATUS                       RESTARTS   AGE
# api-5f8b9c7d6-abc12    0/1     CreateContainerConfigError   0          1m

kubectl describe pod api-5f8b9c7d6-abc12
# Events:
#   Warning  Failed  1m  kubelet  Error: configmap "app-config" not found
```

Fix: create the missing ConfigMap or Secret in the **same namespace** as the Pod.

```bash
kubectl get configmaps
# No resources found in default namespace.

# Create the missing ConfigMap
kubectl create configmap app-config --from-literal=DB_HOST=postgres
```

### Running but Not Ready

The Pod is running, but its readiness probe is failing, so it is not added to Service endpoints.

```bash
kubectl get pods
# NAME                   READY   STATUS    RESTARTS   AGE
# web-7d4b8c6f5-abc12    0/1     Running   0          3m
#                         ^^^
#                         0 of 1 containers ready

kubectl describe pod web-7d4b8c6f5-abc12
# Conditions:
#   Type              Status
#   Initialized       True
#   Ready             False        ← not ready
#   ContainersReady   False
#   PodScheduled      True
# Events:
#   Warning  Unhealthy  30s (x10 over 3m)  kubelet  Readiness probe failed:
#            Get "http://10.1.0.15:8080/healthz": dial tcp 10.1.0.15:8080:
#            connect: connection refused
```

Fix: the application is not listening on the port the probe expects. Check the probe path, port, and the application's startup behavior. Consider adding a startupProbe if the app needs time to initialize.

### Evicted Pods

When a node runs out of memory or disk, the kubelet evicts Pods to protect the node.

```bash
kubectl get pods
# NAME                   READY   STATUS    RESTARTS   AGE
# web-7d4b8c6f5-abc12    0/1     Evicted   0          30m

kubectl describe pod web-7d4b8c6f5-abc12
# Status:  Failed
# Reason:  Evicted
# Message: The node was low on resource: memory.

# Check the node
kubectl describe node node-1 | grep -A 3 "Conditions"
# Conditions:
#   Type               Status   Reason
#   MemoryPressure     True     KubeletHasInsufficientMemory
#   DiskPressure       False    KubeletHasNoDiskPressure
```

Fix: add resource limits to Pods so they can't consume unbounded memory, add more nodes, or clean up disk space.

```bash
# Clean up evicted Pods (they linger in Failed status)
kubectl delete pods --field-selector=status.phase=Failed
```

## Debugging Commands Reference

These are the commands you'll use in every troubleshooting session.

### kubectl get — Status Overview

```bash
# Quick Pod status
kubectl get pods
kubectl get pods -o wide         # includes Node and IP
kubectl get pods -A              # all namespaces

# Watch for changes in real time
kubectl get pods -w

# Filter by status
kubectl get pods --field-selector=status.phase!=Running
```

### kubectl describe — Events and Conditions

```bash
# The Events section is the most valuable part
kubectl describe pod <name>
kubectl describe svc <name>
kubectl describe node <name>
kubectl describe ingress <name>
```

### kubectl logs — Application Logs

```bash
# Current container logs
kubectl logs <pod-name>

# Logs from a specific container in a multi-container Pod
kubectl logs <pod-name> -c <container-name>

# Logs from the previous (crashed) instance
kubectl logs <pod-name> --previous

# Follow logs in real time
kubectl logs <pod-name> -f

# Logs from all Pods matching a label
kubectl logs -l app=web --all-containers

# Last 50 lines only
kubectl logs <pod-name> --tail=50

# Logs from the last hour
kubectl logs <pod-name> --since=1h
```

> **Tip:** When a container is in CrashLoopBackOff, `kubectl logs --previous` is essential. The current container might not have any logs yet (it just restarted), but the previous instance's crash output is still available.

### kubectl exec — Shell Into a Container

```bash
# Open a shell
kubectl exec -it <pod-name> -- /bin/sh

# Run a single command
kubectl exec <pod-name> -- cat /etc/config/app.yaml

# In a multi-container Pod, specify the container
kubectl exec -it <pod-name> -c <container-name> -- /bin/bash

# Check if the app is listening on the expected port
kubectl exec <pod-name> -- netstat -tlnp
# Proto  Local Address    State
# tcp    0.0.0.0:8080     LISTEN

# Check DNS resolution from inside the Pod
kubectl exec <pod-name> -- nslookup kubernetes
# Server:     10.96.0.10
# Name:       kubernetes.default.svc.cluster.local
# Address:    10.96.0.1
```

### kubectl debug — Ephemeral Debug Containers

Some images (distroless, scratch-based) have no shell. Use `kubectl debug` to attach a debug container to the Pod:

```bash
# Attach a debug container to a running Pod
kubectl debug -it <pod-name> --image=busybox --target=<container-name>
# Targeting container "app". If you don't see processes, try --target.
# / # ps aux
# PID   USER     COMMAND
#   1   root     /app
#  12   root     sh

# Create a copy of the Pod with a debug container
kubectl debug <pod-name> -it --image=busybox --copy-to=debug-pod

# Debug a node directly
kubectl debug node/node-1 -it --image=busybox
# (drops you into a shell on the node, with the host filesystem at /host)
```

> **Gotcha:** `kubectl debug` with `--target` shares the process namespace with the target container, so you can see its processes. Without `--target`, you get an isolated container. The `--target` flag requires the EphemeralContainers feature (enabled by default since Kubernetes 1.25).

### kubectl get events — Cluster Timeline

```bash
# All recent events, sorted by time
kubectl get events --sort-by=.lastTimestamp

# Events for a specific namespace
kubectl get events -n production --sort-by=.lastTimestamp

# Only Warning events
kubectl get events --field-selector type=Warning

# Watch events in real time
kubectl get events -w

# Sample output
kubectl get events --sort-by=.lastTimestamp
# LAST SEEN   TYPE      REASON              OBJECT                MESSAGE
# 30s         Warning   FailedScheduling    pod/web-abc12         0/3 nodes: insufficient cpu
# 1m          Warning   Unhealthy           pod/api-xyz99         Readiness probe failed
# 2m          Normal    Pulled              pod/db-lmn01          Successfully pulled image
# 3m          Warning   FailedMount         pod/app-def34         MountVolume.SetUp failed
```

### kubectl top — Resource Usage

Requires the Metrics Server to be installed.

```bash
kubectl top pods
# NAME                   CPU(cores)   MEMORY(bytes)
# web-7d4b8c6f5-abc12    15m          64Mi
# api-5f8b9c7d6-xyz99    250m         512Mi      ← using a lot of CPU and memory
# db-8e7f6a5b4-lmn01     50m          256Mi

kubectl top pods --sort-by=memory    # sort by memory usage
kubectl top pods --sort-by=cpu       # sort by CPU usage

kubectl top nodes
# NAME     CPU(cores)   CPU%   MEMORY(bytes)   MEMORY%
# node-1   950m         47%    2100Mi          68%
# node-2   400m         20%    1200Mi          39%
# node-3   1800m        90%    3500Mi          90%     ← this node is under pressure
```

## Service Troubleshooting

The most common Service problem: traffic is not reaching your Pods.

### Step-by-Step: Service Not Working

```
┌──────────────────────────────────────────────────────────────┐
│                SERVICE DEBUGGING FLOW                          │
│                                                               │
│  1. Check endpoints    kubectl get endpoints <svc>            │
│         │                                                     │
│         ├─── Empty?  → Selector doesn't match Pod labels      │
│         │              or Pods aren't Ready                    │
│         │                                                     │
│         └─── Has IPs → Service can reach Pods.                │
│                        Problem is elsewhere.                  │
│                                                               │
│  2. Check selectors    kubectl get svc <svc> -o yaml          │
│         │              kubectl get pods --show-labels          │
│         │                                                     │
│  3. Check Pod status   kubectl get pods                       │
│         │              Are they Running AND Ready?             │
│         │                                                     │
│  4. Test from inside   kubectl run debug --image=busybox      │
│                        --rm -it -- wget -qO- http://<svc>     │
└──────────────────────────────────────────────────────────────┘
```

*Step 1: Check endpoints*

```bash
kubectl get endpoints web
# NAME   ENDPOINTS   AGE
# web    <none>      5m
#        ^^^^^^^^
#        No endpoints — no Pods match the Service selector
```

*Step 2: Compare Service selector with Pod labels*

```bash
# What selector does the Service use?
kubectl get svc web -o jsonpath='{.spec.selector}'
# {"app":"web"}

# What labels do the Pods have?
kubectl get pods --show-labels
# NAME                    READY   STATUS    LABELS
# web-7d4b8c6f5-abc12     1/1     Running   app=frontend,pod-template-hash=7d4b8c6f5
#                                            ^^^^^^^^^^^^
#                                            Label is "app=frontend", not "app=web" — MISMATCH
```

*Step 3: Fix the mismatch*

Either fix the Service selector or the Pod labels so they match.

*Step 4: Test connectivity from inside the cluster*

```bash
# Spin up a temporary Pod and test
kubectl run debug --image=busybox --rm -it --restart=Never -- wget -qO- http://web
# <html>Welcome to nginx!</html>

# Or test with curl
kubectl run debug --image=curlimages/curl --rm -it --restart=Never -- curl -s http://web
# <html>Welcome to nginx!</html>
```

### DNS Debugging

If the Service has endpoints but Pods can't reach it by name, DNS is the problem.

```bash
# Test DNS resolution from inside a Pod
kubectl run dns-test --image=busybox --rm -it --restart=Never -- nslookup web
# Server:    10.96.0.10
# Address:   10.96.0.10:53
#
# Name:      web.default.svc.cluster.local
# Address:   10.96.50.100

# If DNS fails:
kubectl run dns-test --image=busybox --rm -it --restart=Never -- nslookup web
# Server:    10.96.0.10
# Address:   10.96.0.10:53
# ** server can't find web.default.svc.cluster.local: NXDOMAIN

# Check if CoreDNS is running
kubectl get pods -n kube-system -l k8s-app=kube-dns
# NAME                       READY   STATUS    RESTARTS   AGE
# coredns-5d78c9869d-abc12   1/1     Running   0          24h
# coredns-5d78c9869d-def34   1/1     Running   0          24h

# Check CoreDNS logs
kubectl logs -n kube-system -l k8s-app=kube-dns
```

### Wrong Port Configuration

The three-port confusion causes many Service issues.

```bash
# The Service definition
kubectl get svc web -o yaml
# spec:
#   ports:
#   - port: 80          ← clients connect to Service:80
#     targetPort: 3000   ← traffic forwards to Pod:3000
#     protocol: TCP

# But the container is listening on 8080, not 3000
kubectl exec deploy/web -- ss -tlnp
# State    Local Address:Port
# LISTEN   0.0.0.0:8080          ← app listens on 8080, but targetPort says 3000
```

Fix: change `targetPort` to 8080, or reconfigure the app to listen on 3000.

> **Gotcha:** The `containerPort` field in the Pod spec is purely informational. It does NOT control what port the app listens on. If your app listens on 8080, the Service `targetPort` must be 8080 regardless of what `containerPort` says.

## Ingress Troubleshooting

### No ADDRESS Assigned

```bash
kubectl get ingress
# NAME          CLASS   HOSTS         ADDRESS   PORTS   AGE
# app-ingress   nginx   myapp.local             80      5m
#                                     ^^^^^^^
#                                     Empty — no address assigned
```

This usually means the Ingress Controller is not running.

```bash
# Check for the Ingress Controller
kubectl get pods -n ingress-nginx
# No resources found in ingress-nginx namespace.  ← not installed

# Or the controller is crashing
kubectl get pods -n ingress-nginx
# NAME                                        READY   STATUS             RESTARTS
# ingress-nginx-controller-7d4b8c6f5-abc12    0/1     CrashLoopBackOff   5

# Check controller logs
kubectl logs -n ingress-nginx deploy/ingress-nginx-controller
```

### 404, 502, or 503 Errors

```bash
# 404 — the path doesn't match any rule
# Check the Ingress rules
kubectl describe ingress app-ingress
# Rules:
#   Host           Path  Backends
#   ----           ----  --------
#   myapp.local
#                  /api   api:80 (10.1.0.20:8080,10.1.0.21:8080)
#                  /      web:80 (<none>)
#                         ^^^^^^
#                         No endpoints for "web" Service — will produce 503

# 502 — backend Service exists but the Pod isn't responding
# Check the backend Pods
kubectl get pods -l app=web
# NAME                   READY   STATUS             RESTARTS
# web-7d4b8c6f5-abc12    0/1     CrashLoopBackOff   8

# 503 — backend Service has no endpoints
kubectl get endpoints web
# NAME   ENDPOINTS   AGE
# web    <none>      10m
```

### TLS Certificate Issues

```bash
# Check if the TLS Secret exists and is valid
kubectl get secret myapp-tls
# NAME         TYPE                DATA   AGE
# myapp-tls    kubernetes.io/tls   2      30d

kubectl describe secret myapp-tls
# Type:  kubernetes.io/tls
# Data
# ====
# tls.crt:  1164 bytes
# tls.key:  1704 bytes

# Verify the cert details
kubectl get secret myapp-tls -o jsonpath='{.data.tls\.crt}' | base64 -d | openssl x509 -text -noout
# Validity
#   Not Before: Jan  1 00:00:00 2025 GMT
#   Not After : Jan  1 00:00:00 2026 GMT    ← check if expired
# Subject: CN = myapp.local                  ← check hostname matches
```

> **Tip:** If you're using cert-manager, check the Certificate resource status: `kubectl get certificate` and `kubectl describe certificate <name>`. Look at the `Ready` condition and events.

## Node Troubleshooting

### NotReady Nodes

```bash
kubectl get nodes
# NAME     STATUS     ROLES           AGE   VERSION
# node-1   Ready      control-plane   30d   v1.29.0
# node-2   Ready      <none>          30d   v1.29.0
# node-3   NotReady   <none>          30d   v1.29.0
#          ^^^^^^^^
#          This node has a problem

kubectl describe node node-3
# Conditions:
#   Type                 Status  Reason
#   ----                 ------  ------
#   MemoryPressure       False   KubeletHasSufficientMemory
#   DiskPressure         False   KubeletHasNoDiskPressure
#   PIDPressure          False   KubeletHasSufficientPID
#   Ready                False   KubeletNotReady
#                                ^^^^^^^^^^^^^^^^
#                                kubelet is not responding
```

**Common causes:**

| Condition | Meaning | Fix |
|-----------|---------|-----|
| `Ready = False` | kubelet is down or cannot communicate with API Server | SSH to node, check `systemctl status kubelet` |
| `MemoryPressure = True` | Node is running low on memory | Evict Pods, add memory, set resource limits |
| `DiskPressure = True` | Node disk is nearly full | Clean up images/logs, expand disk |
| `PIDPressure = True` | Too many processes on the node | Investigate runaway processes |

*Check kubelet on the node (requires SSH access)*

```bash
# SSH to the node, then:
systemctl status kubelet
# ● kubelet.service - kubelet
#    Loaded: loaded
#    Active: inactive (dead)    ← kubelet is not running

systemctl restart kubelet
journalctl -u kubelet --no-pager -n 50
# Look for errors in the kubelet logs
```

### Cordoning and Draining Nodes

When a node has problems, safely move workloads off before investigating.

```bash
# Cordon — mark node as unschedulable (no new Pods, existing Pods stay)
kubectl cordon node-3
# node/node-3 cordoned

kubectl get nodes
# NAME     STATUS                     ROLES           AGE
# node-3   Ready,SchedulingDisabled   <none>          30d

# Drain — evict all Pods from the node (respects PodDisruptionBudgets)
kubectl drain node-3 --ignore-daemonsets --delete-emptydir-data
# evicting pod default/web-7d4b8c6f5-abc12
# evicting pod default/api-5f8b9c7d6-xyz99
# node/node-3 drained

# After fixing the node, uncordon it
kubectl uncordon node-3
# node/node-3 uncordoned
```

> **Gotcha:** `kubectl drain` will fail if there are Pods not managed by a controller (standalone Pods). Use `--force` to evict them, but they won't be rescheduled. Always use Deployments/ReplicaSets so Pods get recreated on other nodes after a drain.

## Deployment Troubleshooting

### Rollout Stuck

```bash
kubectl rollout status deployment/web
# Waiting for deployment "web" rollout to finish: 1 out of 3 new replicas
# have been updated...
# (hangs here)

# Check what's happening
kubectl get rs
# NAME               DESIRED   CURRENT   READY   AGE
# web-7d4b8c6f5      3         3         3       2h     ← old ReplicaSet (healthy)
# web-9a8b7c6d5      1         1         0       5m     ← new ReplicaSet (stuck)

kubectl get pods
# NAME                   READY   STATUS             RESTARTS   AGE
# web-7d4b8c6f5-abc12    1/1     Running             0          2h
# web-7d4b8c6f5-def34    1/1     Running             0          2h
# web-7d4b8c6f5-ghi56    1/1     Running             0          2h
# web-9a8b7c6d5-jkl78    0/1     ImagePullBackOff    0          5m
#                                ^^^^^^^^^^^^^^^^
#                                New Pod can't pull image — rollout is stuck
```

### Rollback a Bad Deployment

```bash
# Check rollout history
kubectl rollout history deployment/web
# REVISION  CHANGE-CAUSE
# 1         <none>
# 2         <none>

# Rollback to previous version
kubectl rollout undo deployment/web
# deployment.apps/web rolled back

# Rollback to a specific revision
kubectl rollout undo deployment/web --to-revision=1

# Verify
kubectl rollout status deployment/web
# deployment "web" successfully rolled out
```

### progressDeadlineSeconds

By default, a Deployment waits 600 seconds (10 minutes) for progress. If no new Pods become ready in that time, the rollout is marked as failed.

```bash
kubectl describe deployment web
# Conditions:
#   Type           Status  Reason
#   Available      True    MinimumReplicasAvailable
#   Progressing    False   ProgressDeadlineExceeded
#                          ^^^^^^^^^^^^^^^^^^^^^^^^^^
#                          Rollout timed out
```

The Deployment doesn't automatically roll back. You must manually undo it or fix the issue.

## Networking Troubleshooting

### The Three Layers of Network Access

```
┌─────────────────────────────────────────────────────────────┐
│              NETWORK TROUBLESHOOTING LAYERS                   │
│                                                              │
│  Layer 1: Pod-to-Pod                                         │
│    Can Pods reach each other by IP?                          │
│    → Check CNI plugin (Calico, Cilium, Flannel)              │
│                                                              │
│  Layer 2: Pod-to-Service                                     │
│    Can Pods reach Services by DNS name?                      │
│    → Check CoreDNS, endpoints, kube-proxy                    │
│                                                              │
│  Layer 3: External-to-Service                                │
│    Can outside traffic reach the cluster?                    │
│    → Check NodePort, LoadBalancer, Ingress                   │
└─────────────────────────────────────────────────────────────┘
```

### Debug with a Temporary Network Pod

The `nicolaka/netshoot` image has every networking tool you'll need:

```bash
# Launch a debug Pod with full networking tools
kubectl run tmp --image=nicolaka/netshoot --rm -it --restart=Never -- bash

# Inside the debug Pod:

# Test Pod-to-Pod connectivity
ping 10.1.0.15
# PING 10.1.0.15: 56 data bytes
# 64 bytes from 10.1.0.15: seq=0 ttl=62 time=0.5 ms

# Test Service DNS
nslookup web.default.svc.cluster.local
# Server:    10.96.0.10
# Address:   10.96.0.10#53
# Name:      web.default.svc.cluster.local
# Address:   10.96.50.100

# Test HTTP to a Service
curl -s http://web.default.svc.cluster.local
# <html>Welcome to nginx!</html>

# Test specific port
nc -zv web 80
# web (10.96.50.100:80) open

# Trace the network path
traceroute 10.1.0.15

# Check DNS resolver config
cat /etc/resolv.conf
# nameserver 10.96.0.10
# search default.svc.cluster.local svc.cluster.local cluster.local
```

### NetworkPolicy Blocking Traffic

If Pods can't reach each other but the network layer is healthy, a NetworkPolicy might be blocking traffic.

```bash
# Check if any NetworkPolicies exist
kubectl get networkpolicies
# NAME           POD-SELECTOR   AGE
# deny-all       <none>         1h
# allow-web      app=web        1h

kubectl describe networkpolicy deny-all
# Spec:
#   PodSelector:     <none> (Coverage: all pods in the namespace)
#   Allowing ingress traffic: <none> (Selected pods are isolated for ingress)
#   Allowing egress traffic: <none> (Selected pods are isolated for egress)
#   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
#   This policy blocks ALL traffic to ALL Pods in the namespace
```

> **Tip:** NetworkPolicies are additive — if ANY policy selects a Pod, only explicitly allowed traffic gets through. A `deny-all` policy plus an `allow-web` policy means only traffic matching `allow-web` reaches the selected Pods. If you can't figure out why traffic is blocked, list ALL policies and check which ones select your Pod.

## Resource and Quota Issues

### Pod Can't Schedule: Quota Exceeded

```bash
kubectl get pods
# NAME                   READY   STATUS    RESTARTS   AGE
# api-5f8b9c7d6-abc12    0/1     Pending   0          2m

kubectl describe pod api-5f8b9c7d6-abc12
# Events:
#   Warning  FailedCreate  2m  replicaset-controller  Error creating: pods "api-..."
#            is forbidden: exceeded quota: compute-quota, requested: cpu=500m,
#            used: cpu=1500m, limited: cpu=2000m

kubectl describe quota compute-quota
# Name:         compute-quota
# Namespace:    default
# Resource      Used    Hard
# --------      ----    ----
# cpu           1500m   2000m     ← only 500m left, but Pod requests more
# memory        2Gi     4Gi
# pods          5       10
```

Fix: reduce the Pod's resource requests, increase the quota, or delete unused Pods.

### Node Allocatable vs Allocated

```bash
kubectl describe node node-1
# Capacity:
#   cpu:                4
#   memory:             8Gi
# Allocatable:
#   cpu:                3800m         ← usable by Pods (reserves some for system)
#   memory:             7600Mi
# Allocated resources:
#   Resource           Requests      Limits
#   --------           --------      ------
#   cpu                3200m (84%)   6000m (157%)
#   memory             5120Mi (67%)  8192Mi (107%)
#                      ^^^^^^^^^^^
#                      84% of CPU is already requested — not much room
```

> **Gotcha:** Kubernetes schedules based on **requests**, not limits. If all node CPU requests add up to 3800m, no more Pods can schedule even if actual usage is only 20%. Set requests to what the app actually needs, not worst-case limits.

## Common Mistakes Checklist

When everything looks right but something isn't working, check this list:

### 1. Label Selector Mismatch

The number one cause of "Service not reaching Pods" and "Deployment not managing Pods."

```bash
# Service selector
kubectl get svc web -o jsonpath='{.spec.selector}' | jq .
# { "app": "web" }

# Deployment Pod template labels
kubectl get deploy web -o jsonpath='{.spec.template.metadata.labels}' | jq .
# { "app": "web", "version": "v2" }

# Actual Pod labels
kubectl get pods --show-labels
# NAME                   LABELS
# web-7d4b8c6f5-abc12    app=web,version=v2,pod-template-hash=7d4b8c6f5
```

All three must agree. The Service selector must be a **subset** of the Pod labels.

### 2. Wrong Port Numbers

```yaml
# Service
spec:
  ports:
  - port: 80          # ← what clients connect to
    targetPort: 8080   # ← must match what the container listens on
---
# Pod
spec:
  containers:
  - ports:
    - containerPort: 8080   # ← informational, but should match reality
```

If `targetPort` doesn't match the actual port the app listens on, traffic will be sent to a port nothing is listening on.

### 3. Missing Namespace Flag

```bash
# This shows Pods in the "default" namespace
kubectl get pods
# No resources found in default namespace.

# Your Pods are in another namespace
kubectl get pods -n production
# NAME                   READY   STATUS    RESTARTS   AGE
# web-7d4b8c6f5-abc12    1/1     Running   0          2h
```

> **Tip:** Set your default namespace to avoid this: `kubectl config set-context --current --namespace=production`. Or use `kubens` for quick namespace switching.

### 4. ConfigMap/Secret Not in Same Namespace

ConfigMaps and Secrets are namespaced. A Pod in `production` cannot reference a ConfigMap in `default`.

```bash
# Pod is in "production" namespace
kubectl get pods -n production
# api-5f8b9c7d6-abc12    0/1    CreateContainerConfigError

kubectl describe pod -n production api-5f8b9c7d6-abc12
# Warning  Failed  configmap "app-config" not found

# The ConfigMap exists, but in the wrong namespace
kubectl get configmap app-config -n default
# NAME         DATA   AGE
# app-config   3      1h

# Fix: create it in the right namespace
kubectl get configmap app-config -n default -o yaml | \
  sed 's/namespace: default/namespace: production/' | \
  kubectl apply -f -
```

### 5. PVC Access Mode Mismatch

```bash
kubectl get pvc
# NAME    STATUS   VOLUME   CAPACITY   ACCESS MODES   STORAGECLASS
# data    Bound    pv-001   10Gi       RWO            standard

# RWO = ReadWriteOnce — only one node can mount it
# If you schedule a second Pod on a DIFFERENT node that uses this PVC:
kubectl describe pod db-replica-xyz
# Events:
#   Warning  FailedAttachVolume  Multi-Attach error for volume "pv-001":
#            volume is already exclusively attached to one node
```

Fix: use `ReadWriteMany` (RWX) if multiple Pods on different nodes need the volume, or ensure all Pods using RWO volumes schedule on the same node.

## Hands-On: Break Things and Fix Them

The best way to learn troubleshooting is to intentionally break things and diagnose them.

### Exercise 1: Wrong Image Name

*Deploy a Pod with a bad image*

```bash
kubectl create deployment broken-image --image=nginx:doesnotexist
```

*Diagnose*

```bash
kubectl get pods
# NAME                            READY   STATUS             RESTARTS   AGE
# broken-image-6b8c9d7e5-abc12   0/1     ImagePullBackOff   0          1m

kubectl describe pod broken-image-6b8c9d7e5-abc12
# Events:
#   Warning  Failed   manifest for nginx:doesnotexist not found

# Fix
kubectl set image deployment/broken-image nginx=nginx:1.25

# Verify
kubectl get pods
# NAME                            READY   STATUS    RESTARTS   AGE
# broken-image-7f9a8b6c4-def34   1/1     Running   0          30s

# Clean up
kubectl delete deployment broken-image
```

### Exercise 2: Service with Wrong Selector

*Deploy an app and a mismatched Service*

```bash
kubectl create deployment myapp --image=nginx:1.25
kubectl expose deployment myapp --port=80 --target-port=80

# Now break the selector
kubectl patch svc myapp -p '{"spec":{"selector":{"app":"wrong-name"}}}'
```

*Diagnose*

```bash
kubectl get endpoints myapp
# NAME    ENDPOINTS   AGE
# myapp   <none>      2m      ← no endpoints

kubectl get svc myapp -o jsonpath='{.spec.selector}'
# {"app":"wrong-name"}

kubectl get pods --show-labels
# NAME                     LABELS
# myapp-7d4b8c6f5-abc12    app=myapp,...    ← label is "app=myapp"

# Fix — selector should be "app=myapp"
kubectl patch svc myapp -p '{"spec":{"selector":{"app":"myapp"}}}'

kubectl get endpoints myapp
# NAME    ENDPOINTS        AGE
# myapp   10.1.0.15:80     3m      ← now has an endpoint

# Clean up
kubectl delete deployment myapp
kubectl delete svc myapp
```

### Exercise 3: Pod with Excessive Resource Requests

*Request more resources than any node has*

```bash
kubectl run greedy --image=nginx:1.25 --restart=Never \
  --overrides='{
    "spec": {
      "containers": [{
        "name": "greedy",
        "image": "nginx:1.25",
        "resources": {
          "requests": {
            "cpu": "100",
            "memory": "500Gi"
          }
        }
      }]
    }
  }'
```

*Diagnose*

```bash
kubectl get pods
# NAME     READY   STATUS    RESTARTS   AGE
# greedy   0/1     Pending   0          2m

kubectl describe pod greedy
# Events:
#   Warning  FailedScheduling  0/3 nodes are available:
#            3 Insufficient cpu, 3 Insufficient memory.

# Fix — delete and recreate with reasonable requests
kubectl delete pod greedy
kubectl run greedy --image=nginx:1.25 --restart=Never

# Verify
kubectl get pods
# NAME     READY   STATUS    RESTARTS   AGE
# greedy   1/1     Running   0          15s

# Clean up
kubectl delete pod greedy
```

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

## Module 14 Summary

- **Systematic approach:** always follow the same flow — check status, describe for events, check logs, check networking, check nodes
- **Pending Pods** mean the scheduler can't place them — check resource requests, node selectors, tolerations, and PVCs
- **ImagePullBackOff** means the image can't be pulled — check the image name, tag, registry auth, and network connectivity
- **CrashLoopBackOff** means the container keeps crashing — check logs (`--previous`), look for OOMKilled (exit code 137), verify command/args and environment
- **CreateContainerConfigError** means a referenced ConfigMap or Secret doesn't exist in the Pod's namespace
- **Running but not Ready** means the readiness probe is failing — check probe config, path, port, and application startup time
- **Evicted Pods** indicate node pressure — set resource limits and monitor node health
- **Service with no endpoints** is almost always a label selector mismatch — compare `svc.spec.selector` with Pod labels
- **DNS issues** point to CoreDNS — verify with `nslookup` from inside a Pod, check CoreDNS Pod status
- **Ingress problems** often stem from the controller not running, backend Services with no endpoints, or TLS misconfig
- **NotReady nodes** need kubelet investigation — check `systemctl status kubelet` and `journalctl -u kubelet` on the node
- **Stuck rollouts** don't auto-rollback — use `kubectl rollout undo` to revert
- **NetworkPolicies** are additive: once any policy selects a Pod, only explicitly allowed traffic is permitted
- **Resource quotas** block Pod creation when limits are reached — check with `kubectl describe quota`
- **Use `kubectl debug`** for distroless images that have no shell
- **The common mistakes checklist:** label mismatch, wrong port, missing namespace, ConfigMap in wrong namespace, PVC access mode
