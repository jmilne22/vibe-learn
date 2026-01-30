## Project 1: Deploy a Microservices App

### What You'll Build

Deploy a 3-service application (frontend, API server, PostgreSQL database) to your local Kubernetes cluster using raw manifests — no Helm. This project ties together everything from Tracks 1–2.

### Concepts Applied

- Deployments with proper resource requests/limits
- Services: ClusterIP for internal, NodePort or Ingress for external
- ConfigMaps for application configuration
- Secrets for database credentials
- Ingress for HTTP routing to the frontend and API
- DNS-based service discovery between services

### Architecture

```
                    ┌─────────┐
         Internet → │ Ingress │
                    └────┬────┘
                   ┌─────┴─────┐
                   │           │
              ┌────▼───┐  ┌───▼────┐
              │Frontend│  │  API   │
              │(nginx) │  │(node)  │
              └────────┘  └───┬────┘
                              │
                         ┌────▼─────┐
                         │ Postgres │
                         │  (PVC)   │
                         └──────────┘
```

---

*Content coming soon.* This project will walk you through deploying a real multi-service application, writing every manifest by hand. You'll practice the core K8s workflow: write YAML, apply, debug, iterate.
