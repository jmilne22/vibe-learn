## Follow a request to a Pod

A deployment exists, its container is running, and the application works when reached directly. Yet requests through the Service fail. Before changing timeouts, trace the route and ask which link has evidence behind it.

```text
client -> service name -> Service -> eligible endpoint -> Pod IP:port -> process
```

This is a logical path, not a claim that a Service is a proxy process through which every packet physically passes. The implementation can use kube-proxy or another networking dataplane.

### Keep the objects separate

A **Pod** is the scheduling unit containing one or more containers. A **Deployment** describes the desired replica count and Pod template, managing ReplicaSets to roll out changes. A **Service** selects a set of Pods and provides a stable way to reach them. A running Pod is not automatically a Service endpoint.

Labels connect these objects. If a Service selects `app: api` while the Pods have `app: endpoint-lab`, the selector matches nothing. Reinstalling the image cannot repair that mismatch.

```sh
kubectl -n course get pods --show-labels
kubectl -n course get service endpoint-lab -o yaml
kubectl -n course get endpointslice -l kubernetes.io/service-name=endpoint-lab -o yaml
```

Inspect the selector, target port, endpoint addresses, and endpoint readiness. An EndpointSlice with no usable ready endpoint sends your investigation toward selection/readiness. An application 503 from a reachable endpoint sends it toward application behavior. A name-resolution failure is another branch entirely.

Inside the cluster, the name `endpoint-lab.course.svc.cluster.local` identifies our Service using the usual cluster domain. A cluster can use another domain. A short name like `endpoint-lab` is resolved using the client's namespace and DNS search configuration; the same short name from another namespace may mean something else.

### Use observations that distinguish causes

`kubectl get pods` is a summary. `describe pod` shows scheduling/probe events. `logs` shows what the container wrote; `logs --previous` can reveal the previous crashed container. None alone proves the full request path works.

`kubectl port-forward service/...` selects a backing Pod and forwards to it. It does **not** exercise the normal cluster Service dataplane or DNS path. It is useful for inspecting the application, but a successful port-forward is not proof that cluster routing works. In the lab, use EndpointSlices to examine Service selection and port-forward only to reach the chosen application.

### Requests and limits answer different questions

A CPU request influences placement and the resource share the workload asks for. A CPU limit can throttle execution. Memory requests inform scheduling; exceeding a memory limit can lead to an OOM kill. None of these settings fixes a leak or an unbounded queue.

A Pending Pod might be unschedulable because its requests do not fit. A Running Pod might still be unready. A restarted container might have been killed for memory or failed its liveness probe. Read the reason and events before choosing a fix.

### Three probes, three decisions

- **Startup:** has initialization completed? When configured, it delays the other probes until it succeeds.
- **Readiness:** should this Pod currently receive Service traffic?
- **Liveness:** should kubelet restart this container because it appears stuck?

Readiness failures do not by themselves restart containers. A bad readiness path can leave a healthy process excluded from traffic. An overly broad liveness check can restart every replica during a shared dependency outage.

Reference: [Kubernetes probes](https://kubernetes.io/docs/concepts/workloads/pods/probes/), [Services](https://kubernetes.io/docs/concepts/services-networking/service/), and [resource management](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/).
