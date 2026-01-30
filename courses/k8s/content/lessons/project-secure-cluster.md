## Project 2: Secure & Harden a Cluster

### What You'll Build

Given a cluster description with common security mistakes, write the manifests to lock it down. This project applies everything from Track 4 (Security & Operations).

### Security Issues to Fix

- Containers running as root
- No RBAC — everything uses the default ServiceAccount
- Secrets stored as plain environment variables
- No NetworkPolicies — all Pods can talk to all Pods
- No resource limits — one Pod can OOM the node
- No probes — failed containers keep receiving traffic

### Concepts Applied

- RBAC: custom ServiceAccounts, Roles, RoleBindings
- Pod Security Standards: restricted profile
- SecurityContext: runAsNonRoot, readOnlyRootFilesystem, drop ALL capabilities
- NetworkPolicies: deny-all default, allow specific traffic
- ResourceQuotas and LimitRanges
- Liveness and readiness probes

---

*Content coming soon.* This project will give you a deliberately insecure cluster setup and ask you to fix every issue. You'll practice writing security-focused manifests and learn the "defense in depth" approach to Kubernetes security.
