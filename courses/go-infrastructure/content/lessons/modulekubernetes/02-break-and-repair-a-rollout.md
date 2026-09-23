## Investigate a rollout that stops progressing

Use the supplied fixture and chart from the file-reference section. Build `vibe-course-fixture:1` using the setup lesson first. Keep these experiments in a new kind cluster; no existing kubeconfig is needed.

```sh
export KUBECONFIG="$LAB_ROOT/kubeconfig"
kind create cluster --name vibe-course --image kindest/node:v1.35.0 --wait 120s
kind load docker-image vibe-course-fixture:1 --name vibe-course
helm upgrade --install endpoint-lab "$LAB_ROOT/kubernetes/chart" \
  --namespace course --create-namespace --wait --timeout 90s
kubectl -n course get pods
```

Expect one ready Pod. The image pull policy is Never because we loaded the local image into the node. An ErrImageNeverPull points to image loading/naming, not a Go application bug.

### Break the Service selector

```sh
helm upgrade endpoint-lab "$LAB_ROOT/kubernetes/chart" -n course \
  --reuse-values --set serviceTarget=wrong
kubectl -n course get pods --show-labels
kubectl -n course get service endpoint-lab -o yaml
kubectl -n course get endpointslice \
  -l kubernetes.io/service-name=endpoint-lab -o yaml
```

The Pod can remain ready while the Service has no matching endpoints. Compare labels and the selector. Do not “fix” this by changing the application readiness function.

Repair the selector while introducing a different mistake:

```sh
helm upgrade endpoint-lab "$LAB_ROOT/kubernetes/chart" -n course \
  --reuse-values --set serviceTarget=endpoint-lab --set readinessPath=/missing
kubectl -n course rollout status deployment/endpoint-lab --timeout=15s
kubectl -n course get pods
kubectl -n course describe deployment endpoint-lab
```

The rollout-status command should time out; that is an intended observation. Inspect the new Pod's events with `kubectl -n course describe pod POD_NAME`. Its readiness requests receive 404. Liveness still succeeds at `/live`, so this does not itself cause restarts.

The chart permits one extra Pod and zero unavailable replicas. The old healthy Pod remains while the new one fails readiness. This is a **stalled rollout**, not necessarily a complete outage. Resource headroom is needed for the extra Pod; a cluster without it can stall for a different reason.

### Repair the configuration and observe replacement

```sh
helm upgrade endpoint-lab "$LAB_ROOT/kubernetes/chart" -n course \
  --reuse-values --set readinessPath=/ready --set version=second \
  --wait --timeout 90s
kubectl -n course rollout status deployment/endpoint-lab --timeout=90s
kubectl -n course get replicasets,pods
helm history endpoint-lab -n course
```

Helm renders templates and records release revisions. Kubernetes controllers perform the rollout. Inspect rendered YAML with `helm template` when debugging a chart; values are inputs, not the resulting resources. A successful Helm command without `--wait` does not prove the new Pods became ready.

### Watch a request during termination

Choose the currently running Pod and start a port-forward in one terminal:

```sh
POD=$(kubectl -n course get pods -l app=endpoint-lab \
  -o jsonpath='{.items[0].metadata.name}')
printf '%s\n' "$POD"
kubectl -n course port-forward "pod/$POD" 18081:8080
```

In a second terminal, export the same LAB_ROOT and KUBECONFIG, then run `kubectl -n course logs -f POD_NAME`. In a third, start:

```sh
curl --max-time 15 'http://127.0.0.1:18081/work?duration=5s'
```

After the log shows `work started`, delete that exact Pod from another terminal:

```sh
kubectl -n course delete pod POD_NAME --wait=false
```

The fixture logs shutdown starting, lets the in-flight handler finish, and logs shutdown completion. The request should return `work complete` if deletion occurs after it starts and before it finishes. The Deployment creates a replacement Pod. If you missed the five-second window, repeat with the replacement rather than interpreting an idle shutdown as a drain test.

The app's shutdown budget is 12 seconds and the Pod grace period is 15. A request exceeding those budgets can still be interrupted. Readiness/endpoint changes and process shutdown happen through different components; this one experiment does not prove zero dropped requests under all routing conditions.

### Clean up

Stop the log/port-forward commands with Ctrl-C, then:

```sh
helm uninstall endpoint-lab -n course
kind delete cluster --name vibe-course
unset KUBECONFIG
```

Deleting this named cluster removes its nodes. Keep unrelated clusters and Docker resources. No `docker system prune` is needed.

References: [Deployment rollout behavior](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/), [Pod termination](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/#pod-termination), [Helm upgrade](https://helm.sh/docs/helm/helm_upgrade/).
