## Advanced Helm Templates

Module 16 covered chart structure and basic Go template syntax. This module goes deep on the template engine — the patterns that separate a beginner chart from a production-quality one. You will learn advanced flow control, named templates, the Sprig function library, hooks, subcharts, and library charts.

---

### Advanced Flow Control

Basic `if/else` gets you started, but real charts need nested conditions, boolean operators, and existence checks.

#### Nested if/else Chains

*templates/deployment.yaml (partial)*

```yaml
spec:
  template:
    spec:
      {{- if .Values.serviceAccount.create }}
      serviceAccountName: {{ include "myapp.serviceAccountName" . }}
      {{- else if .Values.serviceAccount.name }}
      serviceAccountName: {{ .Values.serviceAccount.name }}
      {{- else }}
      serviceAccountName: default
      {{- end }}
```

The dash in `{{-` trims whitespace before the tag. Without it, you get blank lines in your rendered YAML that can cause parsing issues.

#### Boolean Operators: and, or, not

Helm uses functions, not infix operators. `and`, `or`, and `not` are functions that take arguments:

```yaml
{{- if and .Values.ingress.enabled .Values.ingress.tls }}
  # ingress is enabled AND TLS is configured
{{- end }}

{{- if or .Values.redis.enabled .Values.externalRedis.host }}
  # either built-in Redis or external Redis is configured
{{- end }}

{{- if not .Values.autoscaling.enabled }}
  replicas: {{ .Values.replicaCount }}
{{- end }}
```

You can nest these for complex conditions:

```yaml
{{- if and .Values.monitoring.enabled (or .Values.monitoring.prometheus .Values.monitoring.datadog) }}
  # monitoring is on, and at least one backend is configured
{{- end }}
```

#### Ternary-Like Pattern

Go templates have no ternary operator, but you can use a single-line `if/else`:

```yaml
labels:
  environment: {{ if .Values.production }}prod{{ else }}dev{{ end }}
  tier: {{ if eq .Values.tier "frontend" }}web{{ else }}backend{{ end }}
```

Or use the `ternary` Sprig function:

```yaml
labels:
  environment: {{ ternary "prod" "dev" .Values.production }}
```

The signature is `ternary trueValue falseValue condition` — note the condition comes last.

#### Checking Existence vs Checking Value

These are different things. A key can exist but be empty, `false`, `0`, or `nil`:

```yaml
# Checks if .Values.config is truthy (fails for false, 0, "", nil, empty list/map)
{{- if .Values.config }}
  # config has a non-empty value
{{- end }}

# Checks if the key "config" exists at all in .Values (even if its value is false)
{{- if hasKey .Values "config" }}
  # the key exists, even if its value is false or 0
{{- end }}
```

> **Gotcha:** `{{ if .Values.replicas }}` evaluates to false when `replicas: 0`. If zero is a valid value, use `{{ if hasKey .Values "replicas" }}` or `{{ if ne .Values.replicas nil }}` instead.

#### Comparison Functions

```yaml
# Equality
{{- if eq .Values.env "production" }}

# Not equal
{{- if ne .Values.env "development" }}

# Greater than / less than (numeric)
{{- if gt (int .Values.replicaCount) 1 }}
{{- if lt (int .Values.maxRetries) 10 }}

# Greater than or equal / less than or equal
{{- if ge (int .Values.replicaCount) 3 }}
{{- if le (int .Values.maxRetries) 5 }}

# Check for empty values — empty returns true for "", 0, nil, false, empty list, empty map
{{- if empty .Values.nodeSelector }}
  # nodeSelector is not set or is empty
{{- end }}
```

---

### Advanced Loops

#### Iterating Over Maps

The most common pattern: generating environment variables from a values map.

*values.yaml*

```yaml
env:
  DATABASE_HOST: "db.example.com"
  DATABASE_PORT: "5432"
  LOG_LEVEL: "info"
  CACHE_TTL: "300"
```

*templates/deployment.yaml (partial)*

```yaml
spec:
  containers:
  - name: {{ .Chart.Name }}
    image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
    env:
    {{- range $key, $value := .Values.env }}
    - name: {{ $key }}
      value: {{ $value | quote }}
    {{- end }}
```

*Rendered output*

```yaml
env:
- name: CACHE_TTL
  value: "300"
- name: DATABASE_HOST
  value: "db.example.com"
- name: DATABASE_PORT
  value: "5432"
- name: LOG_LEVEL
  value: "info"
```

> **Tip:** Map iteration order in Go templates is sorted alphabetically by key. This makes output deterministic, which is good for `helm diff` and GitOps workflows.

#### Iterating Over Lists

*values.yaml*

```yaml
ingress:
  enabled: true
  hosts:
  - host: myapp.example.com
    paths:
    - path: /
      pathType: Prefix
  - host: api.example.com
    paths:
    - path: /v1
      pathType: Prefix
    - path: /v2
      pathType: Prefix
```

*templates/ingress.yaml (partial)*

```yaml
{{- if .Values.ingress.enabled }}
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{ include "myapp.fullname" . }}
spec:
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
            name: {{ include "myapp.fullname" $ }}
            port:
              number: {{ $.Values.service.port }}
      {{- end }}
  {{- end }}
{{- end }}
```

Notice the `$` in `{{ include "myapp.fullname" $ }}`. Inside a `range` loop, the dot (`.`) is rebound to the current item. To access the root context, use `$`.

#### Numeric Ranges with until

The `until` function generates a list of integers from 0 to n-1:

```yaml
# Generate 3 worker containers
spec:
  containers:
  {{- range $i, $e := until (int .Values.workerCount) }}
  - name: worker-{{ $i }}
    image: myapp/worker:latest
    env:
    - name: WORKER_ID
      value: {{ $i | quote }}
  {{- end }}
```

With `workerCount: 3`, this renders workers named `worker-0`, `worker-1`, `worker-2`.

#### Variable Scoping in Loops

Inside `range`, `.` refers to the current element. This is the most common source of confusion:

```yaml
# WRONG — .Release.Name is not accessible inside range
{{- range .Values.ports }}
- name: {{ .Release.Name }}-{{ .name }}    # ERROR: .Release is not in scope
  port: {{ .port }}
{{- end }}

# RIGHT — use $ to access the root scope
{{- range .Values.ports }}
- name: {{ $.Release.Name }}-{{ .name }}   # $ always points to root
  port: {{ .port }}
{{- end }}
```

You can also capture values in variables before entering the loop:

```yaml
{{- $releaseName := .Release.Name }}
{{- range .Values.ports }}
- name: {{ $releaseName }}-{{ .name }}
  port: {{ .port }}
{{- end }}
```

---

### Named Templates and Partials

Named templates (also called partials) let you define reusable template fragments. They live in `_helpers.tpl` (or any file starting with `_` in the `templates/` directory).

#### define, template, and include

*templates/_helpers.tpl*

```yaml
{{/*
Create a standard set of labels.
*/}}
{{- define "myapp.labels" -}}
helm.sh/chart: {{ include "myapp.chart" . }}
app.kubernetes.io/name: {{ include "myapp.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels — a subset used in matchLabels.
*/}}
{{- define "myapp.selectorLabels" -}}
app.kubernetes.io/name: {{ include "myapp.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the full image spec with registry, repository, and tag.
*/}}
{{- define "myapp.image" -}}
{{- if .Values.image.registry -}}
{{ .Values.image.registry }}/{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}
{{- else -}}
{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}
{{- end -}}
{{- end }}
```

#### Why include Is Better Than template

Both `template` and `include` render a named template. The difference: `include` returns a string that you can pipe. `template` renders directly and cannot be piped.

```yaml
# Using template — CANNOT pipe the result
metadata:
  labels:
    {{ template "myapp.labels" . }}

# Using include — CAN pipe through nindent for proper indentation
metadata:
  labels:
    {{- include "myapp.labels" . | nindent 4 }}
```

> **Tip:** Always use `include` instead of `template`. The ability to pipe output through `nindent` is essential for correct YAML indentation. The `template` action is a Go template builtin; `include` is a Helm addition specifically to solve this problem.

#### Passing Context to Named Templates

The second argument to `include` is the context (what `.` will be inside the template). You usually pass `.` (current scope), but you can pass anything:

```yaml
# Pass the full root context
{{- include "myapp.labels" . }}

# Pass a specific sub-object
{{- include "myapp.containerSpec" .Values.frontend }}

# Build a custom context with dict
{{- include "myapp.container" (dict "root" . "container" .Values.sidecar) }}
```

Inside the named template, access the dict keys:

```yaml
{{- define "myapp.container" -}}
- name: {{ .container.name }}
  image: {{ .container.image }}
  env:
  - name: RELEASE
    value: {{ .root.Release.Name }}
{{- end }}
```

#### Organizing Helpers Across Multiple Files

Any file beginning with `_` in the `templates/` directory is treated as a partial (not rendered as a manifest). You can split helpers logically:

```
templates/
  _helpers.tpl          # names, labels, selectors, fullname
  _images.tpl           # image spec helpers
  _annotations.tpl      # standard annotations
  _env.tpl              # environment variable helpers
  deployment.yaml
  service.yaml
  ingress.yaml
```

All `define` blocks from all `_*.tpl` files are available everywhere. There is no import mechanism — they share a global namespace.

> **Gotcha:** Template names are global across the chart and all subcharts. If your chart and a subchart both define `"myapp.labels"`, they collide. Convention: always prefix template names with the chart name: `"mychart.labels"`, `"mychart.fullname"`.

---

### Sprig Functions Library

Helm includes the [Sprig](https://masterminds.github.io/sprig/) template function library, giving you 70+ utility functions. Here are the ones you will use most.

#### String Functions

```yaml
# Trim whitespace
{{ "  hello  " | trim }}                  # "hello"

# Case conversion
{{ "hello" | upper }}                     # "HELLO"
{{ "HELLO" | lower }}                     # "hello"
{{ "hello world" | title }}               # "Hello World"

# Replace
{{ "hello-world" | replace "-" "_" }}     # "hello_world"

# Contains / prefix / suffix
{{ if contains "prod" .Values.env }}      # true if env contains "prod"
{{ if hasPrefix "v" .Values.tag }}        # true if tag starts with "v"
{{ if hasSuffix ".com" .Values.host }}    # true if host ends with ".com"

# Quoting — essential for YAML strings
{{ .Values.name | quote }}                # "my-app"     (double quotes)
{{ .Values.name | squote }}               # 'my-app'     (single quotes)
```

#### List Functions

```yaml
# Access elements
{{ first .Values.servers }}               # first element
{{ last .Values.servers }}                # last element

# Build and modify lists
{{ $new := append .Values.servers "extra" }}
{{ $new := prepend .Values.servers "first" }}
{{ $combined := concat .Values.list1 .Values.list2 }}

# Deduplicate and sort
{{ .Values.tags | uniq | sortAlpha }}
```

#### Dict (Map) Functions

```yaml
# Create a dict inline
{{ $labels := dict "app" .Release.Name "version" .Chart.AppVersion }}

# Access and check keys
{{ get $labels "app" }}                   # value of "app" key
{{ hasKey .Values "ingress" }}            # true if key exists

# Get all keys or values
{{ keys .Values.env | sortAlpha }}        # sorted list of keys
{{ values .Values.env }}                  # list of values

# Merge two dicts (first wins on conflicts)
{{ $merged := merge .Values.defaults .Values.overrides }}

# Merge with overwrite (second wins on conflicts)
{{ $merged := mergeOverwrite .Values.defaults .Values.overrides }}
```

*Practical example — merge default and user-provided annotations:*

```yaml
{{- $defaultAnnotations := dict "app.kubernetes.io/managed-by" "Helm" }}
{{- $annotations := mergeOverwrite $defaultAnnotations (.Values.annotations | default dict) }}
metadata:
  annotations:
    {{- toYaml $annotations | nindent 4 }}
```

#### Type Conversion Functions

```yaml
# String/int conversion
{{ .Values.port | toString }}             # "8080"
{{ .Values.count | int }}                 # ensures integer type
{{ "42" | atoi }}                         # string to int: 42
{{ .Values.timeout | int64 }}             # 64-bit integer

# YAML/JSON conversion — critically important
{{ .Values.config | toYaml }}             # Go object → YAML string
{{ .Values.config | toJson }}             # Go object → JSON string
{{ .Values.config | toPrettyJson }}       # Go object → pretty JSON

# Parse strings back to objects
{{ "key: value" | fromYaml }}             # YAML string → Go object
{{ `{"key":"value"}` | fromJson }}        # JSON string → Go object
```

#### Crypto and Encoding Functions

```yaml
# SHA256 hash — useful for annotation-triggered rollouts
{{ .Values.config | toYaml | sha256sum }}

# Base64 encode/decode — for Secrets
{{ "my-password" | b64enc }}              # bXktcGFzc3dvcmQ=
{{ "bXktcGFzc3dvcmQ=" | b64dec }}        # my-password
```

*Practical example — trigger Deployment rollout when ConfigMap changes:*

```yaml
metadata:
  annotations:
    checksum/config: {{ include (print $.Template.BasePath "/configmap.yaml") . | sha256sum }}
```

When the ConfigMap content changes, the annotation changes, which changes the Pod template, which triggers a rolling update.

#### Date Functions

```yaml
# Current timestamp
{{ now | date "2006-01-02" }}             # "2026-01-31"
{{ now | date "15:04:05" }}               # "14:30:00"
{{ now | unixEpoch }}                     # 1769904600
```

> **Gotcha:** Go date formatting uses a reference date: `Mon Jan 2 15:04:05 MST 2006`. This is not a placeholder format like `YYYY-MM-DD`. You must use `2006` for year, `01` for month, `02` for day. It looks strange but this is how Go works.

---

### toYaml and nindent

This is arguably the most important pattern in Helm. It lets you embed entire YAML blocks from values into your templates.

#### The Core Pattern

*values.yaml*

```yaml
resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 500m
    memory: 256Mi
```

*templates/deployment.yaml (partial)*

```yaml
spec:
  containers:
  - name: {{ .Chart.Name }}
    image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
    resources:
      {{- toYaml .Values.resources | nindent 6 }}
```

*Rendered output*

```yaml
spec:
  containers:
  - name: myapp
    image: "myapp/web:1.0.0"
    resources:
      requests:
        cpu: 100m
        memory: 128Mi
      limits:
        cpu: 500m
        memory: 256Mi
```

#### Why nindent Is Critical

YAML is whitespace-sensitive. The `nindent` function does two things:

1. Adds a **newline** before the text
2. **Indents** every line by the specified number of spaces

Without `nindent`, your YAML will break:

```yaml
# WRONG — toYaml output starts on the same line as "resources:"
    resources:
      {{ toYaml .Values.resources }}
# Renders as:
#     resources:
#       requests:        ← first line at wrong indent
#   cpu: 100m            ← subsequent lines at column 0
#   memory: 128Mi

# RIGHT — nindent adds newline + consistent indentation
    resources:
      {{- toYaml .Values.resources | nindent 6 }}
# Renders correctly with all lines at the right indent level
```

#### indent vs nindent

| Function | Behavior |
|----------|----------|
| `indent N` | Adds N spaces to the beginning of each line. Does NOT add a leading newline. |
| `nindent N` | Adds a **newline** first, then N spaces to the beginning of each line. |

Use `nindent` in almost all cases. The leading newline combined with `{{-` (trim preceding whitespace) gives you clean output. Use `indent` only when you need inline content on the same line.

#### Common Patterns

*nodeSelector, tolerations, affinity — all follow the same pattern:*

```yaml
spec:
  template:
    spec:
      {{- with .Values.nodeSelector }}
      nodeSelector:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- with .Values.tolerations }}
      tolerations:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- with .Values.affinity }}
      affinity:
        {{- toYaml . | nindent 8 }}
      {{- end }}
```

The `with` action is like `if` but also rebinds `.` to the value being tested. If `.Values.nodeSelector` is nil or empty, the entire block is skipped.

> **Tip:** The `with` + `toYaml` + `nindent` pattern is the standard way to handle optional YAML blocks in Helm. Count the indent level carefully — miscounting by even one space breaks YAML.

---

### The Lookup Function

The `lookup` function lets your template query the Kubernetes cluster for existing resources during `helm install` or `helm upgrade`.

#### Syntax

```
{{ lookup "API_VERSION" "KIND" "NAMESPACE" "NAME" }}
```

- Pass an empty string for namespace to look in all namespaces
- Pass an empty string for name to list all resources of that kind

#### Use Case: Reuse an Existing Secret

A common pattern: check if a Secret already exists. If it does, reuse its data. If not, generate a new password.

*templates/secret.yaml*

```yaml
{{- $existing := lookup "v1" "Secret" .Release.Namespace "myapp-secret" }}
apiVersion: v1
kind: Secret
metadata:
  name: myapp-secret
type: Opaque
data:
  {{- if $existing }}
  # Reuse existing password — don't regenerate on upgrade
  password: {{ index $existing.data "password" }}
  {{- else }}
  # First install — generate a random password
  password: {{ randAlphaNum 32 | b64enc | quote }}
  {{- end }}
```

Without this pattern, `helm upgrade` would regenerate the password every time, breaking your application.

#### Use Case: Check if a CRD Exists

```yaml
{{- if lookup "apiextensions.k8s.io/v1" "CustomResourceDefinition" "" "certificates.cert-manager.io" }}
# cert-manager is installed, create a Certificate
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: {{ include "myapp.fullname" . }}-tls
spec:
  secretName: {{ include "myapp.fullname" . }}-tls
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
  dnsNames:
  - {{ .Values.ingress.host }}
{{- end }}
```

#### Limitations

```bash
# lookup works during install/upgrade (talks to a real cluster)
helm install myapp ./mychart
helm upgrade myapp ./mychart

# lookup returns EMPTY during template rendering (no cluster)
helm template myapp ./mychart
# All lookup calls return an empty dict — your conditionals
# must handle this gracefully
```

> **Gotcha:** Always write lookup conditionals so they produce valid YAML when lookup returns empty. If your template depends entirely on lookup results, provide a fallback for `helm template` users.

---

### Subcharts and Dependencies

Real applications are composed of multiple components. Helm handles this with chart dependencies.

#### Declaring Dependencies

*Chart.yaml*

```yaml
apiVersion: v2
name: myapp
version: 1.0.0
appVersion: "2.0"
dependencies:
- name: postgresql
  version: "12.5.9"
  repository: "https://charts.bitnami.com/bitnami"
- name: redis
  version: "17.11.6"
  repository: "https://charts.bitnami.com/bitnami"
  condition: redis.enabled
- name: kafka
  version: "23.0.7"
  repository: "https://charts.bitnami.com/bitnami"
  tags:
  - messaging
```

```bash
# Download dependencies into the charts/ directory
helm dependency update ./mychart
# Hang tight while we grab the latest from your chart repositories...
# ...Successfully got an update from the "bitnami" chart repository
# Saving 3 charts
# Downloading postgresql from repo https://charts.bitnami.com/bitnami
# Downloading redis from repo https://charts.bitnami.com/bitnami
# Downloading kafka from repo https://charts.bitnami.com/bitnami
# Deleting outdated charts

# Verify
ls ./mychart/charts/
# kafka-23.0.7.tgz  postgresql-12.5.9.tgz  redis-17.11.6.tgz

# List current dependencies and their status
helm dependency list ./mychart
# NAME          VERSION   REPOSITORY                              STATUS
# postgresql    12.5.9    https://charts.bitnami.com/bitnami      ok
# redis         17.11.6   https://charts.bitnami.com/bitnami      ok
# kafka         23.0.7    https://charts.bitnami.com/bitnami      ok
```

#### Overriding Subchart Values

Pass values to a subchart by nesting them under the subchart's name:

*values.yaml*

```yaml
# Values for the parent chart
replicaCount: 3
image:
  repository: myapp/web
  tag: "2.0"

# Values passed to the postgresql subchart
postgresql:
  auth:
    username: myapp
    password: secretpass
    database: myapp_production
  primary:
    resources:
      requests:
        cpu: 250m
        memory: 256Mi

# Values passed to the redis subchart
redis:
  enabled: true
  architecture: standalone
  auth:
    password: redis-secret

# Values passed to the kafka subchart
kafka:
  replicaCount: 3
```

#### Global Values

Values under the `global` key are accessible from the parent chart and all subcharts:

*values.yaml*

```yaml
global:
  imageRegistry: registry.example.com
  imagePullSecrets:
  - name: regcred
  storageClass: fast-ssd
```

In any chart or subchart template:

```yaml
image: {{ .Values.global.imageRegistry }}/{{ .Values.image.repository }}:{{ .Values.image.tag }}

# In a subchart, global values appear at .Values.global
# The parent and all subcharts see the same global values
```

#### Conditional Dependencies

The `condition` field enables/disables a subchart based on a values key:

```yaml
# In Chart.yaml
dependencies:
- name: redis
  version: "17.11.6"
  repository: "https://charts.bitnami.com/bitnami"
  condition: redis.enabled      # ← checks .Values.redis.enabled
```

```yaml
# values.yaml — enable or disable redis
redis:
  enabled: true    # set to false to skip installing Redis entirely
```

The `tags` field provides a grouping mechanism:

```yaml
# In Chart.yaml
dependencies:
- name: kafka
  condition: kafka.enabled
  tags:
  - messaging
- name: rabbitmq
  condition: rabbitmq.enabled
  tags:
  - messaging

# values.yaml — enable/disable by tag
tags:
  messaging: false    # disables both kafka and rabbitmq
```

> **Tip:** `condition` takes precedence over `tags`. If `condition` is set and evaluates to a boolean, it overrides whatever `tags` says. Use `condition` for individual control and `tags` for group control.

---

### Library Charts

A library chart contains **only named templates** — no Kubernetes resources. It standardizes common patterns across multiple charts in your organization.

#### Creating a Library Chart

*Chart.yaml*

```yaml
apiVersion: v2
name: myorg-lib
version: 1.0.0
type: library    # ← this is the key: no resources rendered
```

*templates/_labels.tpl*

```yaml
{{- define "myorg-lib.labels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
myorg.com/team: {{ .Values.team | default "unknown" }}
myorg.com/cost-center: {{ .Values.costCenter | default "engineering" }}
{{- end }}

{{- define "myorg-lib.selectorLabels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}
```

*templates/_resources.tpl*

```yaml
{{- define "myorg-lib.deployment" -}}
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "myorg-lib.fullname" . }}
  labels:
    {{- include "myorg-lib.labels" . | nindent 4 }}
spec:
  replicas: {{ .Values.replicaCount | default 1 }}
  selector:
    matchLabels:
      {{- include "myorg-lib.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "myorg-lib.selectorLabels" . | nindent 8 }}
    spec:
      containers:
      - name: {{ .Chart.Name }}
        image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
        {{- with .Values.resources }}
        resources:
          {{- toYaml . | nindent 10 }}
        {{- end }}
{{- end }}
```

#### Consuming a Library Chart

In the consuming chart's Chart.yaml:

```yaml
apiVersion: v2
name: my-service
version: 1.0.0
dependencies:
- name: myorg-lib
  version: "1.0.0"
  repository: "https://charts.example.com"
```

In the consuming chart's templates:

*templates/deployment.yaml*

```yaml
{{- include "myorg-lib.deployment" . }}
```

That single line renders a complete, standardized Deployment. Every team in your organization gets consistent labels, annotations, and structure.

> **Tip:** Library charts enforce organizational standards without copy-pasting. When you update the library, all consuming charts get the changes on their next `helm dependency update`.

---

### Chart Hooks

Hooks let you run actions at specific points in a release lifecycle. They are normal Kubernetes resources (usually Jobs) with special annotations.

#### Hook Types

| Hook | Fires When |
|------|-----------|
| `pre-install` | After templates render, before any resources are created |
| `post-install` | After all resources are created |
| `pre-upgrade` | After templates render, before any resources are updated |
| `post-upgrade` | After all resources are updated |
| `pre-delete` | Before any resources are deleted |
| `post-delete` | After all resources are deleted |
| `pre-rollback` | Before a rollback is executed |
| `post-rollback` | After a rollback completes |
| `test` | When `helm test` is run |

#### Database Migration Hook

The most common use case: run a database migration before upgrading application Pods.

*templates/migration-job.yaml*

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: {{ include "myapp.fullname" . }}-migrate
  labels:
    {{- include "myapp.labels" . | nindent 4 }}
  annotations:
    "helm.sh/hook": pre-upgrade,pre-install
    "helm.sh/hook-weight": "-5"
    "helm.sh/hook-delete-policy": before-hook-creation
spec:
  backoffLimit: 3
  activeDeadlineSeconds: 300
  template:
    spec:
      restartPolicy: Never
      containers:
      - name: migrate
        image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
        command: ["python", "manage.py", "migrate", "--no-input"]
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: {{ include "myapp.fullname" . }}-db
              key: url
```

#### Hook Weight

When multiple hooks fire at the same point, `hook-weight` controls execution order. Lower weights run first. Weights are strings that are sorted numerically:

```yaml
annotations:
  "helm.sh/hook": pre-upgrade
  "helm.sh/hook-weight": "-10"     # runs first

annotations:
  "helm.sh/hook": pre-upgrade
  "helm.sh/hook-weight": "0"       # runs second (default)

annotations:
  "helm.sh/hook": pre-upgrade
  "helm.sh/hook-weight": "5"       # runs third
```

Helm waits for each hook to reach a Ready/Completed state before running the next one.

#### Hook Delete Policies

Hooks create real resources that stick around. The delete policy controls cleanup:

| Policy | Behavior |
|--------|----------|
| `before-hook-creation` | Delete the previous hook resource before launching a new one. Most common choice. |
| `hook-succeeded` | Delete the hook resource after it succeeds. |
| `hook-failed` | Delete the hook resource if it fails. |

You can combine policies:

```yaml
annotations:
  "helm.sh/hook-delete-policy": before-hook-creation,hook-succeeded
```

> **Gotcha:** Without a delete policy, hook resources remain after every install/upgrade. Failed Job Pods accumulate. Always set `before-hook-creation` at minimum so old hook resources get cleaned up before a new release runs.

#### Smoke Test Hook

Run a post-install test to verify the release works:

*templates/tests/test-connection.yaml*

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: {{ include "myapp.fullname" . }}-test
  labels:
    {{- include "myapp.labels" . | nindent 4 }}
  annotations:
    "helm.sh/hook": test
spec:
  restartPolicy: Never
  containers:
  - name: test
    image: curlimages/curl:8.1.2
    command: ['curl', '--fail', '--silent', '--show-error']
    args: ['http://{{ include "myapp.fullname" . }}:{{ .Values.service.port }}/healthz']
```

```bash
helm test myapp
# NAME: myapp
# LAST DEPLOYED: Fri Jan 31 14:30:00 2026
# NAMESPACE: default
# STATUS: deployed
# TEST SUITE:     myapp-test
# Last Started:   Fri Jan 31 14:30:15 2026
# Last Completed: Fri Jan 31 14:30:18 2026
# Phase:          Succeeded
```

#### Pre-Delete Backup Hook

Take a backup before uninstalling:

*templates/backup-job.yaml*

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: {{ include "myapp.fullname" . }}-backup
  annotations:
    "helm.sh/hook": pre-delete
    "helm.sh/hook-weight": "-5"
    "helm.sh/hook-delete-policy": hook-succeeded
spec:
  template:
    spec:
      restartPolicy: Never
      containers:
      - name: backup
        image: "{{ .Values.backup.image }}"
        command: ["sh", "-c", "pg_dump $DATABASE_URL | gzip > /backups/pre-delete-$(date +%s).sql.gz"]
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: {{ include "myapp.fullname" . }}-db
              key: url
```

---

### Advanced Patterns

#### Conditional Resource Creation

The simplest advanced pattern: only create a resource when a feature is enabled.

```yaml
{{- if .Values.ingress.enabled }}
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{ include "myapp.fullname" . }}
  {{- with .Values.ingress.annotations }}
  annotations:
    {{- toYaml . | nindent 4 }}
  {{- end }}
spec:
  {{- if .Values.ingress.tls }}
  tls:
    {{- range .Values.ingress.tls }}
    - secretName: {{ .secretName }}
      hosts:
        {{- range .hosts }}
        - {{ . | quote }}
        {{- end }}
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
                name: {{ include "myapp.fullname" $ }}
                port:
                  number: {{ $.Values.service.port }}
          {{- end }}
    {{- end }}
{{- end }}
```

#### Dynamic Resource Names Per Environment

```yaml
metadata:
  name: {{ include "myapp.fullname" . }}{{ if ne .Values.env "production" }}-{{ .Values.env }}{{ end }}
  labels:
    environment: {{ .Values.env | default "development" }}
```

#### Generating ConfigMaps from Files

Helm can read files from the chart directory and embed them into resources.

*Chart directory structure:*

```
mychart/
  Chart.yaml
  values.yaml
  config/
    nginx.conf
    app.properties
    logging.xml
  templates/
    configmap.yaml
```

*templates/configmap.yaml*

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: {{ include "myapp.fullname" . }}-config
data:
  {{- range $path, $_ := .Files.Glob "config/**" }}
  {{ base $path }}: |-
    {{ $.Files.Get $path | nindent 4 }}
  {{- end }}
```

This iterates over every file in the `config/` directory and embeds its contents as a ConfigMap key.

#### Files Functions Reference

| Function | Returns |
|----------|---------|
| `.Files.Get "path"` | File contents as a string |
| `.Files.Glob "pattern"` | Map of matching paths to file objects |
| `.Files.AsConfig` | File contents formatted as a ConfigMap `data` section |
| `.Files.AsSecrets` | File contents base64-encoded as a Secret `data` section |
| `.Files.Lines "path"` | File contents as a slice of lines |

*Using AsConfig for a simpler ConfigMap:*

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: {{ include "myapp.fullname" . }}-config
data:
  {{ (.Files.Glob "config/*").AsConfig | nindent 2 }}
```

*Using AsSecrets for TLS certificates:*

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: {{ include "myapp.fullname" . }}-tls
type: kubernetes.io/tls
data:
  {{ (.Files.Glob "certs/*").AsSecrets | nindent 2 }}
```

> **Gotcha:** Files in the `templates/` directory are not accessible via `.Files`. The `templates/` directory is reserved for Go templates. Put data files in any other directory (`config/`, `files/`, `certs/`, etc.). Also, files cannot be accessed from subcharts — each chart can only read its own files.

#### Putting It All Together: A Production Template Snippet

Here is a realistic Deployment template combining many patterns from this module:

*templates/deployment.yaml*

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "myapp.fullname" . }}
  labels:
    {{- include "myapp.labels" . | nindent 4 }}
  annotations:
    checksum/config: {{ include (print $.Template.BasePath "/configmap.yaml") . | sha256sum }}
    checksum/secret: {{ include (print $.Template.BasePath "/secret.yaml") . | sha256sum }}
spec:
  {{- if not .Values.autoscaling.enabled }}
  replicas: {{ .Values.replicaCount }}
  {{- end }}
  selector:
    matchLabels:
      {{- include "myapp.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "myapp.selectorLabels" . | nindent 8 }}
    spec:
      {{- with .Values.imagePullSecrets }}
      imagePullSecrets:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      serviceAccountName: {{ include "myapp.serviceAccountName" . }}
      containers:
      - name: {{ .Chart.Name }}
        image: {{ include "myapp.image" . }}
        imagePullPolicy: {{ .Values.image.pullPolicy }}
        ports:
        - name: http
          containerPort: {{ .Values.containerPort | default 8080 }}
          protocol: TCP
        {{- if .Values.env }}
        env:
          {{- range $key, $value := .Values.env }}
          - name: {{ $key }}
            value: {{ $value | quote }}
          {{- end }}
        {{- end }}
        {{- with .Values.envFrom }}
        envFrom:
          {{- toYaml . | nindent 10 }}
        {{- end }}
        {{- with .Values.resources }}
        resources:
          {{- toYaml . | nindent 10 }}
        {{- end }}
        {{- with .Values.livenessProbe }}
        livenessProbe:
          {{- toYaml . | nindent 10 }}
        {{- end }}
        {{- with .Values.readinessProbe }}
        readinessProbe:
          {{- toYaml . | nindent 10 }}
        {{- end }}
      {{- with .Values.nodeSelector }}
      nodeSelector:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- with .Values.tolerations }}
      tolerations:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- with .Values.affinity }}
      affinity:
        {{- toYaml . | nindent 8 }}
      {{- end }}
```

This template is conditional, composable, and handles missing values gracefully. It follows every pattern covered in this module.

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

## Module 17 Summary

- **Advanced flow control:** nested `if/else` chains, `and`/`or`/`not` operators, ternary patterns with `{{ ternary "a" "b" .condition }}`
- **Existence checks:** `{{ if .Values.x }}` checks truthiness; `{{ if hasKey .Values "x" }}` checks key existence — critical when `0` or `false` are valid values
- **Comparison functions:** `eq`, `ne`, `gt`, `lt`, `ge`, `le`, `empty` — cover all conditional logic needs
- **Range loops:** iterate maps with `$key, $value`, lists with `.`, and numeric ranges with `until`
- **Scope in loops:** `.` is rebound inside `range` — use `$` to access the root scope or capture variables before the loop
- **Named templates:** `define` in `_helpers.tpl`, invoke with `include` (not `template`) so you can pipe through `nindent`
- **Passing context:** the second argument to `include` becomes `.` inside the named template — pass `dict` for multiple values
- **Sprig functions:** string (`trim`, `quote`, `upper`), list (`first`, `append`, `sortAlpha`), dict (`dict`, `merge`, `hasKey`), type conversion (`toYaml`, `toJson`, `atoi`), crypto (`sha256sum`, `b64enc`), date (`now`, `date`)
- **toYaml + nindent:** the essential pattern for embedding YAML blocks — `{{- toYaml .Values.resources | nindent 12 }}`
- **indent vs nindent:** `nindent` adds a leading newline; `indent` does not — use `nindent` with `{{-` in almost all cases
- **with:** combines an existence check with scope rebinding — `{{- with .Values.tolerations }}` skips the block if empty and sets `.` to the value
- **lookup:** query cluster resources during install/upgrade — returns empty during `helm template`
- **Subcharts:** declared in `Chart.yaml` under `dependencies`, installed with `helm dependency update`
- **Subchart values:** nest values under the subchart name; `global` values are shared across all charts
- **condition and tags:** `condition` enables/disables individual subcharts; `tags` groups multiple subcharts
- **Library charts:** `type: library` — reusable template helpers with no rendered resources, enforcing organizational standards
- **Hooks:** lifecycle annotations (`pre-install`, `post-upgrade`, `pre-delete`, etc.) on Jobs or Pods for migrations, backups, and tests
- **Hook weights:** numeric ordering for multiple hooks at the same lifecycle point — lower runs first
- **Hook delete policies:** `before-hook-creation` prevents resource accumulation across releases
- **Conditional resources:** `{{ if .Values.ingress.enabled }}` wraps entire resource files
- **.Files functions:** `Get`, `Glob`, `AsConfig`, `AsSecrets` — embed chart files into ConfigMaps and Secrets
- **Checksum annotations:** `sha256sum` on ConfigMap/Secret content triggers Pod rollouts when config changes
