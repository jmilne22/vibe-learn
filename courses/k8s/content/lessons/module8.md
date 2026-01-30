## DNS & Service Discovery

Every Pod in Kubernetes can find other Services **by name**. You don't hardcode IPs -- you call `http://api` or `http://api.production` and the cluster's DNS system resolves it. This module covers how that works, when it breaks, and how to debug it.

### How DNS Works in Kubernetes

Kubernetes runs **CoreDNS** as a Deployment inside the `kube-system` namespace. Every Pod created in the cluster has its `/etc/resolv.conf` configured to point at the CoreDNS Service IP.

```
┌───────────────────────────────────────────────────────────────┐
│                         CLUSTER                                │
│                                                                │
│   ┌─────────────────┐       DNS query: "api"                  │
│   │   Your Pod       │──────────────────────────┐              │
│   │ /etc/resolv.conf │                          │              │
│   │ nameserver       │                          ▼              │
│   │  10.96.0.10      │              ┌───────────────────┐      │
│   └─────────────────┘              │   CoreDNS Pod      │      │
│                                     │   (kube-system)    │      │
│                                     │   10.96.0.10       │      │
│                                     └─────────┬─────────┘      │
│                                               │                │
│                                     Returns: 10.96.50.100     │
│                                     (ClusterIP of "api" svc)  │
│                                                                │
└───────────────────────────────────────────────────────────────┘
```

*Check CoreDNS is running*

```bash
kubectl get deploy -n kube-system -l k8s-app=kube-dns
# NAME      READY   UP-TO-DATE   AVAILABLE   AGE
# coredns   2/2     2            2           30d

kubectl get svc -n kube-system kube-dns
# NAME       TYPE        CLUSTER-IP   EXTERNAL-IP   PORT(S)                  AGE
# kube-dns   ClusterIP   10.96.0.10   <none>        53/UDP,53/TCP,9153/TCP   30d
```

Notice the Service is named `kube-dns` (for historical reasons), but the Pods running behind it are CoreDNS.

### What's in /etc/resolv.conf

Every Pod gets a `resolv.conf` injected by the kubelet:

```bash
kubectl run debug --image=busybox --rm -it --restart=Never -- cat /etc/resolv.conf
# nameserver 10.96.0.10
# search default.svc.cluster.local svc.cluster.local cluster.local
# options ndots:5
```

Three key fields:

- **nameserver 10.96.0.10** -- points to the CoreDNS Service ClusterIP
- **search** -- the search domains appended to short names
- **options ndots:5** -- if a name has fewer than 5 dots, append search domains before trying it as an FQDN

The `search` line is what makes short names work. When your Pod calls `http://api`, the resolver tries:

1. `api.default.svc.cluster.local` -- found! Returns the ClusterIP
2. (If not found) `api.svc.cluster.local`
3. (If not found) `api.cluster.local`
4. (If not found) `api` as a bare FQDN

> **Tip:** The first search domain includes the Pod's own namespace. A Pod in the `production` namespace gets `search production.svc.cluster.local svc.cluster.local cluster.local`. This means short names resolve to services in the same namespace first.

### Service DNS Records

Every Service in the cluster gets DNS records automatically. No configuration needed.

#### The Full FQDN

The full DNS name for any Service follows this pattern:

```
<service-name>.<namespace>.svc.cluster.local
```

For example, a Service named `api` in the `production` namespace:

```
api.production.svc.cluster.local
```

#### Short Names

Thanks to the search domains in `resolv.conf`, you can use shorter names:

```bash
# Same namespace -- just the service name
curl http://api
# Resolves: api.default.svc.cluster.local

# Cross-namespace -- service.namespace
curl http://api.production
# Resolves: api.production.svc.cluster.local

# Full FQDN -- always works regardless of namespace
curl http://api.production.svc.cluster.local
```

*Demonstrate DNS resolution*

```bash
# Create a test Service
kubectl create deployment web --image=nginx:1.25
kubectl expose deployment web --port=80

# Resolve it from inside the cluster
kubectl run dns-test --image=busybox --rm -it --restart=Never -- nslookup web
# Server:    10.96.0.10
# Address 1: 10.96.0.10 kube-dns.kube-system.svc.cluster.local
#
# Name:      web
# Address 1: 10.96.50.100 web.default.svc.cluster.local

# Resolve with full FQDN
kubectl run dns-test --image=busybox --rm -it --restart=Never -- nslookup web.default.svc.cluster.local
# Name:      web.default.svc.cluster.local
# Address 1: 10.96.50.100 web.default.svc.cluster.local
```

#### A Records and SRV Records

**A records** map the Service name to its ClusterIP:

```bash
kubectl run dns-test --image=busybox --rm -it --restart=Never -- nslookup web.default.svc.cluster.local
# Name:      web.default.svc.cluster.local
# Address 1: 10.96.50.100
```

**SRV records** provide port discovery. They follow the format `_<port-name>._<protocol>.<service>.<namespace>.svc.cluster.local`:

```bash
kubectl run dns-test --image=tutum/dnsutils --rm -it --restart=Never -- \
  dig SRV web.default.svc.cluster.local
# ;; ANSWER SECTION:
# _http._tcp.web.default.svc.cluster.local. 30 IN SRV 0 100 80 web.default.svc.cluster.local.
```

SRV records are useful when you need to discover which port a Service is listening on, without hardcoding it.

> **Tip:** Named ports are required for SRV records. When you define `ports: [{name: http, port: 80}]` in a Service, the SRV record uses that name. Without a name, SRV records are not generated for that port.

### Pod DNS Records

Pods also get DNS records, though they're used less frequently.

#### IP-Based Pod DNS

Every Pod gets a DNS record based on its IP address, with dots replaced by dashes:

```
<pod-ip-with-dashes>.<namespace>.pod.cluster.local
```

```bash
# Find a Pod's IP
kubectl get pod -l app=web -o wide
# NAME                   READY   STATUS    IP           NODE
# web-5d9b8f7c4-abc12    1/1     Running   10.1.0.15    node1

# Resolve the Pod DNS (dots replaced with dashes)
kubectl run dns-test --image=busybox --rm -it --restart=Never -- \
  nslookup 10-1-0-15.default.pod.cluster.local
# Name:      10-1-0-15.default.pod.cluster.local
# Address 1: 10.1.0.15
```

#### Named Pods via hostname and subdomain

You can give a Pod a meaningful DNS name by setting `hostname` and `subdomain` fields. The `subdomain` must match a Headless Service name:

*named-pod.yaml*

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: my-pod
  labels:
    app: myapp
spec:
  hostname: my-pod
  subdomain: myapp-svc        # must match a Headless Service name
  containers:
  - name: app
    image: nginx:1.25
---
apiVersion: v1
kind: Service
metadata:
  name: myapp-svc              # matches subdomain
spec:
  clusterIP: None              # Headless Service
  selector:
    app: myapp
  ports:
  - port: 80
```

```bash
kubectl apply -f named-pod.yaml

# Now the Pod is reachable at:
kubectl run dns-test --image=busybox --rm -it --restart=Never -- \
  nslookup my-pod.myapp-svc.default.svc.cluster.local
# Name:      my-pod.myapp-svc.default.svc.cluster.local
# Address 1: 10.1.0.25
```

This pattern becomes essential with **StatefulSets**, which set hostname and subdomain automatically.

### Headless Services (clusterIP: None)

A **Headless Service** has no ClusterIP. Instead of returning a single virtual IP, DNS returns the IPs of all backing Pods directly.

```
              Regular Service                     Headless Service
              (clusterIP: 10.96.50.100)           (clusterIP: None)
                     │                                    │
                DNS returns:                        DNS returns:
              10.96.50.100                    10.1.0.15, 10.1.0.16, 10.1.0.17
              (single VIP)                    (all Pod IPs directly)
                     │                                    │
          ┌──────────┼──────────┐            ┌────────────┼────────────┐
          ▼          ▼          ▼            ▼            ▼            ▼
       Pod A       Pod B      Pod C       Pod A        Pod B        Pod C
```

*headless-svc.yaml*

```yaml
apiVersion: v1
kind: Service
metadata:
  name: db
spec:
  clusterIP: None              # ← makes it headless
  selector:
    app: db
  ports:
  - port: 3306
```

```bash
kubectl apply -f headless-svc.yaml

# DNS returns all Pod IPs instead of a single ClusterIP
kubectl run dns-test --image=busybox --rm -it --restart=Never -- nslookup db
# Server:    10.96.0.10
# Address 1: 10.96.0.10 kube-dns.kube-system.svc.cluster.local
#
# Name:      db
# Address 1: 10.1.0.15
# Address 2: 10.1.0.16
# Address 3: 10.1.0.17
```

#### Headless Services with StatefulSets

This is where Headless Services shine. Each Pod in a StatefulSet gets a **stable, predictable DNS name**:

```
<pod-name>.<service-name>.<namespace>.svc.cluster.local
```

*statefulset-example.yaml*

```yaml
apiVersion: v1
kind: Service
metadata:
  name: mysql
spec:
  clusterIP: None
  selector:
    app: mysql
  ports:
  - port: 3306
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: mysql
spec:
  serviceName: mysql           # ← links to the Headless Service
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
        ports:
        - containerPort: 3306
```

```bash
kubectl apply -f statefulset-example.yaml

# StatefulSet Pods get predictable names
kubectl get pods -l app=mysql
# NAME      READY   STATUS    RESTARTS   AGE
# mysql-0   1/1     Running   0          60s
# mysql-1   1/1     Running   0          45s
# mysql-2   1/1     Running   0          30s

# Each Pod has a stable DNS name
kubectl run dns-test --image=busybox --rm -it --restart=Never -- nslookup mysql-0.mysql
# Name:      mysql-0.mysql.default.svc.cluster.local
# Address 1: 10.1.0.20

kubectl run dns-test --image=busybox --rm -it --restart=Never -- nslookup mysql-1.mysql
# Name:      mysql-1.mysql.default.svc.cluster.local
# Address 1: 10.1.0.21

kubectl run dns-test --image=busybox --rm -it --restart=Never -- nslookup mysql-2.mysql
# Name:      mysql-2.mysql.default.svc.cluster.local
# Address 1: 10.1.0.22
```

Even if `mysql-0` is deleted and recreated on a different node with a different IP, `mysql-0.mysql.default.svc.cluster.local` always resolves to the current IP of `mysql-0`.

**Use cases for Headless Services:**

- **StatefulSets** -- databases, Elasticsearch, Kafka, ZooKeeper where each instance needs a unique identity
- **Peer discovery** -- Pods query DNS to discover all peers (e.g., Cassandra ring formation)
- **Client-side load balancing** -- application receives all IPs and implements its own balancing logic

> **Gotcha:** With a Headless Service, the client gets multiple IPs and must handle them. Most HTTP clients will use the first IP returned. If you want round-robin load balancing, use a regular ClusterIP Service instead.

### DNS Policies

Kubernetes lets you control how each Pod resolves DNS through the `dnsPolicy` field.

#### ClusterFirst (Default)

All DNS queries go to CoreDNS first. If CoreDNS can't resolve the name (not a cluster Service), it forwards to the upstream DNS (typically the node's DNS).

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: app
spec:
  dnsPolicy: ClusterFirst      # default — usually omitted
  containers:
  - name: app
    image: myapp:v1
```

This is what you want 99% of the time. Cluster names resolve inside the cluster, external names (like `google.com`) are forwarded upstream.

#### Default

Inherits DNS configuration from the node the Pod runs on. Pod DNS is identical to the host's `/etc/resolv.conf`. Cluster Services are **not resolvable** by name.

```yaml
spec:
  dnsPolicy: Default           # uses the node's DNS — NOT the cluster DNS
```

> **Gotcha:** `Default` doesn't mean "default behavior" -- it means "use the node's default DNS." The actual default policy is `ClusterFirst`. This naming confuses everyone.

#### ClusterFirstWithHostNet

For Pods running with `hostNetwork: true`, DNS normally inherits the node's config (since the Pod shares the node's network namespace). `ClusterFirstWithHostNet` forces these Pods to still use CoreDNS:

```yaml
spec:
  hostNetwork: true
  dnsPolicy: ClusterFirstWithHostNet   # use cluster DNS despite hostNetwork
  containers:
  - name: app
    image: myapp:v1
```

#### None -- Full Manual DNS

Ignores all cluster DNS. You provide the entire DNS configuration via `dnsConfig`:

```yaml
spec:
  dnsPolicy: None
  dnsConfig:
    nameservers:
    - 8.8.8.8
    - 8.8.4.4
    searches:
    - mycompany.local
    options:
    - name: ndots
      value: "2"
    - name: timeout
      value: "3"
  containers:
  - name: app
    image: myapp:v1
```

Use `None` when you need Pods to talk to a custom internal DNS server instead of CoreDNS.

> **Tip:** You can also use `dnsConfig` alongside other DNS policies (not just `None`). For example, with `ClusterFirst` you can add extra search domains or override `ndots` without losing cluster DNS resolution.

### Cross-Namespace Communication

Services in different namespaces can communicate freely by default. You just need to use the namespace-qualified name.

*Set up two namespaces*

```bash
# Create namespaces
kubectl create namespace frontend
kubectl create namespace backend

# Deploy a service in the backend namespace
kubectl create deployment api --image=hashicorp/http-echo \
  -n backend -- -text="Hello from backend"
kubectl expose deployment api --port=80 --target-port=5678 -n backend

# Deploy a client in the frontend namespace
kubectl create deployment web --image=nginx:1.25 -n frontend

# Verify Services
kubectl get svc -A | grep -E "NAMESPACE|api"
# NAMESPACE   NAME   TYPE        CLUSTER-IP     EXTERNAL-IP   PORT(S)   AGE
# backend     api    ClusterIP   10.96.50.100   <none>        80/TCP    30s
```

*Call the backend from the frontend namespace*

```bash
# Short name won't work (different namespace)
kubectl exec deploy/web -n frontend -- curl -s http://api
# curl: (6) Could not resolve host: api
# ERROR — "api" resolves in the frontend namespace, where no "api" Service exists

# Namespace-qualified name works
kubectl exec deploy/web -n frontend -- curl -s http://api.backend
# Hello from backend

# Full FQDN also works
kubectl exec deploy/web -n frontend -- curl -s http://api.backend.svc.cluster.local
# Hello from backend
```

#### Blocking Cross-Namespace Traffic

By default, all Pods can talk to all Services in all namespaces. To restrict this, use **NetworkPolicies**:

*deny-cross-namespace.yaml*

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-other-namespaces
  namespace: backend
spec:
  podSelector: {}              # applies to all Pods in backend namespace
  ingress:
  - from:
    - podSelector: {}          # allow Pods in same namespace
  policyTypes:
  - Ingress
```

```bash
kubectl apply -f deny-cross-namespace.yaml

# Now cross-namespace calls are blocked
kubectl exec deploy/web -n frontend -- curl -s --max-time 3 http://api.backend
# curl: (28) Connection timed out

# Pods within the backend namespace still work
kubectl run test -n backend --image=busybox --rm -it --restart=Never -- \
  wget -qO- http://api
# Hello from backend
```

> **Tip:** NetworkPolicies require a CNI plugin that supports them (Calico, Cilium, Weave). The default kubenet CNI does not enforce NetworkPolicies -- they'll be accepted but silently ignored.

### Debugging DNS Issues

DNS problems are common in Kubernetes. Here's a systematic approach to diagnose them.

#### Step 1: Run a DNS Debug Pod

```bash
# Start a debug Pod with DNS tools
kubectl run dns-debug --image=tutum/dnsutils --rm -it --restart=Never -- bash

# Inside the Pod:
nslookup kubernetes
# Server:    10.96.0.10
# Address:   10.96.0.10#53
#
# Name:      kubernetes.default.svc.cluster.local
# Address:   10.96.0.1

# If this fails, DNS is broken at the cluster level
```

#### Step 2: Check CoreDNS Pods

```bash
kubectl get pods -n kube-system -l k8s-app=kube-dns
# NAME                       READY   STATUS    RESTARTS   AGE
# coredns-5d78c9869d-abc12   1/1     Running   0          30d
# coredns-5d78c9869d-def34   1/1     Running   0          30d

# If Pods are CrashLoopBackOff or not Running, DNS is down
kubectl logs -n kube-system -l k8s-app=kube-dns --tail=50
```

#### Step 3: Test Specific Name Resolution

```bash
# Test cluster Service resolution
kubectl run dns-debug --image=busybox --rm -it --restart=Never -- nslookup kubernetes
# Should return 10.96.0.1

# Test your specific Service
kubectl run dns-debug --image=busybox --rm -it --restart=Never -- nslookup myservice.mynamespace
# Should return the Service ClusterIP

# Test external resolution
kubectl run dns-debug --image=busybox --rm -it --restart=Never -- nslookup google.com
# Should return an external IP
```

#### Step 4: Check resolv.conf

```bash
kubectl run dns-debug --image=busybox --rm -it --restart=Never -- cat /etc/resolv.conf
# nameserver 10.96.0.10
# search default.svc.cluster.local svc.cluster.local cluster.local
# options ndots:5

# Verify the nameserver IP matches the kube-dns Service:
kubectl get svc -n kube-system kube-dns -o jsonpath='{.spec.clusterIP}'
# 10.96.0.10
```

#### Common DNS Issues

| Problem | Symptom | Fix |
|---------|---------|-----|
| CoreDNS not running | All DNS queries fail | `kubectl rollout restart deploy/coredns -n kube-system` |
| Wrong search domain | Can't resolve short names | Check `dnsPolicy` on the Pod |
| Service doesn't exist | `NXDOMAIN` for a valid name | Check service name and namespace |
| NetworkPolicy blocking DNS | All queries time out | Ensure port 53 (UDP/TCP) is allowed in egress rules |
| External resolution fails | Can't reach `google.com` | Check CoreDNS upstream config (`kubectl get configmap coredns -n kube-system -o yaml`) |

#### The ndots:5 Gotcha

The `ndots:5` setting means: if the name has **fewer than 5 dots**, append search domains before trying it as an absolute name. This has a performance implication:

```bash
# Your app calls: api.production.svc.cluster.local
# Dots in name: 4 (fewer than 5)
# DNS resolver tries:
#   1. api.production.svc.cluster.local.default.svc.cluster.local  → NXDOMAIN
#   2. api.production.svc.cluster.local.svc.cluster.local          → NXDOMAIN
#   3. api.production.svc.cluster.local.cluster.local               → NXDOMAIN
#   4. api.production.svc.cluster.local                             → SUCCESS!
# That's 4 DNS queries instead of 1!
```

For **external domains** this is worse:

```bash
# Your app calls: api.stripe.com
# Dots in name: 2 (fewer than 5)
# DNS resolver tries:
#   1. api.stripe.com.default.svc.cluster.local  → NXDOMAIN
#   2. api.stripe.com.svc.cluster.local          → NXDOMAIN
#   3. api.stripe.com.cluster.local               → NXDOMAIN
#   4. api.stripe.com                             → SUCCESS!
# 4 wasted queries for every external DNS call!
```

**Solutions:**

1. **Append a trailing dot** to FQDNs: `api.stripe.com.` -- the trailing dot tells the resolver it's already fully qualified
2. **Lower ndots** via `dnsConfig`:

```yaml
spec:
  dnsConfig:
    options:
    - name: ndots
      value: "2"
```

3. **Use FQDNs for cluster Services** when calling cross-namespace: `api.production.svc.cluster.local.` (with trailing dot)

> **Gotcha:** Lowering `ndots` to a small value means short names like `api` won't resolve through search domains. If you set `ndots: 1`, the name `api` (zero dots) still gets search domains applied, but `api.production` (one dot) would be tried as an absolute name first. Choose a value that balances your usage of short names vs. external domains.

### ExternalDNS

**ExternalDNS** is a Kubernetes add-on that automatically creates DNS records in external DNS providers (AWS Route53, Google Cloud DNS, Azure DNS, Cloudflare) based on your Ingress or Service resources.

```
┌────────────────────┐         ┌───────────────────┐
│  Ingress Resource   │         │  ExternalDNS Pod   │
│  host: app.co       │────────▶│  watches Ingress   │
│  + LB IP            │         │  and Service       │
└────────────────────┘         └─────────┬─────────┘
                                          │
                                  Creates A record:
                                  app.co → 203.0.113.50
                                          │
                                          ▼
                               ┌──────────────────┐
                               │  AWS Route53 /    │
                               │  Cloud DNS /      │
                               │  Cloudflare       │
                               └──────────────────┘
```

*How it works:*

1. You deploy ExternalDNS in your cluster
2. You annotate your Ingress or Service with the desired DNS name
3. ExternalDNS watches for these annotations and creates records in your DNS provider

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: app
  annotations:
    external-dns.alpha.kubernetes.io/hostname: app.example.com
spec:
  ingressClassName: nginx
  rules:
  - host: app.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: app
            port:
              number: 80
```

ExternalDNS reads the annotation and creates an A record in your DNS provider: `app.example.com → <Ingress external IP>`.

For LoadBalancer Services:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: app
  annotations:
    external-dns.alpha.kubernetes.io/hostname: app.example.com
spec:
  type: LoadBalancer
  selector:
    app: web
  ports:
  - port: 80
```

> **Tip:** ExternalDNS syncs DNS records automatically. When you delete the Ingress or Service, it removes the DNS record. Set `--policy=upsert-only` if you want ExternalDNS to create records but never delete them (safer for production).

### Hands-On: Cross-Namespace DNS and Headless Services

Let's tie everything together with a practical exercise.

*Step 1: Create two namespaces with services*

```bash
kubectl create namespace team-a
kubectl create namespace team-b
```

*Step 2: Deploy services in each namespace*

```bash
# team-a: a web frontend
kubectl create deployment web --image=hashicorp/http-echo -n team-a -- -text="team-a web"
kubectl expose deployment web --port=80 --target-port=5678 -n team-a

# team-b: an API backend
kubectl create deployment api --image=hashicorp/http-echo -n team-b -- -text="team-b api"
kubectl expose deployment api --port=80 --target-port=5678 -n team-b
```

*Step 3: Cross-namespace resolution*

```bash
# From team-a, call team-b's API
kubectl exec deploy/web -n team-a -- wget -qO- http://api.team-b
# team-b api

# From team-b, call team-a's web
kubectl exec deploy/api -n team-b -- wget -qO- http://web.team-a
# team-a web

# Use full FQDNs
kubectl exec deploy/web -n team-a -- wget -qO- http://api.team-b.svc.cluster.local
# team-b api
```

*Step 4: Set up a Headless Service*

```bash
# Create a headless service in team-b
kubectl delete svc api -n team-b

cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Service
metadata:
  name: api
  namespace: team-b
spec:
  clusterIP: None
  selector:
    app: api
  ports:
  - port: 80
    targetPort: 5678
EOF

# Scale up to see multiple IPs
kubectl scale deployment api -n team-b --replicas=3

# DNS now returns Pod IPs directly
kubectl run dns-test --image=busybox --rm -it --restart=Never -- nslookup api.team-b
# Name:      api.team-b.svc.cluster.local
# Address 1: 10.1.0.30
# Address 2: 10.1.0.31
# Address 3: 10.1.0.32
```

*Step 5: Debug DNS resolution*

```bash
# Check resolv.conf in a Pod
kubectl run dns-debug -n team-a --image=busybox --rm -it --restart=Never -- \
  cat /etc/resolv.conf
# nameserver 10.96.0.10
# search team-a.svc.cluster.local svc.cluster.local cluster.local
# options ndots:5

# Test that the search domain includes team-a (Pod's own namespace)
kubectl run dns-debug -n team-a --image=busybox --rm -it --restart=Never -- \
  nslookup web
# Name:      web.team-a.svc.cluster.local   ← resolves in team-a namespace
# Address 1: 10.96.100.50

# Verify CoreDNS is healthy
kubectl get pods -n kube-system -l k8s-app=kube-dns -o wide
# NAME                       READY   STATUS    RESTARTS   NODE
# coredns-5d78c9869d-abc12   1/1     Running   0          node1
# coredns-5d78c9869d-def34   1/1     Running   0          node2
```

*Clean up*

```bash
kubectl delete namespace team-a team-b
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

## Module 8 Summary

- **CoreDNS** runs as a Deployment in `kube-system` and is the cluster's DNS server -- every Pod's `/etc/resolv.conf` points to it
- Service FQDN format: **`<service>.<namespace>.svc.cluster.local`**
- **Short names** work via search domains: `api` (same namespace), `api.production` (cross-namespace)
- **A records** return ClusterIPs; **SRV records** return port information for named ports
- **Pod DNS:** `<ip-dashed>.<namespace>.pod.cluster.local` -- Pods can also get named DNS via `hostname`/`subdomain` fields
- **Headless Services** (`clusterIP: None`) return Pod IPs directly -- critical for StatefulSets
- StatefulSet Pods get stable DNS: **`<pod-name>.<service>.<namespace>.svc.cluster.local`**
- **DNS policies:** `ClusterFirst` (default), `Default` (node DNS), `ClusterFirstWithHostNet`, `None` (manual)
- **Cross-namespace** calls use `<service>.<namespace>` -- NetworkPolicies can restrict this traffic
- The **ndots:5** setting causes extra DNS lookups for external domains -- append a trailing dot or lower ndots to optimize
- **Debug DNS** systematically: check CoreDNS pods, test with nslookup/dig, inspect resolv.conf, check NetworkPolicies
- **ExternalDNS** automatically creates records in external providers (Route53, CloudDNS) from Ingress/Service annotations
