## Helm in Production

Running `helm install` from your laptop works for demos. It does not work for a team managing 30 microservices across dev, staging, and production. Production Helm needs declarative release management, CI/CD automation, secret handling, versioning discipline, and safe rollback strategies.

This module covers the tools, patterns, and practices that separate a Helm hobbyist from a team shipping confidently with Helm in production.

```
Dev Workflow                          Production Workflow
┌───────────────┐                     ┌───────────────────────────────────────┐
│ helm install  │                     │  helmfile.yaml / GitOps repo          │
│ helm upgrade  │                     │    ├── environments/                  │
│ (manual CLI)  │                     │    │   ├── dev.yaml                   │
└───────────────┘                     │    │   ├── staging.yaml               │
                                      │    │   └── prod.yaml                  │
  Works for one                       │    ├── releases defined declaratively │
  person, one app                     │    └── CI/CD pipeline deploys         │
                                      └───────────────────────────────────────┘
                                        Works for teams, many apps, many envs
```

### Helmfile -- Declarative Release Management

When you have more than a handful of Helm releases, managing them with individual `helm install` and `helm upgrade` commands breaks down:

- No single source of truth for what's deployed
- Easy to forget a release or pass the wrong values
- Hard to reproduce a deployment across environments
- No way to diff what's deployed vs what's declared

**Helmfile** solves this. It's a declarative spec for your entire set of Helm releases in one file.

#### Installing Helmfile

```bash
# Install helmfile (binary download)
brew install helmfile          # macOS
# or
curl -L https://github.com/helmfile/helmfile/releases/latest/download/helmfile_linux_amd64.tar.gz \
  | tar xz -C /usr/local/bin helmfile

helmfile version
# ▓▓▓ helmfile
# Version            v0.162.0
# Git Commit         abc1234
```

#### A Complete helmfile.yaml

*helmfile.yaml*

```yaml
repositories:
  - name: bitnami
    url: https://charts.bitnami.com/bitnami
  - name: ingress-nginx
    url: https://kubernetes.github.io/ingress-nginx
  - name: prometheus-community
    url: https://prometheus-community.github.io/helm-charts

helmDefaults:
  wait: true
  timeout: 300                    # seconds
  createNamespace: true

releases:
  - name: nginx-ingress
    namespace: ingress-system
    chart: ingress-nginx/ingress-nginx
    version: 4.9.1
    values:
      - values/nginx-ingress.yaml

  - name: api
    namespace: app
    chart: ./charts/api            # local chart
    version: 2.5.0
    values:
      - values/api-common.yaml
      - values/api-{{ .Environment.Name }}.yaml

  - name: redis
    namespace: app
    chart: bitnami/redis
    version: 18.6.1
    values:
      - values/redis.yaml

  - name: monitoring
    namespace: monitoring
    chart: prometheus-community/kube-prometheus-stack
    version: 56.6.2
    values:
      - values/monitoring.yaml
```

This single file declares four releases with pinned versions, namespaces, and values files. Anyone on the team can see exactly what's deployed.

#### Helmfile Commands

```bash
# Sync all releases — install or upgrade to match helmfile.yaml
helmfile sync
# Adding repo bitnami https://charts.bitnami.com/bitnami
# Adding repo ingress-nginx https://kubernetes.github.io/ingress-nginx
# Upgrading release=nginx-ingress, chart=ingress-nginx/ingress-nginx
# Upgrading release=api, chart=./charts/api
# Upgrading release=redis, chart=bitnami/redis
# Upgrading release=monitoring, chart=prometheus-community/kube-prometheus-stack
# UPDATED RELEASES:
#    NAME             CHART                                           VERSION
#    nginx-ingress    ingress-nginx/ingress-nginx                     4.9.1
#    api              ./charts/api                                    2.5.0
#    redis            bitnami/redis                                   18.6.1
#    monitoring       prometheus-community/kube-prometheus-stack       56.6.2

# Preview what would change (requires helm-diff plugin)
helmfile diff
# Release "api" has been changed:
# ...
# +  replicas: 3
# -  replicas: 2

# Apply only the diff — smarter than sync
helmfile apply
# Only releases with changes are upgraded

# Target a specific release
helmfile -l name=api apply
```

> **Tip:** `helmfile apply` is the safest command for CI/CD. It runs `diff` first, then only upgrades releases that actually changed. `helmfile sync` always upgrades everything, even if nothing changed.

#### Environment-Specific Values

Real deployments need different configuration per environment. Helmfile has first-class support for this with the `environments` block:

*helmfile.yaml*

```yaml
environments:
  dev:
    values:
      - environments/dev.yaml
  staging:
    values:
      - environments/staging.yaml
  prod:
    values:
      - environments/prod.yaml

releases:
  - name: api
    namespace: api-{{ .Environment.Name }}
    chart: ./charts/api
    values:
      - values/api-common.yaml
      - values/api-{{ .Environment.Name }}.yaml
    set:
      - name: replicaCount
        value: {{ .Environment.Values.replicas }}
```

*environments/dev.yaml*

```yaml
replicas: 1
```

*environments/prod.yaml*

```yaml
replicas: 5
```

```bash
# Deploy to dev
helmfile -e dev apply
# Release "api" deployed to namespace api-dev with replicaCount=1

# Deploy to prod
helmfile -e prod apply
# Release "api" deployed to namespace api-prod with replicaCount=5
```

This pattern gives you one helmfile with per-environment overrides. No duplicated YAML, no environment-specific scripts.

### CI/CD with Helm

In production, nobody runs `helm upgrade` from their laptop. Chart changes go through git, CI validates them, and CD deploys them.

#### The GitOps Workflow

```
┌──────────┐      ┌──────────┐      ┌───────────┐      ┌────────────┐
│Developer │      │   Git    │      │   CI/CD   │      │ Kubernetes │
│          │─────▶│  push    │─────▶│  pipeline │─────▶│  cluster   │
│          │      │          │      │           │      │            │
│ edit     │      │ PR +     │      │ lint      │      │ helm       │
│ chart/   │      │ review   │      │ template  │      │ upgrade    │
│ values   │      │ merge    │      │ diff      │      │ --install  │
└──────────┘      └──────────┘      │ deploy    │      └────────────┘
                                    └───────────┘
```

#### Key Helm Flags for CI/CD

The `--install` flag makes `helm upgrade` idempotent -- it creates the release if it doesn't exist or upgrades it if it does:

```bash
# Idempotent deploy — safe to run whether release exists or not
helm upgrade --install api ./charts/api \
  --namespace app \
  --values values/prod.yaml

# Wait for Pods to be ready (fail the pipeline if they don't)
helm upgrade --install api ./charts/api \
  --namespace app \
  --values values/prod.yaml \
  --wait \
  --timeout 5m
# Release "api" has been upgraded. Happy Helming!
# (pipeline continues only after all Pods are Ready)

# Auto-rollback on failure — if Pods don't become ready, revert
helm upgrade --install api ./charts/api \
  --namespace app \
  --values values/prod.yaml \
  --wait \
  --timeout 5m \
  --atomic
# If upgrade fails:
# Error: release api failed, and has been rolled back due to atomic being set:
# timed out waiting for the condition
```

> **Gotcha:** `--wait` without `--atomic` will mark the pipeline as failed if Pods don't become ready, but the broken release stays deployed. Always pair `--wait` with `--atomic` in CI/CD so failed deploys are automatically rolled back.

#### helm-diff Plugin

The `helm-diff` plugin shows what would change before you apply. Essential for code review in pull requests:

```bash
# Install the plugin
helm plugin install https://github.com/databus23/helm-diff

# Preview changes without applying
helm diff upgrade api ./charts/api \
  --namespace app \
  --values values/prod.yaml
# default, api, Deployment (apps) has changed:
#   spec:
#     replicas:
# -     2
# +     3
#   template:
#     spec:
#       containers:
#       - image:
# -         myregistry/api:v1.4.0
# +         myregistry/api:v1.5.0
```

#### GitHub Actions Pipeline Example

*.github/workflows/deploy.yaml*

```yaml
name: Deploy Helm Chart
on:
  push:
    branches: [main]
    paths:
      - 'charts/**'
      - 'values/**'

jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: azure/setup-helm@v4
      - name: Lint chart
        run: helm lint ./charts/api
      - name: Template and validate
        run: |
          helm template api ./charts/api \
            --values values/prod.yaml \
            | kubectl apply --dry-run=client -f -

  deploy:
    needs: lint-and-test
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - uses: azure/setup-helm@v4
      - uses: azure/setup-kubectl@v4
      - name: Configure kubeconfig
        run: echo "${{ secrets.KUBECONFIG }}" | base64 -d > kubeconfig.yaml
      - name: Diff changes
        run: |
          helm diff upgrade api ./charts/api \
            --namespace app \
            --values values/prod.yaml \
            --kubeconfig kubeconfig.yaml
      - name: Deploy
        run: |
          helm upgrade --install api ./charts/api \
            --namespace app \
            --create-namespace \
            --values values/prod.yaml \
            --wait \
            --timeout 5m \
            --atomic \
            --kubeconfig kubeconfig.yaml
```

#### GitOps with ArgoCD and FluxCD

For teams that want the cluster to pull changes from git (rather than CI pushing to the cluster), ArgoCD and FluxCD are the two major options:

**ArgoCD** monitors a git repo and reconciles the cluster to match:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: api
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/myorg/k8s-deployments
    path: charts/api
    targetRevision: main
    helm:
      valueFiles:
        - values/prod.yaml
  destination:
    server: https://kubernetes.default.svc
    namespace: app
  syncPolicy:
    automated:
      prune: true          # delete resources removed from git
      selfHeal: true       # revert manual changes
```

**FluxCD** uses a HelmRelease CRD:

```yaml
apiVersion: helm.toolkit.fluxcd.io/v2beta2
kind: HelmRelease
metadata:
  name: api
  namespace: app
spec:
  interval: 5m
  chart:
    spec:
      chart: ./charts/api
      sourceRef:
        kind: GitRepository
        name: deployments
  values:
    replicaCount: 3
    image:
      tag: v1.5.0
```

> **Tip:** GitOps (ArgoCD/FluxCD) eliminates the need for CI to have cluster credentials. The cluster pulls from git instead of CI pushing to the cluster. This is more secure and gives you an audit trail in git history.

### Chart Versioning

Helm charts follow **Semantic Versioning** (SemVer). Getting versioning right matters because it signals to consumers what kind of changes to expect.

#### Chart Version vs appVersion

Every `Chart.yaml` has two version fields:

```yaml
apiVersion: v2
name: api
version: 1.3.0          # chart packaging version
appVersion: "2.8.1"      # version of the application inside
```

| Field | What It Tracks | When to Bump |
|-------|---------------|-------------|
| `version` | The chart itself — templates, defaults, structure | When you change templates, add new values, modify helpers |
| `appVersion` | The application the chart deploys | When you update the container image tag |

```
version (chart):     1.0.0 → 1.1.0 → 1.2.0 → 2.0.0
                       │       │       │       │
appVersion (app):    3.1.0   3.1.0   3.2.0   4.0.0
                              │
                    Chart changed (new template),
                    but app version stayed the same
```

#### SemVer Rules for Charts

- **MAJOR** (2.0.0) — breaking changes. Renamed values, removed templates, restructured the chart. Users must update their values files.
- **MINOR** (1.3.0) — new features. Added a new template, new optional values. Existing values files still work.
- **PATCH** (1.3.1) — bug fixes. Fixed a template bug, corrected a default. No new features.

> **Gotcha:** Changing a default value in `values.yaml` is a MINOR bump if it's additive (new key) or a MAJOR bump if it renames or removes an existing key. Think about what breaks for existing users.

#### OCI Registries for Chart Storage

Modern Helm supports OCI (Open Container Initiative) registries for chart storage. You can push charts to the same registry that holds your container images:

```bash
# Log in to the registry
helm registry login registry.example.com \
  --username myuser \
  --password-stdin <<< "$REGISTRY_PASSWORD"
# Login Succeeded

# Package the chart
helm package ./charts/api
# Successfully packaged chart and saved it to: api-1.3.0.tgz

# Push to OCI registry
helm push api-1.3.0.tgz oci://registry.example.com/charts
# Pushed: registry.example.com/charts/api:1.3.0
# Digest: sha256:abc123def456...

# Pull from OCI registry
helm pull oci://registry.example.com/charts/api --version 1.3.0
# Pulled: registry.example.com/charts/api:1.3.0

# Install directly from OCI registry
helm install api oci://registry.example.com/charts/api --version 1.3.0
```

#### Publishing Workflow in CI

```bash
# In CI after chart changes are merged:
CHART_VERSION=$(grep '^version:' charts/api/Chart.yaml | awk '{print $2}')

helm package ./charts/api
helm push "api-${CHART_VERSION}.tgz" oci://registry.example.com/charts

echo "Published api chart version ${CHART_VERSION}"
# Published api chart version 1.3.0
```

> **Tip:** Use OCI registries instead of traditional Helm chart repositories (index.yaml). OCI registries are faster, support authentication natively, and work with existing container registry infrastructure (ECR, GCR, ACR, Docker Hub, GitHub Packages).

### Managing Secrets in Helm

Storing secrets in `values.yaml` and committing them to git is one of the most common Helm mistakes. Anyone with repo access sees your database passwords, API keys, and TLS certificates in plain text.

#### The Problem

```yaml
# values-prod.yaml — DO NOT do this
database:
  host: prod-db.internal
  username: admin
  password: "sup3r-s3cret-p@ssw0rd"      # now in git history forever

redis:
  auth:
    password: "r3d1s-t0k3n"               # anyone with repo access can see this
```

#### helm-secrets Plugin

The **helm-secrets** plugin uses [Mozilla SOPS](https://github.com/getsops/sops) to encrypt values files. Encrypted files can safely live in git.

```bash
# Install helm-secrets
helm plugin install https://github.com/jkroepke/helm-secrets

# Install sops
brew install sops        # macOS
# or download from https://github.com/getsops/sops/releases

# Configure SOPS to use an encryption key (AWS KMS example)
# .sops.yaml at repo root
cat .sops.yaml
# creation_rules:
#   - path_regex: .*secrets.*\.yaml$
#     kms: arn:aws:kms:us-east-1:123456789:key/abc-def-ghi
```

#### helm-secrets Workflow

*Step 1: Create a plaintext secrets file*

*values-secret.yaml*

```yaml
database:
  password: "sup3r-s3cret-p@ssw0rd"
redis:
  auth:
    password: "r3d1s-t0k3n"
```

*Step 2: Encrypt it*

```bash
helm secrets enc values-secret.yaml
# Encrypting values-secret.yaml
# Successfully encrypted values-secret.yaml
```

The file is now encrypted in place:

```yaml
database:
  password: ENC[AES256_GCM,data:kF8sd...,iv:abc...,tag:xyz...,type:str]
redis:
  auth:
    password: ENC[AES256_GCM,data:9xPq...,iv:def...,tag:uvw...,type:str]
sops:
  kms:
    - arn: arn:aws:kms:us-east-1:123456789:key/abc-def-ghi
      created_at: "2026-01-31T10:00:00Z"
  version: 3.8.1
```

*Step 3: Commit the encrypted file to git*

```bash
git add values-secret.yaml
git commit -m "Add encrypted production secrets"
# Safe — the values are encrypted with KMS
```

*Step 4: Use with Helm*

```bash
# helm-secrets decrypts on the fly during install/upgrade
helm secrets upgrade --install api ./charts/api \
  --namespace app \
  --values values/prod.yaml \
  --values values-secret.yaml        # decrypted at deploy time
# Release "api" has been upgraded.

# Decrypt for local viewing (if you have KMS access)
helm secrets dec values-secret.yaml
# Decrypting values-secret.yaml
# Successfully decrypted values-secret.yaml.dec
cat values-secret.yaml.dec
# database:
#   password: "sup3r-s3cret-p@ssw0rd"

# Clean up the decrypted file
rm values-secret.yaml.dec
```

> **Gotcha:** Add `*.dec` to your `.gitignore` so decrypted files never get committed. Also add `values-secret.yaml.dec` patterns explicitly.

#### Alternative: External Secrets Operator

For teams already using a secrets manager (HashiCorp Vault, AWS Secrets Manager, GCP Secret Manager), the **External Secrets Operator** syncs secrets from the external store into Kubernetes Secrets:

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: api-secrets
  namespace: app
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: vault-backend
    kind: ClusterSecretStore
  target:
    name: api-secrets              # K8s Secret to create
  data:
    - secretKey: db-password
      remoteRef:
        key: production/api
        property: db-password
    - secretKey: redis-password
      remoteRef:
        key: production/api
        property: redis-password
```

Your Helm chart then references the Kubernetes Secret normally — no secrets in values files at all:

```yaml
# In your chart template
env:
  - name: DB_PASSWORD
    valueFrom:
      secretKeyRef:
        name: api-secrets
        key: db-password
```

> **Tip:** External Secrets Operator is the gold standard for production. It keeps secrets out of git entirely, supports automatic rotation, and works with every major secrets manager. Use helm-secrets when you need a simpler setup or don't have a dedicated secrets manager.

### Release Management Best Practices

Small mistakes in how you manage releases compound into big problems at scale. These practices prevent the most common production incidents.

#### Always Specify Namespace

```bash
# Bad — deploys to whatever namespace your kubeconfig defaults to
helm upgrade --install api ./charts/api

# Good — explicit namespace, no surprises
helm upgrade --install api ./charts/api --namespace app

# First install — create the namespace if it doesn't exist
helm upgrade --install api ./charts/api \
  --namespace app \
  --create-namespace
```

#### Pin Chart Versions

```bash
# Bad — installs whatever the latest version is today
helm install redis bitnami/redis

# Good — pinned version, reproducible
helm install redis bitnami/redis --version 18.6.1
```

In helmfile, always pin versions:

```yaml
releases:
  - name: redis
    chart: bitnami/redis
    version: 18.6.1            # pinned — never use "latest" or omit this
```

#### Keep History Clean

Every `helm upgrade` creates a new revision. Old revisions consume etcd storage in your cluster. Set a maximum:

```bash
helm upgrade --install api ./charts/api \
  --namespace app \
  --history-max 10             # keep only the last 10 revisions
```

```bash
# Check release history
helm history api -n app
# REVISION  UPDATED                   STATUS      CHART       APP VERSION   DESCRIPTION
# 8         2026-01-29 10:00:00       superseded  api-2.3.0   1.4.0         Upgrade complete
# 9         2026-01-30 14:30:00       superseded  api-2.4.0   1.5.0         Upgrade complete
# 10        2026-01-31 09:15:00       deployed    api-2.5.0   1.5.1         Upgrade complete
```

#### Naming Conventions

Use a consistent naming scheme so you can identify releases by name:

| Pattern | Example | When to Use |
|---------|---------|-------------|
| `<app>` | `api` | Single environment per cluster |
| `<app>-<env>` | `api-prod` | Multiple environments in one cluster |
| `<team>-<app>` | `platform-redis` | Multi-team cluster |

#### Namespace Strategy

| Strategy | Layout | Pros | Cons |
|----------|--------|------|------|
| Namespace per environment | `app-dev`, `app-staging`, `app-prod` | Simple isolation, easy RBAC | All envs in one cluster |
| Namespace per team | `team-frontend`, `team-backend` | Team autonomy, resource quotas | Cross-team dependencies complex |
| Cluster per environment | dev cluster, prod cluster | Strongest isolation | More infrastructure cost |

### Upgrading and Rollback Strategies

Understanding how Helm upgrades and rollbacks work prevents data loss and downtime.

#### How helm upgrade Works: Three-Way Merge

Helm uses a **three-way merge** to calculate changes:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Old Manifest   │     │  Live State     │     │  New Manifest   │
│  (last Helm     │     │  (what's in the │     │  (rendered from │
│   revision)     │     │   cluster now)  │     │   new chart)    │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                        ┌────────▼────────┐
                        │  Three-Way Merge │
                        │  Patch applied  │
                        │  to cluster     │
                        └─────────────────┘
```

This means Helm is smart about manually edited resources. If someone ran `kubectl edit` to change a field that the chart doesn't manage, Helm preserves that change. But if both the chart and the manual edit changed the same field, the chart wins.

```bash
# Inspect the current deployed manifest
helm get manifest api -n app | head -30
# ---
# apiVersion: apps/v1
# kind: Deployment
# metadata:
#   name: api
#   namespace: app
# spec:
#   replicas: 3
#   ...

# Compare what would change
helm diff upgrade api ./charts/api -n app --values values/prod.yaml
```

#### Rolling Back

When an upgrade goes wrong, rollback to a previous revision:

```bash
# View revision history
helm history api -n app
# REVISION  UPDATED                   STATUS      CHART       DESCRIPTION
# 5         2026-01-30 14:30:00       superseded  api-2.4.0   Upgrade complete
# 6         2026-01-31 09:15:00       deployed    api-2.5.0   Upgrade complete

# Rollback to revision 5
helm rollback api 5 -n app
# Rollback was a success! Happy Helming!

# Verify — note the new revision 7 (rollback creates a new revision)
helm history api -n app
# REVISION  UPDATED                   STATUS      CHART       DESCRIPTION
# 5         2026-01-30 14:30:00       superseded  api-2.4.0   Upgrade complete
# 6         2026-01-31 09:15:00       superseded  api-2.5.0   Upgrade complete
# 7         2026-01-31 09:20:00       deployed    api-2.4.0   Rollback to 5
```

> **Gotcha:** `helm rollback` creates a **new** revision pointing to the old config. It does not delete the failed revision. The history keeps growing, which is why `--history-max` matters.

#### Handling CRD Upgrades

Helm has a major limitation: **it does not upgrade CRDs**. Helm installs CRDs during `helm install` but ignores them on `helm upgrade`. This is intentional — CRDs affect all namespaces and accidental changes can break the entire cluster.

```bash
# CRDs are installed on first install
helm install prometheus prometheus-community/kube-prometheus-stack -n monitoring
# CRDs for ServiceMonitor, PrometheusRule, etc. are created

# On upgrade, CRDs are NOT updated
helm upgrade prometheus prometheus-community/kube-prometheus-stack -n monitoring
# Existing CRDs are left untouched!
```

To update CRDs manually:

```bash
# Extract CRDs from the chart
helm template prometheus prometheus-community/kube-prometheus-stack \
  --include-crds | kubectl apply --server-side -f -

# Or apply CRDs from the chart's crds/ directory
kubectl apply --server-side -f charts/kube-prometheus-stack/crds/
```

> **Tip:** Many chart maintainers provide a separate CRD chart or a kubectl command for CRD updates. Check the chart's README before upgrading. For critical CRD changes, apply CRDs first, then run `helm upgrade`.

### Chart Testing

Catching chart bugs before they reach a cluster saves downtime. Helm provides multiple levels of testing, from static analysis to live cluster tests.

#### helm lint -- Static Analysis

```bash
helm lint ./charts/api
# ==> Linting ./charts/api
# [INFO] Chart.yaml: icon is recommended
# [WARNING] templates/deployment.yaml: object name does not conform to Kubernetes naming requirements
#
# 1 chart(s) linted, 0 chart(s) failed

# Lint with specific values
helm lint ./charts/api --values values/prod.yaml
# ==> Linting ./charts/api
# 1 chart(s) linted, 0 chart(s) failed
```

#### helm template -- Render and Validate

Render templates locally without a cluster. Combine with `kubectl` dry-run for full validation:

```bash
# Render templates
helm template api ./charts/api --values values/prod.yaml
# ---
# apiVersion: v1
# kind: Service
# metadata:
#   name: api
# ...
# ---
# apiVersion: apps/v1
# kind: Deployment
# ...

# Render and validate against Kubernetes API schema
helm template api ./charts/api --values values/prod.yaml \
  | kubectl apply --dry-run=client -f -
# service/api created (dry run)
# deployment.apps/api created (dry run)

# Server-side validation (catches more issues, needs cluster access)
helm template api ./charts/api --values values/prod.yaml \
  | kubectl apply --dry-run=server -f -
```

#### helm test -- Run Test Pods

Charts can include test Pods that verify the release works:

*charts/api/templates/tests/test-connection.yaml*

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: "{{ include "api.fullname" . }}-test-connection"
  labels:
    {{- include "api.labels" . | nindent 4 }}
  annotations:
    "helm.sh/hook": test
spec:
  containers:
    - name: wget
      image: busybox
      command: ['wget']
      args: ['{{ include "api.fullname" . }}:{{ .Values.service.port }}/healthz']
  restartPolicy: Never
```

```bash
# Run tests after install/upgrade
helm test api -n app
# NAME: api
# LAST DEPLOYED: Sat Jan 31 09:15:00 2026
# STATUS: deployed
# TEST SUITE:     api-test-connection
# Last Started:   Sat Jan 31 09:16:00 2026
# Last Completed: Sat Jan 31 09:16:05 2026
# Phase:          Succeeded
```

#### chart-testing (ct) Tool for CI

The `ct` tool from the Helm project automates chart testing in CI. It detects changed charts and tests them:

```bash
# Install ct
brew install chart-testing     # macOS
# or use the docker image: quay.io/helmpack/chart-testing

# Lint changed charts (compares against target branch)
ct lint --target-branch main
# Linting charts...
#  Charts to be processed:
#   api => (version: "2.5.0", path: "charts/api")
# Linting chart "api"...
# All charts linted successfully

# Install and test changed charts
ct install --target-branch main
# Installing charts...
#  Charts to be processed:
#   api => (version: "2.5.0", path: "charts/api")
# Installing chart "api"...
# Running tests for chart "api"...
# All charts installed and tested successfully
```

#### Unit Testing with helm-unittest

The **helm-unittest** plugin lets you write test assertions for rendered templates without a cluster:

```bash
# Install the plugin
helm plugin install https://github.com/helm-unittest/helm-unittest
```

*charts/api/tests/deployment_test.yaml*

```yaml
suite: deployment tests
templates:
  - deployment.yaml
tests:
  - it: should set correct replica count
    set:
      replicaCount: 5
    asserts:
      - equal:
          path: spec.replicas
          value: 5

  - it: should use the correct image
    set:
      image.repository: myregistry/api
      image.tag: v1.5.0
    asserts:
      - equal:
          path: spec.template.spec.containers[0].image
          value: myregistry/api:v1.5.0

  - it: should set resource limits
    set:
      resources.limits.cpu: 500m
      resources.limits.memory: 256Mi
    asserts:
      - equal:
          path: spec.template.spec.containers[0].resources.limits.cpu
          value: 500m
```

```bash
helm unittest ./charts/api
# ### Chart [ api ] ./charts/api
#
# PASS  deployment tests
#   - should set correct replica count
#   - should use the correct image
#   - should set resource limits
#
# Charts:      1 passed, 1 total
# Test Suites: 1 passed, 1 total
# Tests:       3 passed, 3 total
```

> **Tip:** Use `helm-unittest` for logic-heavy charts with lots of conditionals. It catches template bugs much faster than deploying to a cluster. Run it in CI alongside `helm lint` and `ct lint`.

### Multi-Cluster Deployments

Production often means multiple clusters -- different regions, different cloud providers, or separate clusters for dev/staging/prod.

#### Same Chart, Different Values Per Cluster

The simplest pattern: one chart, one values file per cluster:

```
values/
  ├── cluster-us-east.yaml
  ├── cluster-eu-west.yaml
  └── cluster-ap-southeast.yaml
```

```bash
# Deploy to US East cluster
kubectl config use-context us-east-prod
helm upgrade --install api ./charts/api \
  --namespace app \
  --values values/cluster-us-east.yaml

# Deploy to EU West cluster
kubectl config use-context eu-west-prod
helm upgrade --install api ./charts/api \
  --namespace app \
  --values values/cluster-eu-west.yaml
```

#### Helmfile for Multi-Cluster

Helmfile can target specific kubeconfig contexts:

*helmfile.yaml*

```yaml
environments:
  us-east:
    values:
      - env/us-east.yaml
    kubeContext: us-east-prod
  eu-west:
    values:
      - env/eu-west.yaml
    kubeContext: eu-west-prod

releases:
  - name: api
    namespace: app
    chart: ./charts/api
    values:
      - values/common.yaml
      - values/{{ .Environment.Name }}.yaml
```

```bash
helmfile -e us-east apply
# Using context: us-east-prod
# Release "api" deployed

helmfile -e eu-west apply
# Using context: eu-west-prod
# Release "api" deployed
```

#### Kustomize + Helm Hybrid

Some teams use Helm for chart templating and Kustomize for environment-specific overlays. This works well when Helm values aren't flexible enough:

```bash
# Render Helm chart to plain YAML
helm template api ./charts/api --values values/base.yaml > base/manifests.yaml

# Apply Kustomize overlays on top
kustomize build overlays/prod | kubectl apply -f -
```

Or use Kustomize's built-in Helm support:

*kustomization.yaml*

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
helmCharts:
  - name: api
    releaseName: api
    namespace: app
    valuesFile: values/prod.yaml
    repo: oci://registry.example.com/charts
    version: 2.5.0
patches:
  - target:
      kind: Deployment
      name: api
    patch: |
      - op: add
        path: /spec/template/metadata/annotations/cluster
        value: us-east-prod
```

> **Tip:** The hybrid approach is useful when you need transformations that Helm values don't support (like injecting sidecar containers or adding annotations that the chart doesn't template). For most teams, pure Helm with environment-specific values files is simpler and sufficient.

### Hands-On: Helmfile Multi-Release Deployment

Let's build a real helmfile with two releases, deploy them, upgrade, and rollback.

*Step 1: Create the helmfile*

*helmfile.yaml*

```yaml
repositories:
  - name: bitnami
    url: https://charts.bitnami.com/bitnami

helmDefaults:
  wait: true
  timeout: 300
  createNamespace: true
  historyMax: 10

releases:
  - name: nginx
    namespace: helm-prod-lab
    chart: bitnami/nginx
    version: 15.14.0
    values:
      - replicaCount: 2
      - service:
          type: ClusterIP

  - name: redis
    namespace: helm-prod-lab
    chart: bitnami/redis
    version: 18.6.1
    values:
      - architecture: standalone
      - auth:
          enabled: false
```

*Step 2: Preview and deploy*

```bash
# Install helmfile and helm-diff
helm plugin install https://github.com/databus23/helm-diff

# Preview what will be created
helmfile diff
# Release "nginx" — all resources are new (install)
# Release "redis" — all resources are new (install)

# Deploy both releases
helmfile apply
# Adding repo bitnami https://charts.bitnami.com/bitnami
# Upgrading release=nginx, chart=bitnami/nginx
# Upgrading release=redis, chart=bitnami/redis
# UPDATED RELEASES:
#    NAME    CHART           VERSION
#    nginx   bitnami/nginx   15.14.0
#    redis   bitnami/redis   18.6.1
```

*Step 3: Verify*

```bash
helm list -n helm-prod-lab
# NAME    NAMESPACE       REVISION  UPDATED                   STATUS    CHART           APP VERSION
# nginx   helm-prod-lab   1         2026-01-31 10:00:00       deployed  nginx-15.14.0   1.25.3
# redis   helm-prod-lab   1         2026-01-31 10:00:05       deployed  redis-18.6.1    7.2.4

kubectl get pods -n helm-prod-lab
# NAME                     READY   STATUS    RESTARTS   AGE
# nginx-5d4f7b8c9-abc12    1/1     Running   0          60s
# nginx-5d4f7b8c9-def34    1/1     Running   0          60s
# redis-master-0           1/1     Running   0          55s
```

*Step 4: Upgrade nginx to 3 replicas*

Edit the helmfile:

```yaml
  - name: nginx
    namespace: helm-prod-lab
    chart: bitnami/nginx
    version: 15.14.0
    values:
      - replicaCount: 3              # changed from 2 to 3
      - service:
          type: ClusterIP
```

```bash
# Preview the change
helmfile diff
# Release "nginx" has been changed:
#   spec:
#     replicas:
# -     2
# +     3
# Release "redis" — no changes

# Apply only the changes
helmfile apply
# Upgrading release=nginx, chart=bitnami/nginx
# UPDATED RELEASES:
#    NAME    CHART           VERSION
#    nginx   bitnami/nginx   15.14.0

kubectl get pods -n helm-prod-lab
# NAME                     READY   STATUS    RESTARTS   AGE
# nginx-5d4f7b8c9-abc12    1/1     Running   0          5m
# nginx-5d4f7b8c9-def34    1/1     Running   0          5m
# nginx-5d4f7b8c9-ghi56    1/1     Running   0          30s     ← new Pod
# redis-master-0           1/1     Running   0          5m
```

*Step 5: Rollback nginx*

```bash
# Check history
helm history nginx -n helm-prod-lab
# REVISION  UPDATED                   STATUS      CHART           DESCRIPTION
# 1         2026-01-31 10:00:00       superseded  nginx-15.14.0   Install complete
# 2         2026-01-31 10:05:00       deployed    nginx-15.14.0   Upgrade complete

# Rollback to revision 1 (2 replicas)
helm rollback nginx 1 -n helm-prod-lab
# Rollback was a success! Happy Helming!

kubectl get pods -n helm-prod-lab
# NAME                     READY   STATUS    RESTARTS   AGE
# nginx-5d4f7b8c9-abc12    1/1     Running   0          10m
# nginx-5d4f7b8c9-def34    1/1     Running   0          10m
# redis-master-0           1/1     Running   0          10m
```

*Step 6: Clean up*

```bash
helmfile destroy
# Deleting release=nginx
# Deleting release=redis
# release "nginx" uninstalled
# release "redis" uninstalled

kubectl delete namespace helm-prod-lab
# namespace "helm-prod-lab" deleted
```

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

## Module 18 Summary

- **Helmfile** provides declarative release management -- define all releases in one `helmfile.yaml`, deploy with `helmfile apply`, diff with `helmfile diff`. Use `environments` for per-environment values.
- **CI/CD flags:** `helm upgrade --install` is idempotent. Add `--wait` to block until Pods are ready. Add `--atomic` to auto-rollback failed upgrades. Always use these three together in pipelines.
- **helm-diff plugin** previews changes before applying. Essential for pull request reviews and CI safety checks.
- **GitOps** (ArgoCD, FluxCD) lets the cluster pull from git instead of CI pushing. More secure, better audit trail, automatic drift detection.
- **Chart versioning:** `version` tracks chart changes, `appVersion` tracks application changes. Follow SemVer -- MAJOR for breaking changes, MINOR for new features, PATCH for fixes.
- **OCI registries** replace traditional chart repos. Use `helm push` and `helm pull` with your existing container registry (ECR, GCR, ACR, GHCR).
- **helm-secrets** (SOPS-based) encrypts values files so secrets can live in git safely. For production, prefer **External Secrets Operator** with a dedicated secrets manager (Vault, AWS Secrets Manager).
- **Release management:** always use `--namespace` explicitly, pin chart versions with `--version`, limit history with `--history-max`, use `--create-namespace` on first install.
- **Three-way merge** on upgrade compares old manifest, live state, and new manifest. Manual edits to unmanaged fields are preserved. `helm rollback` creates a new revision pointing to old config.
- **Helm does NOT upgrade CRDs.** Apply CRD updates manually with `kubectl apply --server-side` before running `helm upgrade`.
- **Chart testing:** `helm lint` for static analysis, `helm template` for rendering, `helm test` for in-cluster tests, `ct` for CI automation, `helm-unittest` for template unit tests.
- **Multi-cluster:** use helmfile environments with `kubeContext` or separate values files per cluster. The Kustomize + Helm hybrid approach adds flexibility for edge cases.
