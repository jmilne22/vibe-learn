## Project 4: Production Deployment Pipeline

### What You'll Build

Design and implement a full GitOps deployment pipeline for the Helm chart from Project 3. This capstone project ties together Helm, autoscaling, deployment strategies, and cluster operations.

### Concepts Applied

- GitOps workflow with ArgoCD or Flux
- ArgoCD Application manifest pointing to the Helm chart
- Horizontal Pod Autoscaler with CPU and custom metrics
- PodDisruptionBudgets for zero-downtime updates
- Health checks: liveness, readiness, startup probes
- Canary deployment strategy with Argo Rollouts
- Rollback automation on failed health checks
- Monitoring with Prometheus ServiceMonitor

### Pipeline Architecture

```
Git Push → GitHub/GitLab
              │
              ▼
         ArgoCD detects drift
              │
              ▼
         helm template + diff
              │
              ▼
         Canary rollout (10% → 50% → 100%)
              │
              ▼
         Prometheus metrics check
              │
         Pass? ──── Fail?
          │            │
          ▼            ▼
       Promote      Rollback
```

---

*Content coming soon.* This capstone project brings everything together into a production-grade deployment pipeline. You'll implement GitOps, progressive delivery, autoscaling, and automated rollback — the full stack of production Kubernetes operations.
