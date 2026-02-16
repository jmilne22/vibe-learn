## Reading Kubernetes Source

### Repository Structure

`k8s.io/kubernetes` is massive (~2M lines). Key directories:

| Directory | What's There |
|---|---|
| `cmd/kubelet/` | The kubelet binary entry point |
| `cmd/kube-apiserver/` | API server entry point |
| `cmd/kube-controller-manager/` | All built-in controllers |
| `pkg/kubelet/` | Kubelet implementation |
| `pkg/controller/` | Controller implementations |
| `staging/src/k8s.io/` | Libraries published as separate modules |

### How kubectl Works

Trace a `kubectl get pods` command:

```
cmd/kubectl/main.go
  → pkg/cmd/cmd.go (NewDefaultKubectlCommand)
    → pkg/cmd/get/get.go (NewCmdGet)
      → Builds a REST request to the API server
        → Uses client-go's discovery + REST client
          → HTTP GET to /api/v1/namespaces/default/pods
```

Reading this teaches you: CLI design, API client patterns, error handling, output formatting.

### The Controller Pattern in Practice

In `pkg/controller/deployment/`, the Deployment controller:

1. Watches Deployments and ReplicaSets via informers
2. On each event, enqueues the Deployment key to a work queue
3. Workers dequeue keys and call `syncDeployment()`
4. `syncDeployment()` compares desired replicas vs actual ReplicaSets
5. Creates, scales, or deletes ReplicaSets to match

This is the exact pattern from Module 11, used in production by every K8s cluster.
