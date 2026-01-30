## RBAC & Security

Kubernetes is designed to run in hostile environments -- multi-tenant clusters, public clouds, and CI/CD pipelines that deploy code written by dozens of teams. Security isn't optional. This module covers the three pillars: **who can access the cluster** (authentication), **what they can do** (authorization via RBAC), and **what Pods are allowed to do at runtime** (security contexts, Pod Security Standards, and network policies).

### Authentication vs Authorization

These two concepts are often confused. They answer different questions:

```
              ┌──────────────────┐        ┌──────────────────┐
              │  AUTHENTICATION  │        │  AUTHORIZATION   │
              │    (AuthN)       │        │    (AuthZ)       │
              │                  │        │                  │
              │  "WHO are you?"  │──────▶ │  "WHAT can you   │
              │                  │        │   do?"           │
              │  • X.509 certs   │        │                  │
              │  • Bearer tokens │        │  • RBAC (most    │
              │  • OIDC (Google, │        │    common)       │
              │    Azure AD)     │        │  • ABAC          │
              │  • Webhook       │        │  • Webhook       │
              └──────────────────┘        └──────────────────┘
```

**Authentication** -- Kubernetes does **not** manage users. There is no `kubectl create user` command. Instead, K8s trusts external identity providers:

- **X.509 client certificates** -- the kubeconfig on your machine typically has a client cert signed by the cluster CA. The Common Name (CN) becomes your username, and Organization (O) becomes your group.
- **Bearer tokens** -- static tokens, bootstrap tokens, or service account tokens.
- **OpenID Connect (OIDC)** -- integrate with Google, Azure AD, Okta, Keycloak. This is the production standard for human users.
- **Webhook token authentication** -- delegate to an external service.

**Authorization** -- once K8s knows who you are, it checks what you're allowed to do. RBAC (Role-Based Access Control) is the standard. The API Server flag `--authorization-mode=RBAC` enables it (on by default in all modern clusters).

> **Tip:** In interviews, the key distinction is: Kubernetes handles authorization (RBAC) natively, but delegates authentication to external systems. The one exception is ServiceAccounts -- those are Kubernetes-managed identities for Pods.

### ServiceAccounts

ServiceAccounts are the identity mechanism for **Pods**. While human users authenticate via certs or OIDC, Pods authenticate using ServiceAccount tokens.

Every namespace gets a `default` ServiceAccount automatically. Every Pod that doesn't specify one runs as `default`:

```bash
# See ServiceAccounts in your namespace
kubectl get serviceaccounts
# NAME      SECRETS   AGE
# default   0         30d

# Every namespace has one
kubectl get serviceaccounts -A | head -10
# NAMESPACE     NAME                                 SECRETS   AGE
# default       default                              0         30d
# kube-system   default                              0         30d
# kube-system   coredns                              0         30d
# kube-system   kube-proxy                           0         30d
```

#### Creating a ServiceAccount

*Create imperatively*

```bash
kubectl create serviceaccount app-sa
# serviceaccount/app-sa created

kubectl get serviceaccount app-sa -o yaml
```

*app-sa.yaml*

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: app-sa
  namespace: default
```

#### Assigning a ServiceAccount to a Pod

*pod-with-sa.yaml*

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: app-pod
spec:
  serviceAccountName: app-sa      # ← use our custom ServiceAccount
  containers:
  - name: app
    image: curlimages/curl:8.5.0
    command: ["sleep", "3600"]
```

```bash
kubectl apply -f pod-with-sa.yaml

# Verify which ServiceAccount the Pod is using
kubectl get pod app-pod -o jsonpath='{.spec.serviceAccountName}'
# app-sa
```

#### Token Mounting

By default, Kubernetes mounts a ServiceAccount token into every Pod at `/var/run/secrets/kubernetes.io/serviceaccount/`. This token lets the Pod authenticate to the API Server.

```bash
# See the mounted token inside a Pod
kubectl exec app-pod -- ls /var/run/secrets/kubernetes.io/serviceaccount/
# ca.crt
# namespace
# token

# The token is a JWT
kubectl exec app-pod -- cat /var/run/secrets/kubernetes.io/serviceaccount/token
# eyJhbGciOiJSUzI1NiIsImtpZCI6Ik... (long JWT string)
```

If your Pod does not need to talk to the Kubernetes API (most application Pods don't), disable the token mount to reduce your attack surface:

*pod-no-token.yaml*

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: app-no-token
spec:
  serviceAccountName: app-sa
  automountServiceAccountToken: false    # ← no token mounted
  containers:
  - name: app
    image: nginx:1.25
```

> **Gotcha:** The `default` ServiceAccount in every namespace has no special permissions by default. But if someone creates a RoleBinding granting permissions to `default`, every Pod in that namespace inherits those permissions. Never grant permissions to the `default` ServiceAccount -- always create dedicated ones.

#### Bound Service Account Tokens (K8s 1.22+)

Older Kubernetes versions mounted long-lived, non-expiring tokens. Since 1.22, tokens are **bound** -- they are time-limited (1 hour by default), audience-bound, and object-bound (tied to the specific Pod). The kubelet automatically rotates them before expiry.

```bash
# The TokenRequest API creates short-lived tokens
kubectl create token app-sa --duration=10m
# eyJhbGciOiJSUzI1NiIsImtpZCI6... (expires in 10 minutes)
```

> **Tip:** If you're running K8s 1.24+, long-lived ServiceAccount token Secrets are no longer auto-created. Use `kubectl create token` or the TokenRequest API for short-lived tokens. If you truly need a long-lived token (for external systems), you can still create one manually as a Secret -- but prefer short-lived tokens.

---

### RBAC Overview

RBAC controls **what actions** a user or ServiceAccount can perform on **which resources**. It uses four resource types that work in pairs:

```
   WHAT permissions?              WHO gets them?
   ┌────────────────┐            ┌─────────────────────┐
   │     Role       │◀───────────│    RoleBinding       │
   │  (namespace)   │            │  (namespace)         │
   │                │            │                      │
   │  "can get/list │            │  subjects:           │
   │   pods in      │            │  - user: jane        │
   │   default ns"  │            │  - sa: app-sa        │
   └────────────────┘            └─────────────────────┘

   ┌────────────────┐            ┌─────────────────────┐
   │  ClusterRole   │◀───────────│ ClusterRoleBinding   │
   │  (cluster-wide)│            │ (cluster-wide)       │
   │                │            │                      │
   │  "can get/list │            │  subjects:           │
   │   pods in ALL  │            │  - group: dev-team   │
   │   namespaces"  │            │  - sa: monitoring-sa │
   └────────────────┘            └─────────────────────┘
```

The four resources:

| Resource | Scope | Purpose |
|---|---|---|
| **Role** | Namespace | Defines permissions within a single namespace |
| **ClusterRole** | Cluster | Defines permissions across all namespaces (or for cluster-scoped resources like nodes) |
| **RoleBinding** | Namespace | Grants a Role (or ClusterRole) to subjects within a namespace |
| **ClusterRoleBinding** | Cluster | Grants a ClusterRole to subjects across the entire cluster |

> **Tip:** A RoleBinding can reference a ClusterRole. This is a powerful pattern -- define the permissions once as a ClusterRole, then use RoleBindings to grant those permissions in specific namespaces. More on this below.

---

### Roles and ClusterRoles

A Role is a list of **rules**. Each rule specifies which API groups, resources, and verbs are allowed.

#### Role YAML

*read-pods-role.yaml*

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: pod-reader
  namespace: default
rules:
- apiGroups: [""]              # "" = core API group (v1)
  resources: ["pods"]
  verbs: ["get", "list", "watch"]
```

Let's break down the fields:

- **apiGroups** -- the API group the resource belongs to. `""` is the core group (Pods, Services, ConfigMaps). `"apps"` is for Deployments, ReplicaSets. `"batch"` is for Jobs, CronJobs.
- **resources** -- which resource types: `pods`, `deployments`, `services`, `secrets`, etc.
- **verbs** -- what actions are allowed:

| Verb | HTTP Method | What it does |
|---|---|---|
| `get` | GET (single) | Read one resource |
| `list` | GET (collection) | List all resources |
| `watch` | GET (streaming) | Watch for changes |
| `create` | POST | Create a resource |
| `update` | PUT | Replace a resource |
| `patch` | PATCH | Partially update |
| `delete` | DELETE | Delete a resource |
| `deletecollection` | DELETE (collection) | Delete multiple resources |

#### More Role Examples

*deployment-manager-role.yaml -- can manage deployments and their pods*

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: deployment-manager
  namespace: default
rules:
- apiGroups: ["apps"]
  resources: ["deployments"]
  verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
- apiGroups: [""]
  resources: ["pods"]
  verbs: ["get", "list", "watch"]
- apiGroups: [""]
  resources: ["pods/log"]          # sub-resource: can read pod logs
  verbs: ["get"]
```

*secret-reader-role.yaml -- read-only access to secrets*

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: secret-reader
  namespace: default
rules:
- apiGroups: [""]
  resources: ["secrets"]
  verbs: ["get", "list"]
```

#### ClusterRole YAML

A ClusterRole works the same way but is **not namespaced**. Use it for:
- Permissions across all namespaces
- Cluster-scoped resources (nodes, namespaces, PersistentVolumes)
- Non-resource URLs (`/healthz`, `/metrics`)

*node-viewer-clusterrole.yaml*

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: node-viewer
  # no namespace -- ClusterRoles are cluster-scoped
rules:
- apiGroups: [""]
  resources: ["nodes"]
  verbs: ["get", "list", "watch"]
```

#### Built-in ClusterRoles

Kubernetes ships with several pre-defined ClusterRoles. These cover the most common use cases:

```bash
kubectl get clusterroles | grep -E "^(cluster-admin|admin|edit|view) "
# NAME            CREATED AT
# admin           2024-01-15T10:00:00Z
# cluster-admin   2024-01-15T10:00:00Z
# edit            2024-01-15T10:00:00Z
# view            2024-01-15T10:00:00Z
```

| ClusterRole | What it grants |
|---|---|
| **cluster-admin** | Full access to everything. Equivalent to root. Use sparingly. |
| **admin** | Full access within a namespace (Roles, RoleBindings, all resources). No access to namespace itself or resource quotas. |
| **edit** | Read/write to most resources in a namespace. No access to Roles or RoleBindings. |
| **view** | Read-only to most resources. Cannot view Secrets, Roles, or RoleBindings. |

```bash
# See what the "view" ClusterRole allows
kubectl describe clusterrole view
# Name:         view
# PolicyRule:
#   Resources                                    Verbs
#   ---------                                    -----
#   configmaps                                   [get list watch]
#   endpoints                                    [get list watch]
#   persistentvolumeclaims                       [get list watch]
#   pods                                         [get list watch]
#   services                                     [get list watch]
#   deployments.apps                             [get list watch]
#   ...
```

> **Gotcha:** The `view` ClusterRole intentionally excludes Secrets. This is a security decision -- read-only users shouldn't be able to see passwords and API keys. If you need to grant Secret access, create a custom Role.

---

### RoleBindings and ClusterRoleBindings

A Role by itself does nothing. You need a **binding** to connect it to a subject (User, Group, or ServiceAccount).

#### RoleBinding YAML

*pod-reader-binding.yaml -- bind the pod-reader Role to a ServiceAccount*

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: read-pods-binding
  namespace: default
subjects:
- kind: ServiceAccount
  name: app-sa
  namespace: default
roleRef:
  kind: Role
  name: pod-reader
  apiGroup: rbac.authorization.k8s.io
```

The `subjects` field accepts three kinds:

```yaml
# A specific user (identified by certificate CN or OIDC claim)
subjects:
- kind: User
  name: jane
  apiGroup: rbac.authorization.k8s.io

# A group (certificate O field or OIDC group claim)
- kind: Group
  name: dev-team
  apiGroup: rbac.authorization.k8s.io

# A ServiceAccount (Kubernetes-managed identity)
- kind: ServiceAccount
  name: app-sa
  namespace: default          # required for ServiceAccounts
```

#### ClusterRoleBinding YAML

*cluster-admin-binding.yaml -- grant cluster-admin to a user (dangerous!)*

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: admin-binding
subjects:
- kind: User
  name: jane
  apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: ClusterRole
  name: cluster-admin
  apiGroup: rbac.authorization.k8s.io
```

#### The ClusterRole + RoleBinding Pattern

This is the most important RBAC pattern and a common interview question. You can bind a **ClusterRole** using a **RoleBinding** to scope it to a single namespace:

```
   ClusterRole: "pod-reader"          RoleBinding (namespace: staging)
   ┌───────────────────────┐          ┌────────────────────────────┐
   │ rules:                │◀─────────│ roleRef: pod-reader        │
   │ - resources: [pods]   │          │ subjects: [sa: deploy-bot] │
   │   verbs: [get, list]  │          │ namespace: staging         │
   │                       │          └────────────────────────────┘
   │ (defined once,        │
   │  cluster-wide)        │          RoleBinding (namespace: prod)
   │                       │          ┌────────────────────────────┐
   │                       │◀─────────│ roleRef: pod-reader        │
   │                       │          │ subjects: [sa: deploy-bot] │
   └───────────────────────┘          │ namespace: prod            │
                                      └────────────────────────────┘
```

*clusterrole-with-rolebinding.yaml*

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: staging-pod-reader
  namespace: staging               # ← scoped to staging namespace only
subjects:
- kind: ServiceAccount
  name: deploy-bot
  namespace: staging
roleRef:
  kind: ClusterRole                # ← referencing a ClusterRole, not a Role
  name: pod-reader
  apiGroup: rbac.authorization.k8s.io
```

This grants `deploy-bot` the `pod-reader` permissions, but **only in the `staging` namespace**. The same ClusterRole can be reused across many namespaces without duplicating Role definitions.

> **Tip:** This pattern is the recommended approach in multi-team clusters. Define permissions once as ClusterRoles, then use RoleBindings to grant them per namespace. It reduces duplication and makes auditing easier.

#### Creating Bindings Imperatively

```bash
# Bind a Role to a ServiceAccount
kubectl create rolebinding read-pods \
  --role=pod-reader \
  --serviceaccount=default:app-sa \
  --namespace=default
# rolebinding.rbac.authorization.k8s.io/read-pods created

# Bind a ClusterRole to a user cluster-wide
kubectl create clusterrolebinding jane-admin \
  --clusterrole=cluster-admin \
  --user=jane
# clusterrolebinding.rbac.authorization.k8s.io/jane-admin created

# Bind a ClusterRole to a ServiceAccount in a specific namespace
kubectl create rolebinding staging-view \
  --clusterrole=view \
  --serviceaccount=staging:deploy-bot \
  --namespace=staging
# rolebinding.rbac.authorization.k8s.io/staging-view created
```

---

### Testing Permissions

The `kubectl auth can-i` command is essential for verifying RBAC rules. It tells you whether a given action is allowed.

#### Check Your Own Permissions

```bash
# Can I create deployments in the default namespace?
kubectl auth can-i create deployments
# yes

# Can I delete nodes?
kubectl auth can-i delete nodes
# yes  (if you're cluster-admin on a local cluster)

# Can I create pods in the "production" namespace?
kubectl auth can-i create pods --namespace=production
# no
```

#### Impersonate Another Identity

Use `--as` to check what another user or ServiceAccount can do. This is invaluable for debugging RBAC issues.

```bash
# What can the app-sa ServiceAccount do?
kubectl auth can-i get pods --as=system:serviceaccount:default:app-sa
# yes  (if we created the RoleBinding above)

kubectl auth can-i create deployments --as=system:serviceaccount:default:app-sa
# no

kubectl auth can-i delete secrets --as=system:serviceaccount:default:app-sa
# no

# Check a user
kubectl auth can-i get pods --as=jane
# yes

# Check a group
kubectl auth can-i get pods --as-group=dev-team --as=fake-user
# yes
```

> **Gotcha:** The `--as` format for ServiceAccounts is `system:serviceaccount:<namespace>:<name>`. Forgetting the `system:serviceaccount:` prefix is a common mistake -- it won't error, but it will check for a user by that name instead.

#### List All Permissions

```bash
# List everything you can do
kubectl auth can-i --list
# Resources                          Non-Resource URLs   Resource Names   Verbs
# *.*                                []                  []               [*]
# ...

# List what a ServiceAccount can do
kubectl auth can-i --list --as=system:serviceaccount:default:app-sa
# Resources                          Non-Resource URLs   Resource Names   Verbs
# pods                               []                  []               [get list watch]
# ...
```

#### Debugging RBAC Denials

When a request is denied, the API Server returns a 403 with a message like:

```
Error from server (Forbidden): pods is forbidden: User "system:serviceaccount:default:app-sa"
cannot list resource "pods" in API group "" in the namespace "kube-system"
```

This tells you exactly: **who** was denied, **what action** on **which resource**, in **which namespace**. Use this to write the missing Role and RoleBinding.

---

### Security Contexts

Security contexts control **what a container is allowed to do at the OS level**. They are set in the Pod spec and apply either at the Pod level or per container.

#### Pod-Level vs Container-Level

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: secure-pod
spec:
  securityContext:                   # ← Pod-level (applies to all containers)
    runAsNonRoot: true
    runAsUser: 1000
    runAsGroup: 3000
    fsGroup: 2000                    # group for mounted volumes
  containers:
  - name: app
    image: nginx:1.25
    securityContext:                  # ← Container-level (overrides pod-level)
      allowPrivilegeEscalation: false
      readOnlyRootFilesystem: true
      capabilities:
        drop:
          - ALL                      # drop all Linux capabilities
```

#### Key Security Context Fields

| Field | Level | What it does |
|---|---|---|
| `runAsNonRoot: true` | Pod/Container | Blocks the container from running as UID 0 (root) |
| `runAsUser: 1000` | Pod/Container | Runs the container as the specified UID |
| `runAsGroup: 3000` | Pod/Container | Sets the primary GID |
| `fsGroup: 2000` | Pod | Sets the group for all mounted volumes |
| `readOnlyRootFilesystem: true` | Container | Makes the root filesystem read-only |
| `allowPrivilegeEscalation: false` | Container | Prevents gaining more privileges than the parent process |
| `capabilities.drop: ["ALL"]` | Container | Drops all Linux capabilities |
| `capabilities.add: ["NET_BIND_SERVICE"]` | Container | Adds back specific capabilities |

#### Hardened Pod Example

This is the minimum security context you should use for any production workload:

*hardened-pod.yaml*

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: hardened-app
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
    runAsGroup: 1000
    fsGroup: 1000
    seccompProfile:
      type: RuntimeDefault          # use the container runtime's default seccomp profile
  containers:
  - name: app
    image: myapp:v1
    securityContext:
      allowPrivilegeEscalation: false
      readOnlyRootFilesystem: true
      capabilities:
        drop:
          - ALL
    volumeMounts:
    - name: tmp
      mountPath: /tmp               # writable temp directory
  volumes:
  - name: tmp
    emptyDir: {}                    # since rootFS is read-only, use emptyDir for writes
```

```bash
kubectl apply -f hardened-pod.yaml

# Verify the user
kubectl exec hardened-app -- id
# uid=1000 gid=1000 groups=1000

# Verify read-only filesystem
kubectl exec hardened-app -- touch /etc/test
# touch: /etc/test: Read-only file system

# Verify /tmp is writable
kubectl exec hardened-app -- touch /tmp/test
# (no error -- emptyDir is writable)
```

> **Tip:** `readOnlyRootFilesystem: true` breaks many applications that write to `/tmp` or `/var/cache`. The fix is to mount an `emptyDir` volume at those paths. This is a best practice -- it limits what an attacker can write if they compromise the container.

---

### Pod Security Standards (PSS)

Pod Security Standards replaced the deprecated PodSecurityPolicies (removed in K8s 1.25). They are enforced by the built-in **Pod Security Admission** controller.

#### Three Levels

| Level | Description | Use case |
|---|---|---|
| **Privileged** | No restrictions at all | System-level workloads (CNI, storage drivers) |
| **Baseline** | Blocks known privilege escalations | General-purpose workloads |
| **Restricted** | Heavily restricted, follows hardening best practices | Security-sensitive workloads |

The **Restricted** level enforces:
- Must run as non-root
- Must drop ALL capabilities
- Must not allow privilege escalation
- Must use a read-only root filesystem (recommended but not required)
- Must set a seccomp profile

#### Enforcement Modes

Pod Security Standards are applied to **namespaces** via labels. Each namespace can have three modes:

| Mode | What happens |
|---|---|
| `enforce` | Pods that violate the standard are **rejected** |
| `audit` | Violations are logged to the audit log but allowed |
| `warn` | Violations trigger a warning to the user but are allowed |

#### Labeling a Namespace

*restricted-namespace.yaml*

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: secure-apps
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/enforce-version: latest
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/warn: restricted
```

```bash
kubectl apply -f restricted-namespace.yaml
# namespace/secure-apps created

# Try to create a privileged Pod in this namespace
kubectl run test --image=nginx:1.25 -n secure-apps
# Error from server (Forbidden): pods "test" is forbidden: violates PodSecurity
# "restricted:latest": allowPrivilegeEscalation != false
# (container "test" must set securityContext.allowPrivilegeEscalation=false),
# unrestricted capabilities (container "test" must set
# securityContext.capabilities.drop=["ALL"]), runAsNonRoot != true (pod or
# container "test" must set securityContext.runAsNonRoot=true), seccompProfile
# (pod or container "test" must set securityContext.seccompProfile.type to
# "RuntimeDefault" or "Localhost")
```

The error message tells you exactly what's missing. Fix your Pod spec to comply:

```bash
# A compliant Pod in a restricted namespace
kubectl run test --image=nginx:1.25 -n secure-apps \
  --overrides='{
    "spec": {
      "securityContext": {
        "runAsNonRoot": true,
        "runAsUser": 1000,
        "seccompProfile": {"type": "RuntimeDefault"}
      },
      "containers": [{
        "name": "test",
        "image": "nginx:1.25",
        "securityContext": {
          "allowPrivilegeEscalation": false,
          "capabilities": {"drop": ["ALL"]}
        }
      }]
    }
  }'
# pod/test created
```

> **Tip:** Start with `warn` mode to see what would break, then move to `enforce` once your workloads are compliant. Apply `audit` alongside `enforce` to catch violations in CI/CD pipelines that bypass namespace labels.

#### Labeling Existing Namespaces

```bash
# Add baseline enforcement to an existing namespace
kubectl label namespace default \
  pod-security.kubernetes.io/enforce=baseline \
  pod-security.kubernetes.io/warn=restricted

# Check namespace labels
kubectl get namespace default --show-labels
# NAME      STATUS   AGE   LABELS
# default   Active   30d   pod-security.kubernetes.io/enforce=baseline,...

# Remove enforcement
kubectl label namespace default \
  pod-security.kubernetes.io/enforce-
# namespace/default unlabeled
```

---

### Network Policies

By default, Kubernetes allows **all Pods to communicate with all other Pods** in the cluster. Network Policies act as a firewall for Pod-to-Pod traffic.

```
   WITHOUT NetworkPolicy:           WITH NetworkPolicy:
   ┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
   │  Pod A  │◀───▶│  Pod B  │     │  Pod A  │◀───▶│  Pod B  │
   └────┬────┘     └────┬────┘     └────┬────┘     └─────────┘
        │               │               │
        ▼               ▼               ✗ (blocked by policy)
   ┌─────────┐     ┌─────────┐     ┌─────────┐
   │  Pod C  │◀───▶│  Pod D  │     │  Pod C  │
   └─────────┘     └─────────┘     └─────────┘
```

> **Gotcha:** NetworkPolicy requires a CNI plugin that supports it. **Calico**, **Cilium**, and **Weave** support NetworkPolicy. The default `kubenet` and AWS VPC CNI (without additional config) do **not**. If your CNI doesn't support it, NetworkPolicy resources are silently ignored -- no error, no enforcement.

#### Default Deny All Ingress

The first NetworkPolicy you should apply to any namespace is a default deny. This blocks all incoming traffic unless explicitly allowed.

*deny-all-ingress.yaml*

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-all-ingress
  namespace: default
spec:
  podSelector: {}                # applies to ALL pods in the namespace
  policyTypes:
  - Ingress                      # only affects incoming traffic
  # no ingress rules = deny all ingress
```

```bash
kubectl apply -f deny-all-ingress.yaml
# networkpolicy.networking.k8s.io/deny-all-ingress created
```

#### Allow Specific Traffic

*allow-frontend-to-backend.yaml*

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-frontend-to-backend
  namespace: default
spec:
  podSelector:
    matchLabels:
      app: backend               # this policy applies to backend Pods
  policyTypes:
  - Ingress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: frontend          # only frontend Pods can reach backend
    ports:
    - protocol: TCP
      port: 8080                 # only on port 8080
```

#### Deny All Egress (Lockdown)

*deny-all-egress.yaml*

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-all-egress
  namespace: default
spec:
  podSelector: {}
  policyTypes:
  - Egress
  egress:
  - to:                          # allow DNS resolution (required)
    - namespaceSelector: {}
      podSelector:
        matchLabels:
          k8s-app: kube-dns
    ports:
    - protocol: UDP
      port: 53
    - protocol: TCP
      port: 53
```

> **Tip:** When you deny all egress, you must explicitly allow DNS (port 53 to kube-dns). Otherwise, your Pods can't resolve any service names and will appear to have no network connectivity at all.

```bash
# List NetworkPolicies
kubectl get networkpolicies
# NAME                        POD-SELECTOR   AGE
# deny-all-ingress            <none>         5m
# allow-frontend-to-backend   app=backend    3m

# Describe for details
kubectl describe networkpolicy allow-frontend-to-backend
# Name:         allow-frontend-to-backend
# Namespace:    default
# Spec:
#   PodSelector:     app=backend
#   Allowing ingress traffic:
#     To Port: 8080/TCP
#     From:
#       PodSelector: app=frontend
#   Not affecting egress traffic
```

---

### Hands-On: ServiceAccount with Limited RBAC Permissions

Let's put it all together. We'll create a ServiceAccount that can only read Pods and ConfigMaps, deploy a Pod using it, and verify the permissions work.

#### Step 1: Create the ServiceAccount

```bash
kubectl create serviceaccount readonly-sa
# serviceaccount/readonly-sa created
```

#### Step 2: Create a Role with Limited Permissions

*readonly-role.yaml*

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: readonly-role
  namespace: default
rules:
- apiGroups: [""]
  resources: ["pods", "configmaps"]
  verbs: ["get", "list"]
```

```bash
kubectl apply -f readonly-role.yaml
# role.rbac.authorization.k8s.io/readonly-role created
```

#### Step 3: Bind the Role to the ServiceAccount

*readonly-binding.yaml*

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: readonly-binding
  namespace: default
subjects:
- kind: ServiceAccount
  name: readonly-sa
  namespace: default
roleRef:
  kind: Role
  name: readonly-role
  apiGroup: rbac.authorization.k8s.io
```

```bash
kubectl apply -f readonly-binding.yaml
# rolebinding.rbac.authorization.k8s.io/readonly-binding created
```

#### Step 4: Verify Permissions Before Deploying

```bash
# Check what readonly-sa can do
kubectl auth can-i get pods --as=system:serviceaccount:default:readonly-sa
# yes

kubectl auth can-i list configmaps --as=system:serviceaccount:default:readonly-sa
# yes

kubectl auth can-i create pods --as=system:serviceaccount:default:readonly-sa
# no

kubectl auth can-i delete pods --as=system:serviceaccount:default:readonly-sa
# no

kubectl auth can-i get secrets --as=system:serviceaccount:default:readonly-sa
# no

kubectl auth can-i list pods --as=system:serviceaccount:default:readonly-sa -n kube-system
# no  (Role is scoped to default namespace only)
```

#### Step 5: Deploy a Pod Using the ServiceAccount

*test-rbac-pod.yaml*

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: rbac-test
spec:
  serviceAccountName: readonly-sa
  containers:
  - name: kubectl
    image: bitnami/kubectl:1.28
    command: ["sleep", "3600"]
```

```bash
kubectl apply -f test-rbac-pod.yaml
# pod/rbac-test created

kubectl exec rbac-test -- kubectl get pods
# NAME        READY   STATUS    RESTARTS   AGE
# rbac-test   1/1     Running   0          30s

kubectl exec rbac-test -- kubectl get configmaps
# NAME               DATA   AGE
# kube-root-ca.crt   1      30d

# These should fail:
kubectl exec rbac-test -- kubectl get secrets
# Error from server (Forbidden): secrets is forbidden: User
# "system:serviceaccount:default:readonly-sa" cannot list resource
# "secrets" in API group "" in the namespace "default"

kubectl exec rbac-test -- kubectl create configmap test --from-literal=key=value
# Error from server (Forbidden): configmaps is forbidden: User
# "system:serviceaccount:default:readonly-sa" cannot create resource
# "configmaps" in API group "" in the namespace "default"

kubectl exec rbac-test -- kubectl get pods -n kube-system
# Error from server (Forbidden): pods is forbidden: User
# "system:serviceaccount:default:readonly-sa" cannot list resource
# "pods" in API group "" in the namespace "kube-system"
```

The ServiceAccount can read Pods and ConfigMaps in the `default` namespace -- nothing more.

#### Cleanup

```bash
kubectl delete pod rbac-test
kubectl delete rolebinding readonly-binding
kubectl delete role readonly-role
kubectl delete serviceaccount readonly-sa
```

---

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

## Module 11 Summary

- **Authentication vs Authorization** -- K8s doesn't manage users; it trusts external identity (certs, OIDC tokens). Authorization is handled by RBAC. ServiceAccounts are the only K8s-managed identities.
- **ServiceAccounts** -- every Pod runs as a ServiceAccount (default: `default`). Create custom ones with `kubectl create serviceaccount`. Disable token auto-mounting with `automountServiceAccountToken: false` when the Pod doesn't need API access.
- **Bound tokens (1.22+)** -- ServiceAccount tokens are now time-limited, audience-bound, and auto-rotated. Prefer `kubectl create token` over long-lived Secrets.
- **RBAC has four resources** -- Role (namespace permissions), ClusterRole (cluster permissions), RoleBinding (grants within a namespace), ClusterRoleBinding (grants cluster-wide).
- **Roles define rules** -- each rule specifies apiGroups, resources, and verbs (get, list, watch, create, update, patch, delete).
- **ClusterRole + RoleBinding pattern** -- define permissions once as a ClusterRole, then use RoleBindings to grant them in specific namespaces. This is the recommended multi-team approach.
- **Built-in ClusterRoles** -- `cluster-admin` (full access), `admin` (namespace admin), `edit` (read/write), `view` (read-only, no secrets).
- **`kubectl auth can-i`** -- test permissions for yourself or impersonate others with `--as=system:serviceaccount:<ns>:<name>`.
- **Security Contexts** -- set `runAsNonRoot: true`, `readOnlyRootFilesystem: true`, `allowPrivilegeEscalation: false`, and `capabilities.drop: ["ALL"]` on every production workload.
- **Pod Security Standards** -- three levels (Privileged, Baseline, Restricted) enforced via namespace labels. Start with `warn`, then move to `enforce`.
- **Network Policies** -- default is allow-all. Apply a default deny-all-ingress first, then whitelist specific traffic. Requires a supporting CNI (Calico, Cilium).
- **Principle of least privilege** -- create dedicated ServiceAccounts per application, grant only the permissions needed, and always verify with `kubectl auth can-i`.
