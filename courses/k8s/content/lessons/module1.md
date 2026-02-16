## What Are Containers?

Containers are not VMs. A VM runs a full operating system on virtualized hardware. A container is just a regular Linux process that's been isolated using two kernel features:

- **Namespaces** — isolate what a process can see (its own PID tree, network stack, filesystem mounts, hostname)
- **Cgroups** — limit what a process can use (CPU, memory, disk I/O)

That's it. No hypervisor, no guest OS. The container shares the host's kernel. This is why containers start in milliseconds (it's just a process) while VMs take seconds to minutes (booting an OS).

> **Why this matters for K8s:** Kubernetes orchestrates containers. Understanding that they're just isolated processes explains why they're fast to start, cheap to run, and easy to kill — all properties K8s depends on.

## Docker Basics

Docker packages your application into a **container image** — a layered, read-only filesystem snapshot with your code, dependencies, and runtime.

### Dockerfile

A Dockerfile is a recipe for building an image:

*Dockerfile*

```dockerfile
FROM node:20-alpine          # base image
WORKDIR /app                 # set working directory
COPY package*.json ./        # copy dependency manifest
RUN npm install              # install dependencies (cached layer)
COPY . .                     # copy application code
EXPOSE 3000                  # document the port (doesn't publish it)
CMD ["node", "server.js"]    # default command when container starts
```

### Build, Run, Stop

*Building and running*

```bash
# Build an image from a Dockerfile
docker build -t myapp:v1 .

# Run a container from the image
docker run -d -p 3000:3000 --name myapp myapp:v1
#          │  │              │            │
#          │  │              │            └── image name:tag
#          │  │              └── container name
#          │  └── map host port 3000 to container port 3000
#          └── detached mode (run in background)

# Check running containers
docker ps

# View logs
docker logs myapp
docker logs -f myapp         # follow (like tail -f)

# Shell into a running container
docker exec -it myapp /bin/sh

# Stop and remove
docker stop myapp
docker rm myapp
```

### Image Layers

Each Dockerfile instruction creates a layer. Layers are cached and shared:

```
┌─────────────────────┐
│ CMD ["node", ...]   │  ← metadata only, no layer
├─────────────────────┤
│ COPY . .            │  ← your code (changes often)
├─────────────────────┤
│ RUN npm install     │  ← dependencies (cached if package.json unchanged)
├─────────────────────┤
│ COPY package*.json  │  ← dependency manifest
├─────────────────────┤
│ FROM node:20-alpine │  ← base image (shared across all node apps)
└─────────────────────┘
```

> **Tip:** Order your Dockerfile from least-changing to most-changing. Dependencies before code. This maximizes cache hits and speeds up builds.

## Setting Up a Local Kubernetes Cluster

You need a local cluster to follow along with this course. There are three main options:

### Option 1: Docker Desktop (Easiest)

If you already have Docker Desktop installed:

1. Open Docker Desktop → Settings → Kubernetes
2. Check "Enable Kubernetes"
3. Click "Apply & Restart"
4. Wait for the Kubernetes indicator to turn green

*Verify*

```bash
kubectl cluster-info
# Kubernetes control plane is running at https://kubernetes.docker.internal:6443

kubectl get nodes
# NAME             STATUS   ROLES           AGE   VERSION
# docker-desktop   Ready    control-plane   1m    v1.28.2
```

### Option 2: minikube

minikube creates a single-node cluster in a VM or container:

*Install and start*

```bash
# macOS
brew install minikube

# Linux
curl -LO https://storage.googleapis.com/minikube/releases/latest/minikube-linux-amd64
sudo install minikube-linux-amd64 /usr/local/bin/minikube

# Start a cluster
minikube start

# Check status
minikube status
```

minikube has useful extras:

```bash
minikube dashboard            # opens the K8s web dashboard
minikube tunnel               # expose LoadBalancer services to localhost
minikube addons enable ingress # enable nginx ingress controller
minikube addons enable metrics-server
```

### Option 3: kind (Kubernetes in Docker)

kind runs K8s nodes as Docker containers. Great for CI and multi-node testing:

*Install and create*

```bash
# macOS
brew install kind

# Linux
go install sigs.k8s.io/kind@latest

# Create a cluster
kind create cluster --name learn-k8s

# Create a multi-node cluster
cat <<EOF | kind create cluster --config=-
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
- role: control-plane
- role: worker
- role: worker
EOF
```

> **Which should I pick?** Docker Desktop if you're on Mac/Windows and want zero friction. minikube if you want addons like dashboard and ingress out of the box. kind if you want multi-node clusters or use Linux.

## Installing kubectl

kubectl is the CLI for talking to Kubernetes. Your local cluster setup may have installed it already.

*Install kubectl*

```bash
# macOS
brew install kubectl

# Linux (download binary)
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
chmod +x kubectl
sudo mv kubectl /usr/local/bin/

# Verify
kubectl version --client
```

### Contexts and kubeconfig

kubectl reads `~/.kube/config` to know which cluster to talk to. This file contains **contexts** — named combinations of cluster + user + namespace:

```bash
# See all contexts
kubectl config get-contexts
# CURRENT   NAME             CLUSTER          NAMESPACE
# *         docker-desktop   docker-desktop   default
#           minikube         minikube         default

# Switch context
kubectl config use-context docker-desktop

# See current context
kubectl config current-context
```

### Verify Your Cluster

Run these commands to confirm everything works:

*Cluster health check*

```bash
# Cluster info
kubectl cluster-info
# Kubernetes control plane is running at https://127.0.0.1:6443
# CoreDNS is running at https://127.0.0.1:6443/api/v1/namespaces/...

# List nodes
kubectl get nodes
# NAME             STATUS   ROLES           AGE   VERSION
# docker-desktop   Ready    control-plane   5m    v1.28.2

# Check system pods
kubectl get pods -n kube-system
# NAME                                     READY   STATUS    RESTARTS
# coredns-5dd5756b68-xxxxx                 1/1     Running   0
# etcd-docker-desktop                      1/1     Running   0
# kube-apiserver-docker-desktop             1/1     Running   0
# kube-controller-manager-docker-desktop    1/1     Running   0
# kube-scheduler-docker-desktop             1/1     Running   0
```

If you see all system pods Running, your cluster is ready.

## Your First Pod

Let's deploy something. A Pod is the smallest thing you can deploy in Kubernetes — one or more containers running together.

*Run nginx*

```bash
# Imperative: create a pod directly
kubectl run nginx --image=nginx:1.25
# pod/nginx created

# Check it's running
kubectl get pods
# NAME    READY   STATUS    RESTARTS   AGE
# nginx   1/1     Running   0          10s

# See more details
kubectl get pods -o wide
# NAME    READY   STATUS    RESTARTS   AGE   IP           NODE
# nginx   1/1     Running   0          30s   10.1.0.15    docker-desktop

# Access it via port-forward
kubectl port-forward pod/nginx 8080:80
# Forwarding from 127.0.0.1:8080 -> 80
# Now open http://localhost:8080 in your browser

# Clean up
kubectl delete pod nginx
```

Now let's do the same thing declaratively — the way you'll do it for real:

*pod.yaml*

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: nginx
  labels:
    app: nginx
spec:
  containers:
  - name: nginx
    image: nginx:1.25
    ports:
    - containerPort: 80
```

*Apply and verify*

```bash
kubectl apply -f pod.yaml
kubectl get pods
kubectl describe pod nginx    # shows events, conditions, IP
kubectl logs nginx            # shows nginx access logs
kubectl delete -f pod.yaml
```

> **Imperative vs Declarative:** `kubectl run` is quick for testing. For anything real, write YAML and use `kubectl apply`. The YAML is your source of truth — you can version it in git, review it in PRs, and reproduce it anywhere.

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

## Module 1 Summary

- **Containers** are isolated Linux processes, not VMs — namespaces for isolation, cgroups for limits
- **Docker images** are layered filesystem snapshots built from Dockerfiles
- **Local clusters:** Docker Desktop (easiest), minikube (most features), kind (multi-node)
- **kubectl** talks to your cluster via `~/.kube/config`
- **Pods** are the smallest deployable unit — use `kubectl apply -f` for declarative management
- **Imperative** (`kubectl run`) for testing, **declarative** (YAML + `apply`) for everything else
