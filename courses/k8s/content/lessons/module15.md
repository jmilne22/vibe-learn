## Helm Fundamentals

After 14 modules of writing raw YAML manifests, you've felt the pain. A single microservice might need a Deployment, Service, ConfigMap, Secret, Ingress, ServiceAccount, and HPA — seven files, each referencing the same app name, image tag, and labels. Multiply that by ten services, and you have seventy YAML files to keep in sync. Change a label? Update it in dozens of places. Deploy to staging vs production? Copy-paste and hope you changed every value.

Helm exists to solve this.

### What Helm Solves

Helm is the **package manager for Kubernetes** — think `apt` for Debian or `brew` for macOS, but for Kubernetes manifests. It solves three fundamental problems:

**1. Templating** — Instead of hardcoding values in YAML, you use Go templates with variables. One template, many configurations:

```yaml
# Without Helm: hardcoded values everywhere
replicas: 3
image: myapp:v1.2.3
host: myapp.prod.example.com

# With Helm: variables you can override
replicas: {{ .Values.replicaCount }}
image: {{ .Values.image.repository }}:{{ .Values.image.tag }}
host: {{ .Values.ingress.host }}
```

**2. Packaging** — A Helm chart bundles all related Kubernetes resources (Deployment, Service, ConfigMap, Ingress, etc.) into a single versioned package. Install an entire application stack with one command instead of applying a dozen YAML files in the right order.

**3. Release Management** — Helm tracks what you installed, when, and with what configuration. You can upgrade to a new version, roll back to a previous version, and see the full history of changes — all without manually tracking which YAML files changed.

> **Tip:** You don't have to write your own charts to benefit from Helm. Thousands of community charts exist for databases, monitoring stacks, ingress controllers, and more. `helm install` gets you a production-ready PostgreSQL, Redis, or Prometheus in seconds.

### Helm Concepts

Four concepts form the foundation of Helm:

**Chart** — A package of Kubernetes resource templates plus default values. A chart contains everything needed to deploy an application: templates for Deployments, Services, ConfigMaps, and a `values.yaml` file with defaults. Think of it as a blueprint.

**Release** — An installed instance of a chart on a cluster. You can install the same chart multiple times with different names and different values. For example, install the PostgreSQL chart twice — once as `orders-db` and once as `users-db` — each with different storage sizes and credentials.

**Repository** — A server where charts are stored and shared. Like `apt` repositories or npm registries. You add a repo, search it, and install charts from it.

**Values** — The configuration that customizes a chart for a specific deployment. Default values live in the chart's `values.yaml`. You override them at install time with `--set` flags or your own values file.

```
┌─────────────────────────────────────────────────────┐
│                   How Helm Works                     │
│                                                      │
│   Chart (templates + defaults)                       │
│       +                                              │
│   Values (your overrides)                            │
│       ↓                                              │
│   helm install / upgrade                             │
│       ↓                                              │
│   Rendered YAML manifests                            │
│       ↓                                              │
│   Applied to Kubernetes API Server                   │
│       ↓                                              │
│   Release (tracked with revision history)            │
│                                                      │
└─────────────────────────────────────────────────────┘
```

### Helm 3 Architecture

Helm 2 had a server-side component called **Tiller** that ran inside the cluster with broad permissions — a security concern. Helm 3 removed Tiller entirely. Now Helm talks directly to the Kubernetes API Server using your kubeconfig credentials, just like kubectl.

Release information is stored as Kubernetes Secrets in the release's namespace (by default), so there's nothing extra to deploy or manage.

> **Gotcha:** If you find old blog posts or tutorials mentioning `helm init` or Tiller, they're Helm 2 era. Helm 3 requires no initialization — just install the binary and go.

### Installing Helm

*macOS*

```bash
brew install helm
```

*Linux*

```bash
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
```

*Verify installation*

```bash
helm version
# version.BuildInfo{Version:"v3.16.3", GitCommit:"...", GitTreeState:"clean", GoVersion:"go1.22.7"}
```

Helm uses your existing kubeconfig, so if `kubectl` works, Helm works too — no additional configuration needed.

```bash
# Confirm Helm can talk to your cluster
helm list
# NAME    NAMESPACE    REVISION    UPDATED    STATUS    CHART    APP VERSION
```

An empty table is expected — you haven't installed anything yet.

### Using Helm Repositories

Before you can install charts, you need to add a repository. The most popular public repository is Bitnami.

*Add a repository*

```bash
helm repo add bitnami https://charts.bitnami.com/bitnami
# "bitnami" has been added to your repositories
```

*Update repository index*

```bash
helm repo update
# Hang tight while we grab the latest from your chart repositories...
# ...Successfully got an update from the "bitnami" chart repository
# Update Complete. ⎈Happy Helming!⎈
```

*List your repositories*

```bash
helm repo list
# NAME       URL
# bitnami    https://charts.bitnami.com/bitnami
```

*Search for charts in your repos*

```bash
helm search repo nginx
# NAME                                    CHART VERSION   APP VERSION   DESCRIPTION
# bitnami/nginx                           18.2.4          1.27.2        NGINX Open Source is a web server...
# bitnami/nginx-ingress-controller        11.4.3          1.11.3        NGINX Ingress Controller is...
# bitnami/nginx-intel                     2.1.15          0.4.9         DEPRECATED NGINX Open Source...
```

*Search Artifact Hub (all public charts)*

```bash
helm search hub wordpress
# URL                                                 CHART VERSION   APP VERSION   DESCRIPTION
# https://artifacthub.io/packages/helm/bitnami/...    24.0.4          6.7.1         WordPress is the world's most...
# https://artifacthub.io/packages/helm/wordpress/...  1.3.0           6.4.0         A Helm chart for WordPress...
```

> **Tip:** `helm search repo` searches repos you've added locally. `helm search hub` searches the public Artifact Hub (artifacthub.io) — a directory of thousands of Helm charts from many publishers. Use the Hub to discover, then add the specific repo to install.

*Remove a repository*

```bash
helm repo remove bitnami
# "bitnami" has been removed from your repositories
```

### Installing Charts

The basic install command takes a release name and a chart reference:

*Basic install*

```bash
helm install my-nginx bitnami/nginx
# NAME: my-nginx
# LAST DEPLOYED: Fri Jan 31 10:00:00 2026
# NAMESPACE: default
# STATUS: deployed
# REVISION: 1
# TEST SUITE: None
# NOTES:
# CHART NAME: nginx
# CHART VERSION: 18.2.4
# APP VERSION: 1.27.2
#
# ** Please be patient while the chart is being deployed **
# ...
# (install notes with instructions to access the service)
```

The release name (`my-nginx`) is how you refer to this installation for upgrades, rollbacks, and uninstall. The chart reference (`bitnami/nginx`) tells Helm which repository and chart to use.

*Install into a specific namespace (create it if needed)*

```bash
helm install my-nginx bitnami/nginx \
  --namespace web \
  --create-namespace
# NAME: my-nginx
# NAMESPACE: web
# STATUS: deployed
# REVISION: 1
```

*Install with value overrides from a file*

```bash
helm install my-nginx bitnami/nginx -f custom-values.yaml
```

*Install with inline value overrides*

```bash
helm install my-nginx bitnami/nginx --set replicaCount=3
```

*Combine file and inline overrides*

```bash
helm install my-nginx bitnami/nginx \
  -f custom-values.yaml \
  --set replicaCount=3 \
  --set service.type=ClusterIP
```

After installing, check what Kubernetes resources were created:

```bash
kubectl get all -l app.kubernetes.io/instance=my-nginx
# NAME                            READY   STATUS    RESTARTS   AGE
# pod/my-nginx-5d4b8c6f5-x7k2q   1/1     Running   0          45s
#
# NAME               TYPE           CLUSTER-IP      EXTERNAL-IP   PORT(S)        AGE
# service/my-nginx   LoadBalancer   10.96.142.201   <pending>     80:31234/TCP   45s
#
# NAME                       READY   UP-TO-DATE   AVAILABLE   AGE
# deployment.apps/my-nginx   1/1     1            1           45s
#
# NAME                                  DESIRED   CURRENT   READY   AGE
# replicaset.apps/my-nginx-5d4b8c6f5   1         1         1       45s
```

### Dry Run and Debugging

Before installing or upgrading, preview what Helm will do:

*Dry run — simulate the install without touching the cluster*

```bash
helm install my-nginx bitnami/nginx --dry-run
# NAME: my-nginx
# LAST DEPLOYED: Fri Jan 31 10:00:00 2026
# NAMESPACE: default
# STATUS: pending-install
# REVISION: 1
# (full rendered YAML output follows)
```

*Dry run with debug — maximum detail*

```bash
helm install my-nginx bitnami/nginx --dry-run --debug
# install.go:222: [debug] Original chart version: ""
# install.go:239: [debug] CHART PATH: /home/user/.cache/helm/repository/nginx-18.2.4.tgz
# ...
# (computed values, rendered templates, and hooks)
```

> **Tip:** Always run `--dry-run` before a production upgrade. It catches template rendering errors and shows you exactly what YAML will be applied. Pair it with `--debug` to see the resolved values and chart path.

### Managing Releases

Once charts are installed, Helm gives you full lifecycle management.

*List installed releases*

```bash
helm list
# NAME       NAMESPACE   REVISION   UPDATED                                STATUS     CHART          APP VERSION
# my-nginx   default     1          2026-01-31 10:00:00.123456 +0000 UTC   deployed   nginx-18.2.4   1.27.2

helm list --all-namespaces
# NAME       NAMESPACE   REVISION   UPDATED                                STATUS     CHART          APP VERSION
# my-nginx   default     1          2026-01-31 10:00:00.123456 +0000 UTC   deployed   nginx-18.2.4   1.27.2
# my-redis   databases   1          2026-01-31 09:30:00.654321 +0000 UTC   deployed   redis-20.2.1   7.4.1
```

*Check release status*

```bash
helm status my-nginx
# NAME: my-nginx
# LAST DEPLOYED: Fri Jan 31 10:00:00 2026
# NAMESPACE: default
# STATUS: deployed
# REVISION: 1
# NOTES:
#   ...access instructions...
```

*Upgrade a release — change values or chart version*

```bash
helm upgrade my-nginx bitnami/nginx --set replicaCount=5
# Release "my-nginx" has been upgraded. Happy Helming!
# NAME: my-nginx
# LAST DEPLOYED: Fri Jan 31 10:30:00 2026
# NAMESPACE: default
# STATUS: deployed
# REVISION: 2
```

Each upgrade bumps the revision number. Helm tracks every revision so you can roll back.

*View revision history*

```bash
helm history my-nginx
# REVISION   UPDATED                    STATUS       CHART          APP VERSION   DESCRIPTION
# 1          Fri Jan 31 10:00:00 2026   superseded   nginx-18.2.4   1.27.2       Install complete
# 2          Fri Jan 31 10:30:00 2026   deployed     nginx-18.2.4   1.27.2       Upgrade complete
```

*Rollback to a previous revision*

```bash
helm rollback my-nginx 1
# Rollback was a success! Happy Helming!
```

After rollback, the history shows a new revision:

```bash
helm history my-nginx
# REVISION   UPDATED                    STATUS       CHART          APP VERSION   DESCRIPTION
# 1          Fri Jan 31 10:00:00 2026   superseded   nginx-18.2.4   1.27.2       Install complete
# 2          Fri Jan 31 10:30:00 2026   superseded   nginx-18.2.4   1.27.2       Upgrade complete
# 3          Fri Jan 31 10:45:00 2026   deployed     nginx-18.2.4   1.27.2       Rollback to 1
```

> **Gotcha:** Rollback creates a new revision (3), it doesn't delete revision 2. This means you can always "roll forward" again if needed. The history is an append-only log.

*Uninstall a release — removes all associated Kubernetes resources*

```bash
helm uninstall my-nginx
# release "my-nginx" uninstalled
```

*Keep the release history after uninstall (useful for auditing)*

```bash
helm uninstall my-nginx --keep-history
```

### Values and Overrides

Values are the primary way you customize a chart. Understanding the override hierarchy is critical.

*View all configurable values for a chart*

```bash
helm show values bitnami/nginx
# ## @section Global parameters
# global:
#   imageRegistry: ""
#   imagePullSecrets: []
#   storageClass: ""
#
# ## @section Common parameters
# replicaCount: 1
#
# ## @section NGINX parameters
# image:
#   registry: docker.io
#   repository: bitnami/nginx
#   tag: 1.27.2-debian-12-r1
#   pullPolicy: IfNotPresent
#
# ## @section Service parameters
# service:
#   type: LoadBalancer
#   ports:
#     http: 80
#     https: 443
# ...
# (output continues — charts often have hundreds of configurable values)
```

> **Tip:** Pipe through `less` or redirect to a file: `helm show values bitnami/nginx > nginx-defaults.yaml`. Then copy what you need into your custom values file and change only what matters.

### Override Hierarchy

Values are merged in this order (last wins):

```
1. Chart's values.yaml (defaults)          ← lowest priority
2. Parent chart's values.yaml (if subchart)
3. -f / --values file(s)                   ← file overrides
4. --set flags                             ← highest priority
```

If you pass multiple `-f` files, later files take priority over earlier ones:

```bash
# base-values.yaml is applied first, then production.yaml overrides
helm install my-nginx bitnami/nginx \
  -f base-values.yaml \
  -f production.yaml
```

### The --set Syntax

`--set` lets you override individual values from the command line:

*Simple values*

```bash
helm install my-nginx bitnami/nginx --set replicaCount=3
```

*Nested values (dot notation)*

```bash
helm install my-nginx bitnami/nginx \
  --set service.type=ClusterIP \
  --set service.ports.http=8080
```

*String values (force quotes — needed when the value looks like a number or boolean)*

```bash
helm install my-nginx bitnami/nginx --set image.tag="1.27.2"
```

*Multiple values in one --set*

```bash
helm install my-nginx bitnami/nginx \
  --set replicaCount=3,service.type=ClusterIP
```

*Array/list values*

```bash
# Set a list item by index
helm install my-nginx bitnami/nginx \
  --set 'ingress.hosts[0].name=myapp.example.com'
```

### File-Based Overrides (Preferred)

For anything beyond a few simple values, use a YAML file. It's easier to read, version in git, and review in PRs:

*custom-values.yaml*

```yaml
replicaCount: 3

image:
  tag: "1.27.2"
  pullPolicy: Always

service:
  type: ClusterIP
  ports:
    http: 8080

resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 250m
    memory: 256Mi

ingress:
  enabled: true
  hostname: myapp.example.com
  tls: true
```

*Install with the custom values*

```bash
helm install my-nginx bitnami/nginx -f custom-values.yaml
```

> **Gotcha:** `--set` values are not stored anywhere except in the Helm release secret. If you rely on `--set` for important config, that config isn't in your git repo. Use `-f values.yaml` files in git for reproducibility and `--set` only for one-off overrides or CI/CD-injected secrets.

### Inspecting Charts

Before installing a chart, you may want to examine it. Helm provides several inspection commands.

*View chart metadata*

```bash
helm show chart bitnami/nginx
# apiVersion: v2
# appVersion: 1.27.2
# description: NGINX Open Source is a web server that can be also used as a
#   reverse proxy, load balancer, and HTTP cache.
# home: https://bitnami.com
# keywords:
# - nginx
# - http
# - web
# - www
# - reverse proxy
# maintainers:
# - name: Broadcom
# name: nginx
# version: 18.2.4
```

*View chart README*

```bash
helm show readme bitnami/nginx
# (renders the full README documentation for the chart)
```

*View everything (chart + values + README)*

```bash
helm show all bitnami/nginx
```

*Render templates locally without installing*

```bash
helm template my-nginx bitnami/nginx -f custom-values.yaml
# ---
# # Source: nginx/templates/svc.yaml
# apiVersion: v1
# kind: Service
# metadata:
#   name: my-nginx
#   namespace: default
#   labels:
#     app.kubernetes.io/name: nginx
#     app.kubernetes.io/instance: my-nginx
# spec:
#   type: ClusterIP
#   ports:
#     - name: http
#       port: 8080
#       targetPort: http
#   selector:
#     app.kubernetes.io/name: nginx
#     app.kubernetes.io/instance: my-nginx
# ---
# # Source: nginx/templates/deployment.yaml
# apiVersion: apps/v1
# kind: Deployment
# ...
```

`helm template` is extremely useful for debugging. It renders the templates with your values and prints the raw Kubernetes YAML that would be applied — without talking to the cluster.

> **Tip:** Use `helm template` in CI pipelines to validate that your values produce valid YAML. Pipe the output into `kubectl apply --dry-run=server -f -` for full server-side validation without actually deploying.

### Inspecting Installed Releases

After installation, you can inspect what Helm actually deployed:

*Get the rendered manifests for an installed release*

```bash
helm get manifest my-nginx
# ---
# # Source: nginx/templates/svc.yaml
# apiVersion: v1
# kind: Service
# metadata:
#   name: my-nginx
# ...
# ---
# # Source: nginx/templates/deployment.yaml
# apiVersion: apps/v1
# kind: Deployment
# ...
```

*Get the values that were applied*

```bash
helm get values my-nginx
# USER-SUPPLIED VALUES:
# replicaCount: 3
# service:
#   type: ClusterIP

# Include computed (default) values too
helm get values my-nginx --all
# COMPUTED VALUES:
# (all default + overridden values merged together)
```

*Get release notes*

```bash
helm get notes my-nginx
# NOTES:
# CHART NAME: nginx
# ...access instructions...
```

*Get everything about a release*

```bash
helm get all my-nginx
# (manifests + values + notes + hooks)
```

### Hands-On Walkthrough

Let's walk through a complete Helm workflow — from finding a chart to deploying, customizing, upgrading, rolling back, and cleaning up.

*Step 1: Add the Bitnami repository*

```bash
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update
```

*Step 2: Search for the nginx chart and inspect it*

```bash
helm search repo bitnami/nginx --versions | head -5
# NAME            CHART VERSION   APP VERSION   DESCRIPTION
# bitnami/nginx   18.2.4          1.27.2        NGINX Open Source is a web server...
# bitnami/nginx   18.2.3          1.27.2        NGINX Open Source is a web server...
# bitnami/nginx   18.2.2          1.27.1        NGINX Open Source is a web server...
# bitnami/nginx   18.2.1          1.27.1        NGINX Open Source is a web server...

# See what values you can configure
helm show values bitnami/nginx | head -30
```

*Step 3: Do a dry run first*

```bash
helm install web-server bitnami/nginx \
  --set replicaCount=2 \
  --set service.type=ClusterIP \
  --dry-run
```

Review the rendered output. Make sure the Deployment has 2 replicas and the Service is ClusterIP.

*Step 4: Install for real*

```bash
helm install web-server bitnami/nginx \
  --set replicaCount=2 \
  --set service.type=ClusterIP
# NAME: web-server
# NAMESPACE: default
# STATUS: deployed
# REVISION: 1
```

*Step 5: Verify the deployment*

```bash
helm list
# NAME         NAMESPACE   REVISION   UPDATED                                STATUS     CHART          APP VERSION
# web-server   default     1          2026-01-31 11:00:00.123456 +0000 UTC   deployed   nginx-18.2.4   1.27.2

kubectl get pods -l app.kubernetes.io/instance=web-server
# NAME                          READY   STATUS    RESTARTS   AGE
# web-server-5d4b8c6f5-abc12    1/1     Running   0          30s
# web-server-5d4b8c6f5-def34    1/1     Running   0          30s

helm get values web-server
# USER-SUPPLIED VALUES:
# replicaCount: 2
# service:
#   type: ClusterIP
```

*Step 6: Upgrade — scale to 4 replicas*

```bash
helm upgrade web-server bitnami/nginx \
  --set replicaCount=4 \
  --set service.type=ClusterIP
# Release "web-server" has been upgraded. Happy Helming!
# REVISION: 2

kubectl get pods -l app.kubernetes.io/instance=web-server
# NAME                          READY   STATUS    RESTARTS   AGE
# web-server-5d4b8c6f5-abc12    1/1     Running   0          5m
# web-server-5d4b8c6f5-def34    1/1     Running   0          5m
# web-server-5d4b8c6f5-ghi56    1/1     Running   0          10s
# web-server-5d4b8c6f5-jkl78    1/1     Running   0          10s
```

> **Gotcha:** `helm upgrade` replaces ALL values, not just the ones you pass. If you used `--set service.type=ClusterIP` on install but omit it on upgrade, it reverts to the chart default (LoadBalancer). Use `--reuse-values` to keep previous values, or always pass the full set of overrides. Better yet, use a values file.

*Step 7: Check history and rollback*

```bash
helm history web-server
# REVISION   UPDATED                    STATUS       CHART          APP VERSION   DESCRIPTION
# 1          Fri Jan 31 11:00:00 2026   superseded   nginx-18.2.4   1.27.2       Install complete
# 2          Fri Jan 31 11:05:00 2026   deployed     nginx-18.2.4   1.27.2       Upgrade complete

# Roll back to revision 1 (2 replicas)
helm rollback web-server 1
# Rollback was a success! Happy Helming!

kubectl get pods -l app.kubernetes.io/instance=web-server
# NAME                          READY   STATUS        RESTARTS   AGE
# web-server-5d4b8c6f5-abc12    1/1     Running       0          10m
# web-server-5d4b8c6f5-def34    1/1     Running       0          10m
# web-server-5d4b8c6f5-ghi56    1/1     Terminating   0          5m
# web-server-5d4b8c6f5-jkl78    1/1     Terminating   0          5m
```

*Step 8: Inspect what was deployed*

```bash
# See the actual Kubernetes manifests
helm get manifest web-server | head -30

# Render locally to compare
helm template web-server bitnami/nginx \
  --set replicaCount=2 \
  --set service.type=ClusterIP | head -30
```

*Step 9: Clean up*

```bash
helm uninstall web-server
# release "web-server" uninstalled

helm list
# NAME    NAMESPACE    REVISION    UPDATED    STATUS    CHART    APP VERSION

kubectl get pods -l app.kubernetes.io/instance=web-server
# No resources found in default namespace.
```

Everything is gone — the Deployment, Service, Pods, and all other resources that Helm created.

### Useful Helm Flags Reference

| Flag | Used With | Purpose |
|------|-----------|---------|
| `--namespace` / `-n` | install, upgrade, list | Target namespace |
| `--create-namespace` | install, upgrade | Create namespace if missing |
| `-f` / `--values` | install, upgrade, template | Override values from file |
| `--set` | install, upgrade, template | Override individual values |
| `--reuse-values` | upgrade | Keep values from previous release |
| `--reset-values` | upgrade | Reset to chart defaults (ignore previous) |
| `--dry-run` | install, upgrade | Simulate without applying |
| `--debug` | install, upgrade, template | Verbose output |
| `--wait` | install, upgrade | Wait until resources are ready |
| `--timeout` | install, upgrade | Max time to wait (default 5m) |
| `--atomic` | install, upgrade | Rollback on failure |
| `--version` | install, upgrade | Install a specific chart version |
| `--keep-history` | uninstall | Preserve release history |
| `--all-namespaces` / `-A` | list | Show releases across all namespaces |

> **Tip:** Use `--atomic` for production upgrades. If any resource fails to become ready within the timeout, Helm automatically rolls back to the previous revision. This prevents half-deployed broken states.

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

## Module 15 Summary

- **Helm** is the package manager for Kubernetes — it solves templating, packaging, and release management for K8s manifests
- A **chart** is a package of templates + default values; a **release** is an installed instance of a chart; a **repository** is where charts are stored
- **Helm 3** has no server-side component (Tiller is gone) — it talks directly to the K8s API using your kubeconfig
- **Install:** `helm install <release> <chart>` with `-f values.yaml` or `--set key=value` for overrides
- **Upgrade:** `helm upgrade <release> <chart>` bumps the revision; use `--reuse-values` to keep previous config
- **Rollback:** `helm rollback <release> <revision>` restores a previous state (creates a new revision, doesn't delete history)
- **History:** `helm history <release>` shows all revisions with timestamps and status
- **Uninstall:** `helm uninstall <release>` removes all associated Kubernetes resources
- **Values hierarchy:** chart defaults < parent chart < `-f` files (in order) < `--set` flags (highest priority)
- **Inspect before install:** `helm show values` to see config options, `helm template` to render YAML locally, `--dry-run` to simulate
- **Inspect after install:** `helm get manifest` for deployed YAML, `helm get values` for applied config
- Use `-f values.yaml` files committed to git instead of `--set` flags for reproducible, reviewable deployments
- Use `--atomic` on production upgrades for automatic rollback on failure
