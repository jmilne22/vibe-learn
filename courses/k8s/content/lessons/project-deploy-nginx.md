## Project 1: Deploy nginx with Probes

### What You'll Build

Your first real deployment — get nginx running on your local cluster with proper resource management and health checks. This is the "Hello World" of Kubernetes, but done right.

### What You'll Do

1. Write a Pod manifest for nginx, apply it, verify it's running
2. Upgrade to a Deployment with 3 replicas
3. Add resource requests and limits
4. Add a liveness probe (HTTP GET on port 80)
5. Add a readiness probe
6. Trigger a rolling update by changing the nginx version
7. Watch the rollout with `kubectl rollout status`
8. Roll back to the previous version

### Concepts Applied

- Pod and Deployment manifests
- Resource requests and limits
- Liveness and readiness probes
- Rolling updates and rollbacks
- kubectl get, describe, logs, rollout

---

*Content coming soon.* This mini project will get you comfortable with the core deployment workflow: write YAML, apply, observe, update, roll back. Every K8s workflow starts here.
