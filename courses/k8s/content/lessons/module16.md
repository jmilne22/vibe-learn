## Chart Development

In Module 15 you learned how to use Helm charts that others have built. Now you'll learn to build your own. Chart development is where Helm becomes truly powerful -- you turn your Kubernetes manifests into reusable, configurable packages that anyone on your team can deploy with a single command.

---

### Chart Structure

Every Helm chart follows the same directory layout. The `helm create` command scaffolds it for you:

*Scaffold a new chart*

```bash
helm create mychart
# Creating mychart

tree mychart/
# mychart/
# ├── Chart.yaml          # chart metadata (name, version, dependencies)
# ├── values.yaml         # default configuration values
# ├── charts/             # chart dependencies (subcharts)
# ├── templates/          # Kubernetes resource templates
# │   ├── deployment.yaml
# │   ├── service.yaml
# │   ├── ingress.yaml
# │   ├── hpa.yaml
# │   ├── serviceaccount.yaml
# │   ├── _helpers.tpl    # reusable template helpers (partials)
# │   ├── NOTES.txt       # post-install message shown to user
# │   └── tests/
# │       └── test-connection.yaml
# └── .helmignore         # files to exclude from packaging
```

Each file has a purpose:

- **Chart.yaml** -- identity card for the chart (name, version, dependencies)
- **values.yaml** -- knobs and switches users can configure
- **templates/** -- Go-template-powered Kubernetes manifests
- **_helpers.tpl** -- shared template snippets (names, labels, selectors)
- **NOTES.txt** -- printed after `helm install` to show the user next steps
- **charts/** -- where dependency charts get downloaded
- **.helmignore** -- like `.gitignore` but for chart packaging

> **Tip:** The scaffold that `helm create` generates is fully functional. Run `helm install test ./mychart` right after creating it and you'll get a working nginx deployment. This is a great way to explore chart structure.

---

### Chart.yaml -- Chart Metadata

`Chart.yaml` is the metadata file that tells Helm what this chart is, what version it is, and what it depends on.

*mychart/Chart.yaml*

```yaml
apiVersion: v2                    # v2 for Helm 3 (v1 was Helm 2)
name: mychart                     # chart name (must match directory name)
description: A Helm chart for my web application
type: application                 # "application" or "library"
version: 0.1.0                    # chart version (SemVer) -- bump on chart changes
appVersion: "1.0.0"               # version of the app being deployed

# Keywords for search/discovery
keywords:
  - web
  - nginx

# Who maintains this chart
maintainers:
  - name: Jane Smith
    email: jane@example.com

# Chart dependencies -- pulled into charts/ directory
dependencies:
  - name: postgresql
    version: "12.1.9"
    repository: https://charts.bitnami.com/bitnami
    condition: postgresql.enabled   # only include if postgresql.enabled=true
  - name: redis
    version: "17.3.7"
    repository: https://charts.bitnami.com/bitnami
    condition: redis.enabled
```

Key fields explained:

- **version** -- the chart's own version. Bump this whenever you change anything in the chart. Follows SemVer.
- **appVersion** -- the version of the application being deployed (e.g., your app's Docker tag). This is informational -- it does not affect template rendering.
- **type** -- `application` charts can be installed. `library` charts provide helpers to other charts but cannot be installed on their own.
- **dependencies** -- charts this chart depends on. Running `helm dependency update` downloads them into `charts/`.

> **Gotcha:** `version` and `appVersion` are different things. Changing your app from v1.0 to v2.0 means bumping `appVersion`, but if no template logic changed, the chart `version` might stay the same. In practice, bump both.

*Update dependencies*

```bash
helm dependency update ./mychart
# Hang tight while we grab the latest from your chart repositories...
# ...Successfully got an update from the "bitnami" chart repository
# Saving 1 charts
# Downloading postgresql from repo https://charts.bitnami.com/bitnami
# Deleting outdated charts
```

---

### values.yaml -- Default Configuration

`values.yaml` is where you define every configurable parameter and its default value. Users override these at install time with `--set` or `--values`.

*mychart/values.yaml*

```yaml
# Number of pod replicas
replicaCount: 1

# Container image settings
image:
  repository: nginx
  pullPolicy: IfNotPresent
  tag: ""                          # defaults to chart appVersion

# Image pull secrets for private registries
imagePullSecrets: []

# Override the chart name
nameOverride: ""
fullnameOverride: ""

# ServiceAccount configuration
serviceAccount:
  create: true
  annotations: {}
  name: ""

# Pod-level security
podSecurityContext:
  fsGroup: 1000

# Container-level security
securityContext:
  runAsNonRoot: true
  runAsUser: 1000

# Service configuration
service:
  type: ClusterIP
  port: 80

# Ingress configuration
ingress:
  enabled: false
  className: nginx
  annotations: {}
  hosts:
    - host: myapp.example.com
      paths:
        - path: /
          pathType: Prefix
  tls: []

# Resource limits and requests
resources:
  limits:
    cpu: 100m
    memory: 128Mi
  requests:
    cpu: 50m
    memory: 64Mi

# Horizontal Pod Autoscaler
autoscaling:
  enabled: false
  minReplicas: 1
  maxReplicas: 10
  targetCPUUtilizationPercentage: 80

# Node selection
nodeSelector: {}
tolerations: []
affinity: {}

# Application-specific environment variables
env:
  - name: APP_ENV
    value: production

# Dependency toggles
postgresql:
  enabled: false
redis:
  enabled: false
```

Conventions worth following:

- **Flat where simple** -- `replicaCount: 1`, not `replica: { count: 1 }`
- **Nested where logical** -- `image.repository`, `image.tag`, `service.type`, `service.port`
- **Boolean toggles** -- `ingress.enabled`, `autoscaling.enabled` to conditionally render resources
- **Empty defaults for optional fields** -- `nameOverride: ""`, `nodeSelector: {}`, `tolerations: []`

> **Tip:** Document every value with a comment. The values.yaml file is the primary interface for your chart users. Treat it like an API.

---

### Go Templates Basics

Helm templates use Go's `text/template` language with extra functions from the Sprig library. Everything between `{{ }}` is a template action.

#### Accessing Values

```yaml
# Access values from values.yaml
replicas: {{ .Values.replicaCount }}
image: {{ .Values.image.repository }}:{{ .Values.image.tag }}

# Access built-in objects
namespace: {{ .Release.Namespace }}
release: {{ .Release.Name }}
chart: {{ .Chart.Name }}-{{ .Chart.Version }}
```

**Built-in objects** available in every template:

| Object | Description |
|--------|-------------|
| `.Values` | Values from values.yaml and `--set` overrides |
| `.Release` | Release info: `.Name`, `.Namespace`, `.IsInstall`, `.IsUpgrade`, `.Revision` |
| `.Chart` | Chart.yaml contents: `.Name`, `.Version`, `.AppVersion` |
| `.Capabilities` | Cluster info: `.KubeVersion`, `.APIVersions` |
| `.Template` | Current template: `.Name`, `.BasePath` |

#### String Functions

```yaml
# quote -- wraps in double quotes (required for some YAML values)
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}

# upper, lower, title
region: {{ .Values.region | upper }}

# default -- provide a fallback value
image: {{ .Values.image.repository | default "nginx" }}

# trim, trimSuffix, trimPrefix
name: {{ .Values.name | trim }}

# replace
slug: {{ .Values.name | replace " " "-" | lower }}

# printf -- formatted strings
name: {{ printf "%s-%s" .Release.Name .Chart.Name }}
```

#### Flow Control -- if/else

```yaml
# Conditional rendering
{{ if .Values.ingress.enabled }}
apiVersion: networking.k8s.io/v1
kind: Ingress
# ... full ingress spec
{{ end }}

# if/else
{{ if eq .Values.service.type "NodePort" }}
nodePort: {{ .Values.service.nodePort }}
{{ else }}
# ClusterIP does not use nodePort
{{ end }}

# Negation
{{ if not .Values.autoscaling.enabled }}
replicas: {{ .Values.replicaCount }}
{{ end }}

# Boolean operators: and, or, not, eq, ne, lt, gt, le, ge
{{ if and .Values.ingress.enabled .Values.ingress.tls }}
# TLS is configured
{{ end }}
```

#### Loops -- range

```yaml
# Iterate over a list
env:
{{- range .Values.env }}
  - name: {{ .name }}
    value: {{ .value | quote }}
{{- end }}

# Iterate over a map
annotations:
{{- range $key, $value := .Values.podAnnotations }}
  {{ $key }}: {{ $value | quote }}
{{- end }}
```

#### Scope -- with

```yaml
# "with" changes the scope of "." inside the block
{{- with .Values.nodeSelector }}
nodeSelector:
  {{- toYaml . | nindent 2 }}
{{- end }}
# Inside "with", "." is now .Values.nodeSelector
# If .Values.nodeSelector is empty, the entire block is skipped
```

> **Gotcha:** Inside a `with` block, `.` no longer refers to the root scope. If you need to access `.Release.Name` inside a `with`, use `$` which always refers to the root: `{{ $.Release.Name }}`.

#### Whitespace Control

Template actions add whitespace to the output. Use `{{-` (trim left) and `-}}` (trim right) to control it:

```yaml
# Without whitespace control (leaves blank lines):
metadata:
  labels:
{{ if .Values.extraLabels }}
{{ toYaml .Values.extraLabels | indent 4 }}
{{ end }}

# With whitespace control (clean output):
metadata:
  labels:
{{- if .Values.extraLabels }}
{{ toYaml .Values.extraLabels | indent 4 }}
{{- end }}
```

The `-` eats all whitespace (including newlines) in that direction. Use it to prevent blank lines in rendered output.

---

### Template Helpers (_helpers.tpl)

Files starting with `_` in `templates/` are **partials** -- they don't produce output directly but define reusable template snippets. The standard `_helpers.tpl` contains the most important ones.

*mychart/templates/_helpers.tpl*

```yaml
{{/*
Expand the name of the chart.
Truncated to 63 chars because Kubernetes name fields are limited.
*/}}
{{- define "mychart.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited.
If release name contains chart name it will be used as a full name.
*/}}
{{- define "mychart.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "mychart.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels applied to every resource.
*/}}
{{- define "mychart.labels" -}}
helm.sh/chart: {{ include "mychart.chart" . }}
{{ include "mychart.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels -- used in spec.selector.matchLabels.
These must NOT change between upgrades or Deployments will fail.
*/}}
{{- define "mychart.selectorLabels" -}}
app.kubernetes.io/name: {{ include "mychart.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use.
*/}}
{{- define "mychart.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "mychart.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}
```

To use these helpers in your templates:

```yaml
metadata:
  name: {{ include "mychart.fullname" . }}
  labels:
    {{- include "mychart.labels" . | nindent 4 }}
```

> **Gotcha:** Use `include` instead of `template` to call named templates. `include` returns a string you can pipe into other functions like `nindent`. `template` inserts inline and cannot be piped. This is the single most common Helm mistake.

---

### Writing Templates

Now let's see how the major templates come together. Each template uses values from `values.yaml` and helpers from `_helpers.tpl`.

#### deployment.yaml

*mychart/templates/deployment.yaml*

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "mychart.fullname" . }}
  labels:
    {{- include "mychart.labels" . | nindent 4 }}
spec:
  {{- if not .Values.autoscaling.enabled }}
  replicas: {{ .Values.replicaCount }}
  {{- end }}
  selector:
    matchLabels:
      {{- include "mychart.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "mychart.selectorLabels" . | nindent 8 }}
    spec:
      {{- with .Values.imagePullSecrets }}
      imagePullSecrets:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      serviceAccountName: {{ include "mychart.serviceAccountName" . }}
      {{- with .Values.podSecurityContext }}
      securityContext:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      containers:
        - name: {{ .Chart.Name }}
          {{- with .Values.securityContext }}
          securityContext:
            {{- toYaml . | nindent 12 }}
          {{- end }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          ports:
            - name: http
              containerPort: {{ .Values.service.port }}
              protocol: TCP
          livenessProbe:
            httpGet:
              path: /
              port: http
          readinessProbe:
            httpGet:
              path: /
              port: http
          {{- with .Values.resources }}
          resources:
            {{- toYaml . | nindent 12 }}
          {{- end }}
          {{- with .Values.env }}
          env:
            {{- toYaml . | nindent 12 }}
          {{- end }}
      {{- with .Values.nodeSelector }}
      nodeSelector:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- with .Values.affinity }}
      affinity:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- with .Values.tolerations }}
      tolerations:
        {{- toYaml . | nindent 8 }}
      {{- end }}
```

Key patterns explained:

- **`include "mychart.fullname" .`** -- produces a unique name like `myrelease-mychart`
- **`include "mychart.labels" . | nindent 4`** -- inserts common labels indented 4 spaces
- **`toYaml . | nindent N`** -- converts a values block to YAML and indents it N spaces. The `n` in `nindent` means "prepend a newline first."
- **`with .Values.nodeSelector`** -- renders the block only if nodeSelector has values. Avoids empty `nodeSelector: {}` in output.
- **`if not .Values.autoscaling.enabled`** -- skips replicas when HPA manages scaling
- **`default .Chart.AppVersion`** -- falls back to appVersion if image tag is not set

#### service.yaml

*mychart/templates/service.yaml*

```yaml
apiVersion: v1
kind: Service
metadata:
  name: {{ include "mychart.fullname" . }}
  labels:
    {{- include "mychart.labels" . | nindent 4 }}
spec:
  type: {{ .Values.service.type }}
  ports:
    - port: {{ .Values.service.port }}
      targetPort: http
      protocol: TCP
      name: http
  selector:
    {{- include "mychart.selectorLabels" . | nindent 4 }}
```

The selector labels here must exactly match what the Deployment puts on its Pods. By using the same `mychart.selectorLabels` helper, they always stay in sync.

#### ingress.yaml (Conditional Resource)

*mychart/templates/ingress.yaml*

```yaml
{{- if .Values.ingress.enabled -}}
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{ include "mychart.fullname" . }}
  labels:
    {{- include "mychart.labels" . | nindent 4 }}
  {{- with .Values.ingress.annotations }}
  annotations:
    {{- toYaml . | nindent 4 }}
  {{- end }}
spec:
  {{- if .Values.ingress.className }}
  ingressClassName: {{ .Values.ingress.className }}
  {{- end }}
  {{- if .Values.ingress.tls }}
  tls:
    {{- range .Values.ingress.tls }}
    - hosts:
        {{- range .hosts }}
        - {{ . | quote }}
        {{- end }}
      secretName: {{ .secretName }}
    {{- end }}
  {{- end }}
  rules:
    {{- range .Values.ingress.hosts }}
    - host: {{ .host | quote }}
      http:
        paths:
          {{- range .paths }}
          - path: {{ .path }}
            pathType: {{ .pathType }}
            backend:
              service:
                name: {{ include "mychart.fullname" $ }}
                port:
                  number: {{ $.Values.service.port }}
          {{- end }}
    {{- end }}
{{- end }}
```

Notice the ingress template uses several advanced patterns:

- **Entire file wrapped in `if`** -- the whole resource is only rendered when `ingress.enabled` is true
- **Nested `range`** -- loops within loops for hosts and paths
- **`$` to escape scope** -- inside `range`, `.` changes to the current item. Use `$` to reach back to the root scope for `$.Values.service.port` and `include "mychart.fullname" $`

#### NOTES.txt -- Post-Install Message

*mychart/templates/NOTES.txt*

```
1. Get the application URL by running these commands:
{{- if .Values.ingress.enabled }}
{{- range $host := .Values.ingress.hosts }}
  http{{ if $.Values.ingress.tls }}s{{ end }}://{{ $host.host }}
{{- end }}
{{- else if contains "NodePort" .Values.service.type }}
  export NODE_PORT=$(kubectl get --namespace {{ .Release.Namespace }} -o jsonpath="{.spec.ports[0].nodePort}" services {{ include "mychart.fullname" . }})
  export NODE_IP=$(kubectl get nodes --namespace {{ .Release.Namespace }} -o jsonpath="{.items[0].status.addresses[0].address}")
  echo http://$NODE_IP:$NODE_PORT
{{- else if contains "LoadBalancer" .Values.service.type }}
  export SERVICE_IP=$(kubectl get svc --namespace {{ .Release.Namespace }} {{ include "mychart.fullname" . }} --template "{{"{{ range (index .status.loadBalancer.ingress 0) }}{{.}}{{ end }}"}}")
  echo http://$SERVICE_IP:{{ .Values.service.port }}
{{- else }}
  kubectl --namespace {{ .Release.Namespace }} port-forward svc/{{ include "mychart.fullname" . }} 8080:{{ .Values.service.port }}
  echo "Visit http://127.0.0.1:8080"
{{- end }}
```

This file is Go-templated too. Helm prints it after install/upgrade so the user knows how to access the application.

---

### Debugging Templates

Debugging templates is the biggest part of chart development. You will get indentation wrong, access nil values, and produce invalid YAML. These tools help you find and fix problems.

#### Render Locally with helm template

`helm template` renders your templates locally without talking to a cluster:

*Render and inspect*

```bash
helm template myrelease ./mychart
# ---
# Source: mychart/templates/serviceaccount.yaml
# apiVersion: v1
# kind: ServiceAccount
# metadata:
#   name: myrelease-mychart
#   labels:
#     helm.sh/chart: mychart-0.1.0
#     app.kubernetes.io/name: mychart
#     app.kubernetes.io/instance: myrelease
#     app.kubernetes.io/version: "1.0.0"
#     app.kubernetes.io/managed-by: Helm
# ---
# Source: mychart/templates/service.yaml
# apiVersion: v1
# kind: Service
# ...
```

*Render with custom values*

```bash
# Override values on the command line
helm template myrelease ./mychart --set replicaCount=3 --set service.type=NodePort

# Override values from a file
helm template myrelease ./mychart -f production-values.yaml
```

*Show only one template*

```bash
helm template myrelease ./mychart --show-only templates/deployment.yaml
```

#### Debug Mode

```bash
# Show template rendering errors with full stack traces
helm template myrelease ./mychart --debug
# If there's an error, you'll see:
# Error: template: mychart/templates/deployment.yaml:15:20:
#   executing "mychart/templates/deployment.yaml" at <.Values.image.repo>:
#   nil pointer evaluating interface {}.repo
```

#### Server-Side Dry Run

`helm template` only does client-side rendering. It does not validate against the Kubernetes API. Use `--dry-run` with `helm install` for server-side validation:

```bash
helm install myrelease ./mychart --dry-run --debug
# This sends the rendered manifests to the K8s API for validation
# but does NOT actually create the resources.
# Catches issues like:
#   - Invalid apiVersion
#   - Missing required fields
#   - Admission webhook rejections
```

#### Linting

`helm lint` checks your chart for common issues:

```bash
helm lint ./mychart
# ==> Linting ./mychart
# [INFO] Chart.yaml: icon is recommended
# [WARNING] templates/ingress.yaml: object name does not conform to Kubernetes naming requirements
#
# 1 chart(s) linted, 0 chart(s) failed

# Lint with specific values
helm lint ./mychart -f production-values.yaml
```

#### Common Template Errors

**Nil pointer** -- accessing a value that does not exist:

```
# Error: nil pointer evaluating interface {}.repo
# Fix: use "default" or check with "if"
image: {{ .Values.image.repo }}           # breaks if .Values.image is nil
image: {{ .Values.image.repository }}     # correct field name
```

**Wrong indentation** -- toYaml output is not aligned:

```yaml
# Wrong: indent without nindent (no leading newline)
      resources:
        {{ toYaml .Values.resources | indent 8 }}
# Produces double-indented first line

# Right: use nindent (adds a leading newline)
      resources:
        {{- toYaml .Values.resources | nindent 8 }}
```

**Type mismatch** -- passing a string where YAML expects a number:

```yaml
# If service.port is "80" (string) instead of 80 (number):
port: {{ .Values.service.port }}    # renders as port: "80" -- invalid

# Fix: ensure values.yaml has the right type, or use int:
port: {{ .Values.service.port | int }}
```

> **Tip:** Develop iteratively: edit a template, run `helm template` to see the output, fix, repeat. This is much faster than installing and debugging in a live cluster.

---

### Testing Charts

Helm has a built-in test framework. Test templates live in `templates/tests/` and run as Pods when you invoke `helm test`.

*mychart/templates/tests/test-connection.yaml*

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: "{{ include "mychart.fullname" . }}-test-connection"
  labels:
    {{- include "mychart.labels" . | nindent 4 }}
  annotations:
    "helm.sh/hook": test           # marks this as a test pod
spec:
  containers:
    - name: wget
      image: busybox
      command: ['wget']
      args: ['{{ include "mychart.fullname" . }}:{{ .Values.service.port }}']
  restartPolicy: Never
```

The `helm.sh/hook: test` annotation tells Helm this Pod is a test, not a regular resource. It only runs when you explicitly call `helm test`.

*Run tests*

```bash
# Install the chart first
helm install myrelease ./mychart

# Run the tests
helm test myrelease
# NAME: myrelease
# LAST DEPLOYED: Sat Jan 31 10:00:00 2026
# NAMESPACE: default
# STATUS: deployed
# REVISION: 1
# TEST SUITE:     myrelease-mychart-test-connection
# Last Started:   Sat Jan 31 10:00:05 2026
# Last Completed: Sat Jan 31 10:00:08 2026
# Phase:          Succeeded
```

If the test Pod exits with code 0, the test passes. Non-zero means failure. You can write more sophisticated tests that check application behavior, database connectivity, or API responses.

> **Tip:** Add multiple test files for different aspects: `test-connection.yaml` for basic connectivity, `test-health.yaml` for health endpoint checks, `test-auth.yaml` for authentication flows.

---

### Packaging and Sharing

Once your chart is ready, you can package and distribute it.

#### Package into a .tgz Archive

```bash
helm package ./mychart
# Successfully packaged chart and saved it to: /home/user/mychart-0.1.0.tgz

# Package with a specific version override
helm package ./mychart --version 1.0.0
# Successfully packaged chart and saved it to: /home/user/mychart-1.0.0.tgz
```

The `.tgz` file contains the entire chart directory. This is what gets uploaded to chart repositories.

#### Push to an OCI Registry

Helm 3 supports OCI registries (Docker Hub, GitHub Container Registry, AWS ECR) as chart repositories:

```bash
# Log in to a registry
helm registry login ghcr.io -u myuser

# Push the packaged chart
helm push mychart-0.1.0.tgz oci://ghcr.io/myorg/charts
# Pushed: ghcr.io/myorg/charts/mychart:0.1.0

# Install from OCI registry
helm install myrelease oci://ghcr.io/myorg/charts/mychart --version 0.1.0
```

#### Traditional Chart Repository

A traditional Helm repo is a web server hosting `.tgz` files and an `index.yaml`:

```bash
# Generate the index file
helm repo index . --url https://charts.example.com

# The resulting index.yaml contains:
# apiVersion: v1
# entries:
#   mychart:
#   - apiVersion: v2
#     appVersion: "1.0.0"
#     created: "2026-01-31T10:00:00Z"
#     description: A Helm chart for my web application
#     name: mychart
#     urls:
#     - https://charts.example.com/mychart-0.1.0.tgz
#     version: 0.1.0

# Users add the repo and install
helm repo add myrepo https://charts.example.com
helm install myrelease myrepo/mychart
```

> **Tip:** For teams, OCI registries are the modern approach. You already have a container registry -- use it for charts too. GitHub Pages or S3 work well for traditional repos.

---

### Hands-On: Build a Chart from Scratch

Let's build a chart for a simple web application step by step, without using `helm create`.

#### Step 1: Create the Directory Structure

```bash
mkdir -p webapp/templates/tests
```

#### Step 2: Write Chart.yaml

*webapp/Chart.yaml*

```yaml
apiVersion: v2
name: webapp
description: A simple web application chart
type: application
version: 0.1.0
appVersion: "1.0.0"
```

#### Step 3: Write values.yaml

*webapp/values.yaml*

```yaml
replicaCount: 2

image:
  repository: nginx
  tag: "1.25"
  pullPolicy: IfNotPresent

service:
  type: ClusterIP
  port: 80

ingress:
  enabled: false
  className: nginx
  host: webapp.example.com

resources:
  requests:
    cpu: 50m
    memory: 64Mi
  limits:
    cpu: 100m
    memory: 128Mi
```

#### Step 4: Write _helpers.tpl

*webapp/templates/_helpers.tpl*

```yaml
{{- define "webapp.fullname" -}}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "webapp.labels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end }}

{{- define "webapp.selectorLabels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}
```

#### Step 5: Write deployment.yaml

*webapp/templates/deployment.yaml*

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "webapp.fullname" . }}
  labels:
    {{- include "webapp.labels" . | nindent 4 }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      {{- include "webapp.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "webapp.selectorLabels" . | nindent 8 }}
    spec:
      containers:
        - name: {{ .Chart.Name }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          ports:
            - name: http
              containerPort: {{ .Values.service.port }}
          livenessProbe:
            httpGet:
              path: /
              port: http
          readinessProbe:
            httpGet:
              path: /
              port: http
          {{- with .Values.resources }}
          resources:
            {{- toYaml . | nindent 12 }}
          {{- end }}
```

#### Step 6: Write service.yaml

*webapp/templates/service.yaml*

```yaml
apiVersion: v1
kind: Service
metadata:
  name: {{ include "webapp.fullname" . }}
  labels:
    {{- include "webapp.labels" . | nindent 4 }}
spec:
  type: {{ .Values.service.type }}
  ports:
    - port: {{ .Values.service.port }}
      targetPort: http
      protocol: TCP
      name: http
  selector:
    {{- include "webapp.selectorLabels" . | nindent 4 }}
```

#### Step 7: Write ingress.yaml (Conditional)

*webapp/templates/ingress.yaml*

```yaml
{{- if .Values.ingress.enabled }}
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{ include "webapp.fullname" . }}
  labels:
    {{- include "webapp.labels" . | nindent 4 }}
spec:
  ingressClassName: {{ .Values.ingress.className }}
  rules:
    - host: {{ .Values.ingress.host | quote }}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: {{ include "webapp.fullname" . }}
                port:
                  number: {{ .Values.service.port }}
{{- end }}
```

#### Step 8: Write the Test

*webapp/templates/tests/test-connection.yaml*

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: "{{ include "webapp.fullname" . }}-test"
  annotations:
    "helm.sh/hook": test
spec:
  containers:
    - name: test
      image: busybox
      command: ['wget']
      args: ['{{ include "webapp.fullname" . }}:{{ .Values.service.port }}', '-O', '/dev/null', '-q']
  restartPolicy: Never
```

#### Step 9: Lint and Render

```bash
# Lint the chart
helm lint ./webapp
# ==> Linting ./webapp
# [INFO] Chart.yaml: icon is recommended
# 1 chart(s) linted, 0 chart(s) failed

# Render templates to verify output
helm template myapp ./webapp
# ---
# Source: webapp/templates/service.yaml
# apiVersion: v1
# kind: Service
# metadata:
#   name: myapp-webapp
#   labels:
#     app.kubernetes.io/name: webapp
#     app.kubernetes.io/instance: myapp
#     app.kubernetes.io/version: "1.0.0"
#     helm.sh/chart: webapp-0.1.0
# spec:
#   type: ClusterIP
#   ports:
#     - port: 80
#       targetPort: http
#       protocol: TCP
#       name: http
#   selector:
#     app.kubernetes.io/name: webapp
#     app.kubernetes.io/instance: myapp
# ---
# Source: webapp/templates/deployment.yaml
# apiVersion: apps/v1
# kind: Deployment
# metadata:
#   name: myapp-webapp
# ...

# Render with ingress enabled
helm template myapp ./webapp --set ingress.enabled=true
# Now the Ingress resource appears in the output

# Render only the deployment
helm template myapp ./webapp --show-only templates/deployment.yaml
```

#### Step 10: Install and Test

```bash
# Install the chart
helm install myapp ./webapp
# NAME: myapp
# LAST DEPLOYED: Sat Jan 31 10:30:00 2026
# NAMESPACE: default
# STATUS: deployed
# REVISION: 1

# Verify resources were created
kubectl get all -l app.kubernetes.io/instance=myapp
# NAME                               READY   STATUS    RESTARTS   AGE
# pod/myapp-webapp-6d9f7c8b5-k2x4l   1/1     Running   0          30s
# pod/myapp-webapp-6d9f7c8b5-m8r7n   1/1     Running   0          30s
#
# NAME                   TYPE        CLUSTER-IP     EXTERNAL-IP   PORT(S)
# service/myapp-webapp   ClusterIP   10.96.45.123   <none>        80/TCP
#
# NAME                           READY   UP-TO-DATE   AVAILABLE   AGE
# deployment.apps/myapp-webapp   2/2     2            2           30s

# Run the test
helm test myapp
# TEST SUITE:     myapp-webapp-test
# Last Started:   Sat Jan 31 10:30:35 2026
# Last Completed: Sat Jan 31 10:30:37 2026
# Phase:          Succeeded

# Upgrade with different values
helm upgrade myapp ./webapp --set replicaCount=3 --set image.tag="1.26"

# Verify the upgrade
helm list
# NAME    NAMESPACE  REVISION  STATUS    CHART         APP VERSION
# myapp   default    2         deployed  webapp-0.1.0  1.0.0

# Package when ready to share
helm package ./webapp
# Successfully packaged chart and saved it to: /home/user/webapp-0.1.0.tgz

# Clean up
helm uninstall myapp
```

> **Tip:** Start with `helm create` for production charts -- it generates more complete templates with security contexts, HPA, and service accounts. Build from scratch (like above) when learning, so you understand every line.

---

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

## Module 16 Summary

- **Chart structure** follows a fixed layout: `Chart.yaml` (metadata), `values.yaml` (defaults), `templates/` (Go-templated manifests), `charts/` (dependencies)
- **`helm create`** scaffolds a fully functional chart -- use it as a starting point for production charts
- **Chart.yaml** defines name, version (chart version), appVersion (app version), type, and dependencies
- **values.yaml** is the user-facing API for your chart -- every configurable parameter lives here with a sensible default
- **Go templates** use `{{ .Values.key }}` to inject values, with built-in objects for Release, Chart, Capabilities, and Template info
- **Flow control** with `if/else`, `range` (loops), and `with` (scope change) lets templates adapt to different configurations
- **Whitespace control** with `{{-` and `-}}` prevents blank lines in rendered output
- **_helpers.tpl** defines reusable named templates (name, fullname, labels, selectorLabels) -- always use `include` over `template`
- **`toYaml | nindent N`** is the pattern for embedding YAML blocks at the correct indentation level
- **Debugging workflow:** `helm lint` for static checks, `helm template` for local rendering, `--dry-run --debug` for server-side validation
- **`helm test`** runs test Pods (annotated with `helm.sh/hook: test`) to verify the deployed release works
- **Packaging:** `helm package` creates a `.tgz` archive; distribute via OCI registries (`helm push`) or traditional chart repositories
