## Why Ingress Exists

Services expose Pods to the network, but they have limitations for HTTP traffic:

- **NodePort** uses high ports (30000+) — users expect port 80/443
- **LoadBalancer** creates one cloud LB per Service — expensive for many services
- Neither provides host-based routing, path-based routing, or TLS termination

**Ingress** solves this by providing HTTP/HTTPS routing rules in front of multiple Services through a single entry point:

```
                              ┌────────────────────┐
     Internet ────────────────▶  Ingress Controller │
                              │  (nginx, traefik)   │
                              └────────┬───────────┘
                                       │
                      ┌────────────────┼────────────────┐
                      │                │                │
            ┌─────────▼──┐   ┌────────▼───┐   ┌───────▼─────┐
            │ app.com/    │   │ app.com/api │   │ blog.com/   │
            │ → frontend  │   │ → api svc   │   │ → blog svc  │
            │   Service   │   │   Service   │   │   Service   │
            └────────────┘   └────────────┘   └─────────────┘
```

One load balancer, many Services. The Ingress Controller routes traffic based on hostname and path.

## Setting Up an Ingress Controller

An Ingress resource by itself does nothing. You need an **Ingress Controller** — a Pod that reads Ingress resources and configures a reverse proxy (nginx, Traefik, HAProxy, Envoy).

### Installing nginx-ingress

*On minikube*

```bash
minikube addons enable ingress

# Verify it's running
kubectl get pods -n ingress-nginx
# NAME                                        READY   STATUS    RESTARTS
# ingress-nginx-controller-7d4b8c6f5-abc12    1/1     Running   0
```

*On Docker Desktop or kind*

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.9.4/deploy/static/provider/cloud/deploy.yaml

# Wait for the controller to be ready
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=120s

# Verify
kubectl get pods -n ingress-nginx
# NAME                                        READY   STATUS    RESTARTS
# ingress-nginx-controller-xxxxx              1/1     Running   0

kubectl get svc -n ingress-nginx
# NAME                       TYPE           CLUSTER-IP     EXTERNAL-IP   PORT(S)
# ingress-nginx-controller   LoadBalancer   10.96.50.200   localhost     80:31080/TCP,443:31443/TCP
```

> **Tip:** The Ingress Controller itself runs as a Deployment with a LoadBalancer Service. This is the one cloud LB you pay for — all your Ingress rules route through it.

## Ingress Resources

An Ingress resource defines routing rules. The controller reads these rules and configures its reverse proxy.

### Path-Based Routing

Route different URL paths to different Services:

*ingress-path.yaml*

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: app-ingress
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  ingressClassName: nginx
  rules:
  - host: myapp.local
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: frontend
            port:
              number: 80
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: api
            port:
              number: 80
```

```bash
kubectl apply -f ingress-path.yaml

kubectl get ingress
# NAME          CLASS   HOSTS         ADDRESS     PORTS   AGE
# app-ingress   nginx   myapp.local   localhost   80      5s

# Test (add myapp.local to /etc/hosts pointing to your cluster IP)
# On Docker Desktop: echo "127.0.0.1 myapp.local" | sudo tee -a /etc/hosts
curl http://myapp.local/        # → frontend Service
curl http://myapp.local/api     # → api Service
```

### pathType Explained

```yaml
paths:
- path: /api
  pathType: Prefix     # matches /api, /api/, /api/users, /api/users/123
- path: /api
  pathType: Exact      # matches only /api, NOT /api/ or /api/users
- path: /
  pathType: ImplementationSpecific  # up to the controller
```

> **Gotcha:** `Prefix` matching is by path segment, not string prefix. `/api` matches `/api` and `/api/users` but NOT `/api2`. This is a common source of confusion.

### Host-Based Routing

Route different hostnames to different Services:

*ingress-host.yaml*

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: multi-host
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
  - host: api.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: api
            port:
              number: 80
  - host: blog.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: blog
            port:
              number: 80
```

Three domains, three Services, one Ingress Controller, one load balancer.

### TLS Termination

Ingress handles HTTPS for you. Store the certificate in a Secret and reference it:

*Create a TLS Secret*

```bash
# Self-signed cert for testing
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout tls.key -out tls.crt \
  -subj "/CN=myapp.local"

kubectl create secret tls myapp-tls --cert=tls.crt --key=tls.key
```

*Reference it in the Ingress*

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: secure-app
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - myapp.local
    secretName: myapp-tls         # the TLS Secret
  rules:
  - host: myapp.local
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: frontend
            port:
              number: 80
```

```bash
# HTTPS works now
curl -k https://myapp.local/
# (-k skips certificate verification for self-signed certs)
```

> **Tip:** In production, use cert-manager to automatically provision and renew TLS certificates from Let's Encrypt. Install cert-manager, create a ClusterIssuer, and add an annotation to your Ingress — certificates are handled automatically.

### Common nginx Ingress Annotations

The nginx Ingress Controller supports many annotations for fine-tuning:

```yaml
metadata:
  annotations:
    # Rewrite the URL path before forwarding
    nginx.ingress.kubernetes.io/rewrite-target: /

    # Force HTTPS redirect
    nginx.ingress.kubernetes.io/ssl-redirect: "true"

    # Rate limiting
    nginx.ingress.kubernetes.io/limit-rps: "10"

    # Request body size limit
    nginx.ingress.kubernetes.io/proxy-body-size: "50m"

    # Timeouts
    nginx.ingress.kubernetes.io/proxy-read-timeout: "300"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "300"

    # WebSocket support
    nginx.ingress.kubernetes.io/proxy-http-version: "1.1"

    # CORS
    nginx.ingress.kubernetes.io/enable-cors: "true"
    nginx.ingress.kubernetes.io/cors-allow-origin: "https://myapp.com"
```

> **Gotcha:** Annotations are vendor-specific. `nginx.ingress.kubernetes.io/*` only works with the nginx controller. Traefik uses different annotations. This non-standard configuration is one reason Gateway API was created.

## Gateway API (The Future)

Gateway API is the successor to Ingress. It's more expressive, role-oriented, and standardized across controllers. As of Kubernetes 1.29+, it's GA for HTTP routing.

### Key Differences from Ingress

| Aspect | Ingress | Gateway API |
|--------|---------|-------------|
| Resource types | 1 (Ingress) | Multiple (Gateway, HTTPRoute, GRPCRoute, TCPRoute) |
| Configuration | Vendor annotations | Standard spec fields |
| Role model | One resource for everything | Infra team manages Gateway, app team manages Routes |
| Protocols | HTTP/HTTPS only | HTTP, HTTPS, gRPC, TCP, UDP |
| Header matching | Annotation-dependent | Built-in |
| Traffic splitting | Not supported | Built-in (canary %) |

### Gateway API Resources

```
┌─────────────┐     GatewayClass defines the controller (like IngressClass)
│ GatewayClass│     Managed by cluster admin
└──────┬──────┘
       │
┌──────▼──────┐     Gateway defines the listener (ports, TLS, hostnames)
│   Gateway   │     Managed by infra/platform team
└──────┬──────┘
       │
┌──────▼──────┐     HTTPRoute defines routing rules (paths, headers, backends)
│  HTTPRoute  │     Managed by application developers
└─────────────┘
```

### Gateway API Example

*Install a Gateway API controller (e.g., nginx Gateway Fabric)*

```bash
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.0.0/standard-install.yaml
```

*gateway.yaml*

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: main-gateway
spec:
  gatewayClassName: nginx
  listeners:
  - name: http
    protocol: HTTP
    port: 80
    allowedRoutes:
      namespaces:
        from: All
```

*httproute.yaml*

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: app-routes
spec:
  parentRefs:
  - name: main-gateway
  hostnames:
  - "myapp.local"
  rules:
  - matches:
    - path:
        type: PathPrefix
        value: /api
    backendRefs:
    - name: api
      port: 80
  - matches:
    - path:
        type: PathPrefix
        value: /
    backendRefs:
    - name: frontend
      port: 80
```

### Traffic Splitting with Gateway API

Gateway API has built-in support for canary deployments — something Ingress can't do:

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: canary-route
spec:
  parentRefs:
  - name: main-gateway
  rules:
  - backendRefs:
    - name: app-v1
      port: 80
      weight: 90        # 90% of traffic
    - name: app-v2
      port: 80
      weight: 10        # 10% of traffic (canary)
```

No annotations, no vendor-specific hacks — traffic splitting is part of the standard spec.

> **Should I use Ingress or Gateway API?** If you're starting fresh, learn Gateway API — it's the future. If you have existing Ingress resources, they're not going away soon. Both will coexist for years. The concepts (routing, TLS, host/path matching) are the same — only the resource format differs.

## Hands-On: Set Up Ingress Routing

Let's deploy two services and route to them with Ingress:

*Step 1: Deploy the apps*

```bash
# Backend API
kubectl create deployment api --image=hashicorp/http-echo -- -text="API response"
kubectl expose deployment api --port=80 --target-port=5678

# Frontend
kubectl create deployment web --image=hashicorp/http-echo -- -text="Frontend response"
kubectl expose deployment web --port=80 --target-port=5678
```

*Step 2: Create the Ingress*

```yaml
# ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: demo-ingress
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  ingressClassName: nginx
  rules:
  - host: demo.local
    http:
      paths:
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: api
            port:
              number: 80
      - path: /
        pathType: Prefix
        backend:
          service:
            name: web
            port:
              number: 80
```

*Step 3: Test*

```bash
kubectl apply -f ingress.yaml

# Add to /etc/hosts (use your cluster IP)
# echo "127.0.0.1 demo.local" | sudo tee -a /etc/hosts

kubectl get ingress
# NAME           CLASS   HOSTS        ADDRESS     PORTS   AGE
# demo-ingress   nginx   demo.local   localhost   80      10s

# Test the routes
curl http://demo.local/
# Frontend response

curl http://demo.local/api
# API response

# Clean up
kubectl delete ingress demo-ingress
kubectl delete deployment api web
kubectl delete svc api web
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

## Module 7 Summary

- **Ingress** provides L7 (HTTP/HTTPS) routing through a single entry point
- You need an **Ingress Controller** (nginx, Traefik) installed — the Ingress resource alone does nothing
- **Path-based routing:** route `/api` to one Service, `/` to another
- **Host-based routing:** route `app.com` and `api.com` to different Services
- **TLS termination:** store certs in Secrets, reference in the Ingress `tls` section
- **pathType:** `Prefix` matches path segments, `Exact` matches exactly
- **Annotations** control controller-specific behavior (rewrite, rate limit, CORS) — vendor-specific
- **Gateway API** is replacing Ingress — more expressive, standardized, role-oriented
- Gateway API has built-in traffic splitting for canary deployments
- One Ingress Controller + one LoadBalancer serves all your Ingress rules — saves cost vs one LB per Service
