## The Pod Networking Model

Every Pod in Kubernetes gets its own IP address. This is a fundamental design decision:

- Pods can communicate with any other Pod using its IP — no NAT
- Containers within a Pod share the same network namespace (same IP, communicate via localhost)
- Pods on different nodes can communicate without special configuration

```
┌──────────────────────────────────────────────────────────────┐
│                        CLUSTER                               │
│                                                              │
│   ┌─────────────────────┐      ┌─────────────────────┐      │
│   │      NODE 1          │      │      NODE 2          │      │
│   │                      │      │                      │      │
│   │  ┌────────────────┐  │      │  ┌────────────────┐  │      │
│   │  │ Pod A           │  │      │  │ Pod C           │  │      │
│   │  │ IP: 10.1.0.5   │──┼──────┼──│ IP: 10.1.1.8   │  │      │
│   │  └────────────────┘  │      │  └────────────────┘  │      │
│   │  ┌────────────────┐  │      │  ┌────────────────┐  │      │
│   │  │ Pod B           │  │      │  │ Pod D           │  │      │
│   │  │ IP: 10.1.0.6   │──┼──────┼──│ IP: 10.1.1.9   │  │      │
│   │  └────────────────┘  │      │  └────────────────┘  │      │
│   └─────────────────────┘      └─────────────────────┘      │
│                                                              │
│   Any Pod can reach any other Pod by IP — no NAT needed      │
└──────────────────────────────────────────────────────────────┘
```

> **The problem:** Pod IPs are ephemeral. When a Pod dies and is recreated, it gets a new IP. You can't hardcode Pod IPs. This is why **Services** exist.

## Services

A Service provides a **stable network endpoint** for a set of Pods. It has a fixed IP (ClusterIP) and DNS name that doesn't change, even as Pods behind it come and go.

### How Services Find Pods

Services use **label selectors** to find their backend Pods. Any Pod with matching labels is added to the Service's endpoint list:

```yaml
# The Service
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  selector:
    app: web          # ← finds Pods with this label
  ports:
  - port: 80          # Service listens on port 80
    targetPort: 8080   # forwards to Pod port 8080
```

```yaml
# The Pods (via Deployment)
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
        app: web      # ← matches the Service selector
    spec:
      containers:
      - name: app
        image: myapp:v1
        ports:
        - containerPort: 8080
```

```
              Service "web"
              ClusterIP: 10.96.50.100
              Port: 80
                    │
         ┌──────────┼──────────┐
         │          │          │
    ┌────▼────┐ ┌───▼────┐ ┌──▼──────┐
    │ Pod     │ │ Pod    │ │ Pod     │
    │ :8080   │ │ :8080  │ │ :8080   │
    │ app=web │ │ app=web│ │ app=web │
    └─────────┘ └────────┘ └─────────┘
```

*See it in action*

```bash
# Create a Deployment and Service
kubectl create deployment web --image=nginx:1.25 --replicas=3
kubectl expose deployment web --port=80 --target-port=80

# The Service has a stable ClusterIP
kubectl get svc web
# NAME   TYPE        CLUSTER-IP     EXTERNAL-IP   PORT(S)   AGE
# web    ClusterIP   10.96.50.100   <none>        80/TCP    5s

# See which Pods are backing the Service
kubectl get endpoints web
# NAME   ENDPOINTS                                    AGE
# web    10.1.0.15:80,10.1.0.16:80,10.1.0.17:80      5s

# Delete a Pod — the endpoint list updates automatically
kubectl delete pod $(kubectl get pods -l app=web -o name | head -1)
kubectl get endpoints web
# ENDPOINTS still shows 3 IPs (the replacement Pod's IP is already there)
```

### Port Mapping

The three port fields confuse everyone. Here's what they mean:

```yaml
spec:
  ports:
  - port: 80          # ← ClusterIP:80 (what other Pods connect to)
    targetPort: 8080   # ← Pod:8080 (where traffic is forwarded)
    nodePort: 30080    # ← Node:30080 (only for NodePort/LoadBalancer)
    protocol: TCP      # ← TCP (default) or UDP
```

```
Client → Node:30080 (nodePort) → Service:80 (port) → Pod:8080 (targetPort)
```

> **Tip:** `targetPort` can be a named port. If your container declares `containerPort` with a name, the Service can reference it by name instead of number. This makes port changes easier.

## Service Types

### ClusterIP (Default)

Internal-only. The Service gets a virtual IP reachable only from within the cluster.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: api
spec:
  type: ClusterIP      # default — you can omit this
  selector:
    app: api
  ports:
  - port: 80
    targetPort: 3000
```

```bash
# Only reachable from inside the cluster
kubectl run test --image=busybox --rm -it -- wget -qO- http://api:80
# <response from api Pod>
```

Use for: internal services, databases, backends that don't need external access.

### NodePort

Exposes the Service on a static port (30000-32767) on **every node** in the cluster. External clients can reach `<any-node-ip>:<nodePort>`.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  type: NodePort
  selector:
    app: web
  ports:
  - port: 80
    targetPort: 80
    nodePort: 30080     # optional — auto-assigned if omitted
```

```bash
kubectl get svc web
# NAME   TYPE       CLUSTER-IP     EXTERNAL-IP   PORT(S)        AGE
# web    NodePort   10.96.50.100   <none>        80:30080/TCP   5s

# Access from outside the cluster
curl http://localhost:30080     # on Docker Desktop
curl http://$(minikube ip):30080  # on minikube
```

Use for: development, testing, simple external access without a load balancer.

> **Gotcha:** NodePort range is 30000-32767. You can't use port 80 or 443 as a NodePort. For proper external access, use Ingress (Module 7) or LoadBalancer.

### LoadBalancer

Provisions an **external load balancer** (on cloud providers like AWS, GCP, Azure). The cloud creates an ELB/NLB/ALB that points to the NodePorts on your nodes.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  type: LoadBalancer
  selector:
    app: web
  ports:
  - port: 80
    targetPort: 80
```

```bash
kubectl get svc web
# NAME   TYPE           CLUSTER-IP     EXTERNAL-IP      PORT(S)        AGE
# web    LoadBalancer   10.96.50.100   203.0.113.50     80:31234/TCP   2m

# On cloud: curl http://203.0.113.50
# On minikube: run "minikube tunnel" in another terminal, then curl the EXTERNAL-IP
# On Docker Desktop: EXTERNAL-IP will be "localhost"
```

Use for: production services on cloud, when you need a real external IP.

> **Warning:** Each LoadBalancer Service creates a separate cloud load balancer ($$$). For multiple services, use Ingress with a single LoadBalancer instead of one per service.

### ExternalName

DNS alias. No proxying, no ClusterIP — just returns a CNAME record.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: database
spec:
  type: ExternalName
  externalName: db.example.com
```

```bash
# Inside the cluster:
# nslookup database.default.svc.cluster.local
# → CNAME db.example.com
```

Use for: pointing to external databases or services outside the cluster without hardcoding hostnames in your app config.

## Service Type Comparison

| Type | Access From | IP | Use Case |
|------|------------|-----|----------|
| ClusterIP | Inside cluster only | Virtual IP | Internal services, databases |
| NodePort | Outside via `node:30000-32767` | Virtual IP + node port | Dev/testing, simple external access |
| LoadBalancer | Outside via cloud LB | Virtual IP + external IP | Production external services |
| ExternalName | Inside cluster (DNS) | None — CNAME only | Aliasing external services |

## How kube-proxy Works

kube-proxy runs on every node and implements Service routing. When you access a Service's ClusterIP, kube-proxy's rules redirect the traffic to a healthy backend Pod.

### iptables Mode (Default)

kube-proxy programs iptables rules that DNAT (Destination NAT) traffic from the Service IP to Pod IPs:

```bash
# Conceptually, for Service 10.96.50.100 → Pods [10.1.0.15, 10.1.0.16, 10.1.0.17]:
# iptables creates rules like:
#   if dest == 10.96.50.100:80 → randomly pick:
#     → DNAT to 10.1.0.15:80 (33% probability)
#     → DNAT to 10.1.0.16:80 (33% probability)
#     → DNAT to 10.1.0.17:80 (33% probability)
```

The load balancing is random (iptables probability-based). There's no round-robin, no least-connections.

### IPVS Mode

For large clusters (thousands of Services), IPVS is more efficient:

```bash
# Check which mode your cluster uses
kubectl get configmap kube-proxy -n kube-system -o yaml | grep mode
# mode: ""  ← empty string means iptables (default)
# mode: "ipvs"  ← IPVS mode

# IPVS supports real load balancing algorithms:
# - rr (round-robin)
# - lc (least connections)
# - sh (source hash)
```

> **Tip:** For most clusters, iptables mode is fine. Switch to IPVS if you have 1000+ Services or need advanced load balancing algorithms.

## Endpoints and EndpointSlices

When you create a Service with a selector, Kubernetes automatically creates **Endpoints** (and EndpointSlices) that list the IPs of matching Pods:

```bash
# Create a Service
kubectl create deployment api --image=nginx:1.25 --replicas=3
kubectl expose deployment api --port=80

# See the endpoints
kubectl get endpoints api
# NAME   ENDPOINTS                                    AGE
# api    10.1.0.20:80,10.1.0.21:80,10.1.0.22:80      5s

# EndpointSlices (newer, more scalable)
kubectl get endpointslices -l kubernetes.io/service-name=api
# NAME        ADDRESSTYPE   PORTS   ENDPOINTS                    AGE
# api-abc12   IPv4          80      10.1.0.20,10.1.0.21,...      5s

# When a Pod is deleted, endpoints update automatically
kubectl delete pod $(kubectl get pods -l app=api -o name | head -1)
kubectl get endpoints api
# ENDPOINTS now show the replacement Pod's IP
```

### Services Without Selectors

You can create a Service without a selector and manually manage the Endpoints. This is useful for proxying to external services:

*Service without selector*

```yaml
apiVersion: v1
kind: Service
metadata:
  name: external-db
spec:
  ports:
  - port: 5432
---
apiVersion: v1
kind: Endpoints
metadata:
  name: external-db        # must match Service name
subsets:
- addresses:
  - ip: 192.168.1.100      # external database IP
  ports:
  - port: 5432
```

Now Pods can connect to `external-db:5432` and traffic routes to `192.168.1.100:5432`.

## Session Affinity

By default, Services distribute traffic randomly across Pods. If you need requests from the same client to reach the same Pod:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  selector:
    app: web
  sessionAffinity: ClientIP
  sessionAffinityConfig:
    clientIP:
      timeoutSeconds: 10800    # 3 hours
  ports:
  - port: 80
```

> **Gotcha:** Session affinity is based on client IP. If clients are behind a NAT (common with corporate networks), they all share the same IP and all go to the same Pod. For real session management, use application-level sticky sessions via Ingress annotations.

## Hands-On: Build a Multi-Service App

Let's wire up a frontend and backend with Services:

*backend-deployment.yaml*

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
spec:
  replicas: 2
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
    spec:
      containers:
      - name: api
        image: hashicorp/http-echo
        args: ["-text=Hello from the API"]
        ports:
        - containerPort: 5678
---
apiVersion: v1
kind: Service
metadata:
  name: api
spec:
  selector:
    app: api
  ports:
  - port: 80
    targetPort: 5678
```

*frontend-deployment.yaml*

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
        ports:
        - containerPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  type: NodePort
  selector:
    app: web
  ports:
  - port: 80
    targetPort: 80
    nodePort: 30080
```

*Deploy and test*

```bash
kubectl apply -f backend-deployment.yaml
kubectl apply -f frontend-deployment.yaml

# Verify Services
kubectl get svc
# NAME   TYPE        CLUSTER-IP     EXTERNAL-IP   PORT(S)        AGE
# api    ClusterIP   10.96.50.100   <none>        80/TCP         5s
# web    NodePort    10.96.50.200   <none>        80:30080/TCP   5s

# The frontend can reach the backend by DNS name:
kubectl exec deploy/web -- curl -s http://api
# Hello from the API

# Access the frontend from outside the cluster:
curl http://localhost:30080

# Clean up
kubectl delete -f backend-deployment.yaml -f frontend-deployment.yaml
```

The frontend Pods can reach the backend at `http://api` (or `http://api.default.svc.cluster.local`). Kubernetes DNS resolves the Service name to the ClusterIP. More on DNS in Module 8.

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

## Module 6 Summary

- Every **Pod gets its own IP**, and Pods can talk directly to each other — no NAT
- **Services** provide a stable ClusterIP and DNS name in front of ephemeral Pods
- Services find Pods via **label selectors** — matching labels = endpoint membership
- **Port mapping:** `port` (Service), `targetPort` (Pod), `nodePort` (Node)
- **ClusterIP** — internal only (default)
- **NodePort** — external via port 30000-32767 on all nodes
- **LoadBalancer** — provisions a cloud load balancer with external IP
- **ExternalName** — DNS CNAME alias to external services
- **kube-proxy** implements routing with iptables rules (default) or IPVS
- **Endpoints** automatically track which Pods back a Service
- Services without selectors can proxy to external IPs
- Pods reach Services by DNS name: `<service>.<namespace>.svc.cluster.local`
