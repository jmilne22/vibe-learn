## ConfigMaps & Secrets

In production, you never hardcode configuration into your container image. The same image should run in dev, staging, and production -- the only thing that changes is the configuration. Kubernetes solves this with two resources: **ConfigMaps** for non-sensitive config and **Secrets** for sensitive data like passwords and API keys.

```
┌─────────────────────────────────────────────────────────────┐
│                     Same Container Image                     │
│                      myapp:v2.1.0                            │
└──────────┬──────────────────┬──────────────────┬────────────┘
           │                  │                  │
    ┌──────▼──────┐    ┌──────▼──────┐    ┌──────▼──────┐
    │     DEV     │    │   STAGING   │    │    PROD     │
    │             │    │             │    │             │
    │ DB_HOST=    │    │ DB_HOST=    │    │ DB_HOST=    │
    │  localhost  │    │  staging-db │    │  prod-db    │
    │ LOG_LEVEL=  │    │ LOG_LEVEL=  │    │ LOG_LEVEL=  │
    │  debug      │    │  info       │    │  warn       │
    │ DB_PASS=    │    │ DB_PASS=    │    │ DB_PASS=    │
    │  devpass    │    │  stg-s3crt  │    │  pr0d!Pa$s  │
    └─────────────┘    └─────────────┘    └─────────────┘
         ConfigMap          ConfigMap          ConfigMap
         + Secret           + Secret           + Secret
```

This is the **12-factor app** principle: store config in the environment, not in code. Your image is built once, tested once, and promoted through environments. Only the ConfigMaps and Secrets change.

### Why Separate Config from Code

Hardcoding config causes real problems:

- **Rebuild for every environment** -- different DB host means a new image build
- **Secrets in source code** -- passwords committed to git, visible in image layers
- **No rollback isolation** -- rolling back config means rolling back code too
- **Inconsistent testing** -- the image you tested is not the image you deploy

ConfigMaps and Secrets decouple configuration from the container image. You inject config at runtime, not build time.

---

## ConfigMaps

A ConfigMap holds non-sensitive key-value configuration data. Think database hostnames, feature flags, log levels, config files -- anything that is not a secret.

### Creating ConfigMaps Imperatively

*From literal key-value pairs*

```bash
kubectl create configmap app-config \
  --from-literal=DB_HOST=postgres \
  --from-literal=DB_PORT=5432 \
  --from-literal=LOG_LEVEL=info
# configmap/app-config created

kubectl get configmap app-config -o yaml
# apiVersion: v1
# kind: ConfigMap
# metadata:
#   name: app-config
#   namespace: default
# data:
#   DB_HOST: postgres
#   DB_PORT: "5432"
#   LOG_LEVEL: info
```

*From a file*

```bash
# Suppose you have an nginx config file:
# nginx.conf contains your custom nginx configuration

kubectl create configmap nginx-conf --from-file=nginx.conf
# configmap/nginx-conf created

# The filename becomes the key, file contents become the value:
kubectl describe configmap nginx-conf
# Name:         nginx-conf
# Data:
# ====
# nginx.conf:
# ----
# worker_processes auto;
# events { worker_connections 1024; }
# http { ... }
```

*From a file with a custom key name*

```bash
kubectl create configmap nginx-conf --from-file=my-nginx.conf=nginx.conf
# Key is "my-nginx.conf" instead of "nginx.conf"
```

*From a directory (every file becomes a key)*

```bash
# Given a directory with multiple config files:
# config-dir/
#   database.properties
#   cache.properties
#   feature-flags.json

kubectl create configmap app-settings --from-file=config-dir/
# configmap/app-settings created
# Each file in the directory becomes a key in the ConfigMap
```

### Declarative ConfigMap YAML

For anything you want to track in git, write the ConfigMap as YAML.

*app-config.yaml*

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
  namespace: default
data:
  # Simple key-value pairs
  DB_HOST: postgres
  DB_PORT: "5432"
  LOG_LEVEL: info
  CACHE_TTL: "300"

  # Multi-line value (an entire config file)
  app.properties: |
    server.port=8080
    server.context-path=/api
    spring.datasource.url=jdbc:postgresql://postgres:5432/mydb
    spring.jpa.hibernate.ddl-auto=validate

  # Another config file
  nginx.conf: |
    worker_processes auto;
    events {
        worker_connections 1024;
    }
    http {
        server {
            listen 80;
            location / {
                proxy_pass http://localhost:8080;
            }
        }
    }
```

```bash
kubectl apply -f app-config.yaml
# configmap/app-config created
```

> **Tip:** ConfigMaps also have a `binaryData` field for binary content (base64-encoded). Use it for binary config files like Java keystores. Most of the time you will use `data`.

---

## Using ConfigMaps

There are two ways to consume a ConfigMap: as **environment variables** or as **mounted files**. Both are common and serve different purposes.

### As Environment Variables (Single Key)

Use `valueFrom.configMapKeyRef` to inject a single key from a ConfigMap into an environment variable:

*deployment-env-single.yaml*

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
spec:
  replicas: 2
  selector:
    matchLabels:
      app: myapp
  template:
    metadata:
      labels:
        app: myapp
    spec:
      containers:
      - name: myapp
        image: myapp:v1
        env:
        - name: DATABASE_HOST
          valueFrom:
            configMapKeyRef:
              name: app-config
              key: DB_HOST
        - name: DATABASE_PORT
          valueFrom:
            configMapKeyRef:
              name: app-config
              key: DB_PORT
        - name: LOG_LEVEL
          valueFrom:
            configMapKeyRef:
              name: app-config
              key: LOG_LEVEL
              optional: true    # Pod starts even if key is missing
```

### As Environment Variables (All Keys)

Use `envFrom` to inject every key from a ConfigMap as an environment variable:

*deployment-env-all.yaml*

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
spec:
  replicas: 2
  selector:
    matchLabels:
      app: myapp
  template:
    metadata:
      labels:
        app: myapp
    spec:
      containers:
      - name: myapp
        image: myapp:v1
        envFrom:
        - configMapRef:
            name: app-config
          prefix: CFG_            # optional: all keys get this prefix
```

With `prefix: CFG_`, the key `DB_HOST` becomes the env var `CFG_DB_HOST` inside the container.

```bash
# Verify env vars are set inside the container
kubectl exec deploy/myapp -- env | sort
# CFG_DB_HOST=postgres
# CFG_DB_PORT=5432
# CFG_LOG_LEVEL=info
# CFG_CACHE_TTL=300
# ...
```

> **Gotcha:** `envFrom` skips keys that are not valid environment variable names (keys with dashes, dots, etc.). If your ConfigMap has a key like `app.properties`, it won't become an env var. Use volume mounts for config files.

### As Mounted Volumes

Mount a ConfigMap as a volume, and each key becomes a file in the mount path:

*deployment-volume.yaml*

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx
spec:
  replicas: 1
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
      - name: nginx
        image: nginx:1.25
        volumeMounts:
        - name: config-volume
          mountPath: /etc/nginx/conf.d
          readOnly: true
      volumes:
      - name: config-volume
        configMap:
          name: nginx-conf
```

```bash
kubectl apply -f deployment-volume.yaml

# Check the mounted files
kubectl exec deploy/nginx -- ls /etc/nginx/conf.d
# nginx.conf

kubectl exec deploy/nginx -- cat /etc/nginx/conf.d/nginx.conf
# worker_processes auto;
# events {
#     worker_connections 1024;
# }
# ...
```

You can also mount a single key to a specific file path:

*Mount a specific key*

```yaml
      volumes:
      - name: config-volume
        configMap:
          name: app-config
          items:
          - key: nginx.conf
            path: default.conf    # mounted as /etc/nginx/conf.d/default.conf
```

### Volume Mount Updates: The Propagation Rule

This is a critical behavior to understand -- it comes up in interviews and real operations.

```
┌────────────────────────────────────────────────────────────────┐
│                   ConfigMap Update Behavior                     │
│                                                                │
│  Environment Variables     Volume Mounts        subPath Mounts │
│  ──────────────────────    ─────────────────    ────────────── │
│  NOT updated               Updated              NOT updated    │
│  automatically             automatically         automatically │
│                            (~60-90 seconds)                    │
│                                                                │
│  Requires Pod restart      kubelet syncs         Requires Pod  │
│  to pick up changes        periodically          restart       │
└────────────────────────────────────────────────────────────────┘
```

*Demonstrating volume mount auto-update*

```bash
# Update the ConfigMap
kubectl edit configmap app-config
# Change LOG_LEVEL from "info" to "debug"

# Wait ~60 seconds, then check the mounted file
kubectl exec deploy/myapp -- cat /etc/config/LOG_LEVEL
# debug   ← updated automatically!

# But the env var is still the old value
kubectl exec deploy/myapp -- printenv LOG_LEVEL
# info    ← NOT updated (env vars are set at Pod start)
```

> **Gotcha:** If you mount a ConfigMap using `subPath`, the file does NOT get automatic updates. The `subPath` mount creates a direct bind mount instead of using a symlink, so the kubelet's update mechanism is bypassed. This catches people by surprise. If you need live updates, don't use `subPath`.

*subPath example (no auto-update)*

```yaml
      containers:
      - name: nginx
        image: nginx:1.25
        volumeMounts:
        - name: config-volume
          mountPath: /etc/nginx/conf.d/default.conf
          subPath: default.conf      # this file will NOT auto-update
      volumes:
      - name: config-volume
        configMap:
          name: nginx-conf
```

---

## Secrets

Secrets are structurally similar to ConfigMaps but intended for sensitive data: passwords, API tokens, TLS certificates, SSH keys.

### Secret Types

| Type | Use Case |
|------|----------|
| `Opaque` | Generic key-value pairs (default) |
| `kubernetes.io/tls` | TLS certificate + private key |
| `kubernetes.io/dockerconfigjson` | Docker registry credentials |
| `kubernetes.io/basic-auth` | Username + password |
| `kubernetes.io/ssh-auth` | SSH private key |
| `kubernetes.io/service-account-token` | ServiceAccount token (auto-created) |

### Creating Secrets Imperatively

*Generic (Opaque) Secret from literals*

```bash
kubectl create secret generic db-creds \
  --from-literal=username=admin \
  --from-literal=password='s3cret!P@ss'
# secret/db-creds created

kubectl get secret db-creds -o yaml
# apiVersion: v1
# kind: Secret
# metadata:
#   name: db-creds
# type: Opaque
# data:
#   password: czNjcmV0IVBAc3M=     ← base64 encoded
#   username: YWRtaW4=             ← base64 encoded
```

*From a file*

```bash
# Create a secret from a file (e.g., an API key file)
kubectl create secret generic api-key --from-file=api-key.txt
# secret/api-key created
```

*TLS Secret*

```bash
kubectl create secret tls my-tls-cert \
  --cert=tls.crt \
  --key=tls.key
# secret/my-tls-cert created

kubectl get secret my-tls-cert -o yaml
# apiVersion: v1
# kind: Secret
# metadata:
#   name: my-tls-cert
# type: kubernetes.io/tls
# data:
#   tls.crt: LS0tLS1CRUdJTi...    ← base64 encoded certificate
#   tls.key: LS0tLS1CRUdJTi...    ← base64 encoded private key
```

*Docker registry Secret*

```bash
kubectl create secret docker-registry regcred \
  --docker-server=ghcr.io \
  --docker-username=myuser \
  --docker-password=ghp_xxxxxxxxxxxx \
  --docker-email=me@example.com
# secret/regcred created
```

### Declarative Secret YAML

Secrets in YAML can use either `data` (base64-encoded values) or `stringData` (plain text that gets encoded on apply).

*Using data (base64-encoded)*

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: db-creds
type: Opaque
data:
  username: YWRtaW4=           # echo -n "admin" | base64
  password: czNjcmV0IVBAc3M=  # echo -n "s3cret!P@ss" | base64
```

```bash
# Encode values yourself:
echo -n "admin" | base64
# YWRtaW4=

echo -n "s3cret!P@ss" | base64
# czNjcmV0IVBAc3M=

# Decode to verify:
echo "YWRtaW4=" | base64 -d
# admin
```

*Using stringData (plain text -- the easier way)*

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: db-creds
type: Opaque
stringData:
  username: admin
  password: "s3cret!P@ss"
```

> **Tip:** `stringData` is write-only. When you `kubectl get secret -o yaml`, Kubernetes always shows `data` (base64-encoded). You can mix `data` and `stringData` in the same Secret -- `stringData` values override `data` values for the same key.

---

## Using Secrets

Secrets are consumed the same way as ConfigMaps: environment variables or volume mounts.

### As Environment Variables

*deployment-secret-env.yaml*

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
spec:
  replicas: 2
  selector:
    matchLabels:
      app: myapp
  template:
    metadata:
      labels:
        app: myapp
    spec:
      containers:
      - name: myapp
        image: myapp:v1
        env:
        - name: DB_USERNAME
          valueFrom:
            secretKeyRef:
              name: db-creds
              key: username
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: db-creds
              key: password
```

```bash
kubectl apply -f deployment-secret-env.yaml

# Verify the secrets are available inside the container
kubectl exec deploy/myapp -- printenv DB_USERNAME
# admin
kubectl exec deploy/myapp -- printenv DB_PASSWORD
# s3cret!P@ss
```

### As Mounted Volumes

Each key in the Secret becomes a file. The file contents are the decoded (plain text) value.

*deployment-secret-volume.yaml*

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
spec:
  replicas: 2
  selector:
    matchLabels:
      app: myapp
  template:
    metadata:
      labels:
        app: myapp
    spec:
      containers:
      - name: myapp
        image: myapp:v1
        volumeMounts:
        - name: db-creds
          mountPath: /etc/secrets
          readOnly: true
      volumes:
      - name: db-creds
        secret:
          secretName: db-creds
          defaultMode: 0400      # read-only for owner
```

```bash
kubectl apply -f deployment-secret-volume.yaml

# Each key is a file in /etc/secrets
kubectl exec deploy/myapp -- ls /etc/secrets
# password
# username

kubectl exec deploy/myapp -- cat /etc/secrets/username
# admin

kubectl exec deploy/myapp -- cat /etc/secrets/password
# s3cret!P@ss
```

> **Tip:** Set `defaultMode: 0400` on Secret volumes so only the container's user can read the files. This is a security best practice.

### imagePullSecrets for Private Registries

When your images are stored in a private registry, Pods need credentials to pull them. Use `imagePullSecrets`:

*deployment-private-image.yaml*

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
spec:
  replicas: 2
  selector:
    matchLabels:
      app: myapp
  template:
    metadata:
      labels:
        app: myapp
    spec:
      imagePullSecrets:
      - name: regcred              # the docker-registry Secret
      containers:
      - name: myapp
        image: ghcr.io/myorg/myapp:v1
```

You can also attach `imagePullSecrets` to a ServiceAccount so every Pod using that ServiceAccount gets them automatically:

```bash
kubectl patch serviceaccount default \
  -p '{"imagePullSecrets": [{"name": "regcred"}]}'
# serviceaccount/default patched

# Now all Pods in this namespace using the "default" SA
# can pull from ghcr.io without specifying imagePullSecrets
```

---

## Secrets Are NOT Encrypted

This is the single most important security concept in this module. base64 is **encoding**, not **encryption**. Anyone can decode it.

```bash
# "Decrypting" a Kubernetes Secret:
echo "czNjcmV0IVBAc3M=" | base64 -d
# s3cret!P@ss

# That's it. No key, no password, no algorithm. Just decode.
```

```
┌──────────────────────────────────────────────────────────────┐
│                  Secret Security Layers                       │
│                                                              │
│  Layer 1: RBAC                                               │
│  ├── Restrict who can read Secrets                           │
│  ├── kubectl get secret → requires "get" verb on "secrets"   │
│  └── Separate roles for ConfigMaps vs Secrets                │
│                                                              │
│  Layer 2: etcd Encryption at Rest                            │
│  ├── By default, Secrets stored in etcd in plain text!       │
│  ├── Enable EncryptionConfiguration on the API Server        │
│  └── Uses AES-CBC or AES-GCM encryption                     │
│                                                              │
│  Layer 3: Namespace Isolation                                │
│  ├── Secrets are namespaced — can't access across namespaces │
│  └── Use RBAC to limit namespace access                      │
│                                                              │
│  Layer 4: External Secret Management                         │
│  ├── Don't store Secrets in git (even base64!)               │
│  ├── Use Sealed Secrets, Vault, AWS Secrets Manager          │
│  └── Secrets are synced at runtime, not stored in manifests  │
│                                                              │
│  Layer 5: Audit Logging                                      │
│  └── Enable audit logs to track who accesses Secrets         │
└──────────────────────────────────────────────────────────────┘
```

### What You Must Do

**1. Enable etcd encryption at rest.** By default, `kubectl get secret -o yaml` and direct etcd access both expose secrets in plain text. Configure the API Server with an `EncryptionConfiguration`:

*encryption-config.yaml (on the control plane)*

```yaml
apiVersion: apiserver.config.k8s.io/v1
kind: EncryptionConfiguration
resources:
  - resources:
    - secrets
    providers:
    - aescbc:
        keys:
        - name: key1
          secret: <base64-encoded-32-byte-key>
    - identity: {}    # fallback: read unencrypted secrets
```

**2. Use RBAC to restrict Secret access.** Not every developer needs to `kubectl get secret`:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: secret-reader
  namespace: production
rules:
- apiGroups: [""]
  resources: ["secrets"]
  verbs: ["get"]
  resourceNames: ["db-creds"]    # only this specific secret
```

**3. Never commit Secrets to git.** Not even base64-encoded. Use `.gitignore`, git-secrets, or external secret management tools.

> **Gotcha:** If a Secret was ever committed to git, rotating the credential is not enough -- the old value lives in git history forever. You must rotate the credential AND scrub the git history (or accept the risk). Prevention is much easier than remediation.

---

## Immutable ConfigMaps and Secrets

Kubernetes lets you mark ConfigMaps and Secrets as immutable. Once set, the data cannot be changed -- you must delete and recreate the resource.

*immutable-configmap.yaml*

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config-v3
data:
  DB_HOST: prod-postgres.internal
  LOG_LEVEL: warn
immutable: true
```

```bash
kubectl apply -f immutable-configmap.yaml
# configmap/app-config-v3 created

# Try to modify it:
kubectl edit configmap app-config-v3
# error: configmaps "app-config-v3" is immutable

# Must delete and recreate:
kubectl delete configmap app-config-v3
kubectl apply -f immutable-configmap.yaml
```

*immutable-secret.yaml*

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: db-creds-v2
type: Opaque
stringData:
  username: admin
  password: "n3w-s3cret"
immutable: true
```

### Why Use Immutable?

- **Performance** -- the kubelet stops watching immutable ConfigMaps/Secrets for changes. At scale (thousands of Pods), this significantly reduces API Server load.
- **Safety** -- prevents accidental modifications that could break all Pods using the ConfigMap.
- **Versioned config** -- name your ConfigMaps with versions (`app-config-v3`) and update Deployments to reference the new version. This gives you clean rollbacks.

> **Tip:** A common pattern is to append a hash or version to ConfigMap names (`app-config-abc123`). Tools like Helm and Kustomize do this automatically. When the config changes, a new ConfigMap is created with a new name, and the Deployment is updated to reference it -- triggering a rolling update.

---

## External Secret Management

For production clusters, storing Secret manifests (even base64-encoded) in git is not acceptable. Several tools solve this problem.

### Sealed Secrets (Bitnami)

Sealed Secrets uses asymmetric encryption. You encrypt a Secret locally with a public key, and only the controller in the cluster can decrypt it with the private key.

```
                YOU                          CLUSTER
                 │                              │
   Secret YAML ──┤                              │
                 │  kubeseal                     │
                 ├────────▶ SealedSecret YAML ──┤
                 │          (safe for git!)      │
                 │                              ├──▶ SealedSecret Controller
                 │                              │         │
                 │                              │    decrypts with
                 │                              │    private key
                 │                              │         │
                 │                              │         ▼
                 │                              │    creates regular
                 │                              │    Secret in cluster
```

```bash
# Install kubeseal CLI and the controller
helm repo add sealed-secrets https://bitnami-labs.github.io/sealed-secrets
helm install sealed-secrets sealed-secrets/sealed-secrets -n kube-system

# Seal a secret
kubectl create secret generic db-creds \
  --from-literal=password=s3cret \
  --dry-run=client -o yaml | kubeseal -o yaml > sealed-secret.yaml

# The sealed-secret.yaml is safe to commit to git!
kubectl apply -f sealed-secret.yaml
# The controller decrypts it and creates the real Secret
```

### External Secrets Operator

The External Secrets Operator syncs secrets from external providers (AWS Secrets Manager, HashiCorp Vault, GCP Secret Manager, Azure Key Vault) into Kubernetes Secrets.

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: db-creds
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secrets-manager
    kind: SecretStore
  target:
    name: db-creds            # the K8s Secret to create
  data:
  - secretKey: password       # key in the K8s Secret
    remoteRef:
      key: prod/database      # path in AWS Secrets Manager
      property: password      # field within the secret
```

The operator reads `prod/database` from AWS Secrets Manager and creates a regular Kubernetes Secret named `db-creds`. It re-syncs every hour.

### HashiCorp Vault

Vault provides dynamic secrets, leasing, and revocation. Integration options include:

- **Vault Agent Sidecar Injector** -- injects an init container and sidecar that fetch secrets from Vault and write them to a shared volume
- **Vault CSI Provider** -- mounts Vault secrets as volumes via the Secrets Store CSI Driver
- **External Secrets Operator** -- the same operator above can sync from Vault

> **Tip:** For most teams, start with Sealed Secrets (simplest to set up). Move to External Secrets Operator when you need central secret management across multiple clusters. Use Vault when you need dynamic secrets, secret rotation, and audit trails.

---

## Hands-On: Full ConfigMap + Secret Deployment

Let's put everything together. We will create a ConfigMap and Secret, deploy an application that uses both via environment variables and volume mounts, then update the ConfigMap and observe live propagation.

### Step 1: Create the ConfigMap

*app-config.yaml*

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: webapp-config
data:
  APP_ENV: production
  APP_PORT: "8080"
  LOG_LEVEL: info
  config.json: |
    {
      "features": {
        "dark_mode": true,
        "beta_api": false
      },
      "cache_ttl": 300
    }
```

```bash
kubectl apply -f app-config.yaml
# configmap/webapp-config created
```

### Step 2: Create the Secret

*app-secret.yaml*

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: webapp-secret
type: Opaque
stringData:
  DB_USERNAME: webapp_user
  DB_PASSWORD: "p@ssw0rd!2024"
  API_KEY: "sk-abc123def456ghi789"
```

```bash
kubectl apply -f app-secret.yaml
# secret/webapp-secret created
```

### Step 3: Deploy the Application

This Deployment uses both env vars and volume mounts:

*webapp-deployment.yaml*

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: webapp
spec:
  replicas: 2
  selector:
    matchLabels:
      app: webapp
  template:
    metadata:
      labels:
        app: webapp
    spec:
      containers:
      - name: webapp
        image: busybox:1.36
        command: ["/bin/sh", "-c"]
        args:
        - |
          echo "=== Environment Variables ==="
          echo "APP_ENV=$APP_ENV"
          echo "LOG_LEVEL=$LOG_LEVEL"
          echo "DB_USERNAME=$DB_USERNAME"
          echo "DB_PASSWORD is set: $([ -n "$DB_PASSWORD" ] && echo yes || echo no)"
          echo ""
          echo "=== Mounted Config File ==="
          cat /etc/config/config.json
          echo ""
          echo "=== Mounted Secret Files ==="
          ls -la /etc/secrets/
          echo ""
          echo "App running. Sleeping..."
          while true; do sleep 3600; done
        # Environment variables from ConfigMap
        envFrom:
        - configMapRef:
            name: webapp-config
        # Environment variables from Secret
        env:
        - name: DB_USERNAME
          valueFrom:
            secretKeyRef:
              name: webapp-secret
              key: DB_USERNAME
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: webapp-secret
              key: DB_PASSWORD
        # Volume mounts
        volumeMounts:
        - name: config-files
          mountPath: /etc/config
          readOnly: true
        - name: secret-files
          mountPath: /etc/secrets
          readOnly: true
      volumes:
      - name: config-files
        configMap:
          name: webapp-config
          items:
          - key: config.json
            path: config.json
      - name: secret-files
        secret:
          secretName: webapp-secret
          defaultMode: 0400
```

```bash
kubectl apply -f webapp-deployment.yaml
# deployment.apps/webapp created

# Wait for Pods to be ready
kubectl rollout status deployment/webapp
# deployment "webapp" successfully rolled out

# Check the logs to see the config in action
kubectl logs deploy/webapp
# === Environment Variables ===
# APP_ENV=production
# LOG_LEVEL=info
# DB_USERNAME=webapp_user
# DB_PASSWORD is set: yes
#
# === Mounted Config File ===
# {
#   "features": {
#     "dark_mode": true,
#     "beta_api": false
#   },
#   "cache_ttl": 300
# }
#
# === Mounted Secret Files ===
# total 0
# lrwxrwxrwx 1 root root 15 ... API_KEY -> ..data/API_KEY
# lrwxrwxrwx 1 root root 18 ... DB_PASSWORD -> ..data/DB_PASSWORD
# lrwxrwxrwx 1 root root 18 ... DB_USERNAME -> ..data/DB_USERNAME
#
# App running. Sleeping...
```

### Step 4: Update the ConfigMap and Watch Propagation

```bash
# Update the ConfigMap -- change LOG_LEVEL and the config.json feature flag
kubectl patch configmap webapp-config --type merge -p '{
  "data": {
    "LOG_LEVEL": "debug",
    "config.json": "{\n  \"features\": {\n    \"dark_mode\": true,\n    \"beta_api\": true\n  },\n  \"cache_ttl\": 600\n}"
  }
}'
# configmap/webapp-config patched

# Wait ~60 seconds for the kubelet to sync the mounted file
sleep 60

# The mounted file has the NEW value:
kubectl exec deploy/webapp -- cat /etc/config/config.json
# {
#   "features": {
#     "dark_mode": true,
#     "beta_api": true         ← changed!
#   },
#   "cache_ttl": 600           ← changed!
# }

# But the environment variable still has the OLD value:
kubectl exec deploy/webapp -- printenv LOG_LEVEL
# info    ← still "info", not "debug"

# To pick up env var changes, you need to restart the Pods:
kubectl rollout restart deployment/webapp
# deployment.apps/webapp restarted

kubectl exec deploy/webapp -- printenv LOG_LEVEL
# debug   ← now updated
```

### Step 5: Clean Up

```bash
kubectl delete deployment webapp
kubectl delete configmap webapp-config
kubectl delete secret webapp-secret
# deployment.apps "webapp" deleted
# configmap "webapp-config" deleted
# secret "webapp-secret" deleted
```

### Quick Reference: ConfigMap vs Secret

| Feature | ConfigMap | Secret |
|---------|-----------|--------|
| Purpose | Non-sensitive config | Sensitive data |
| Data format | Plain text | base64-encoded (or stringData) |
| Size limit | 1 MiB | 1 MiB |
| Env vars | `configMapKeyRef` / `configMapRef` | `secretKeyRef` |
| Volume mount | `configMap:` volume | `secret:` volume |
| Automatic updates | Volume mounts: yes, env vars: no | Volume mounts: yes, env vars: no |
| Encryption at rest | No (not needed) | No by default (must enable) |
| RBAC | Same as other resources | Should be restricted |

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

## Module 9 Summary

- **Separate config from code** -- the 12-factor app principle. Same image across all environments, only ConfigMaps and Secrets change.
- **ConfigMaps** hold non-sensitive configuration as key-value pairs. Create from literals, files, directories, or declarative YAML.
- **Consume ConfigMaps** as environment variables (`configMapKeyRef` for single keys, `envFrom` for all keys) or as mounted volumes (each key becomes a file).
- **Volume-mounted ConfigMaps auto-update** (~60-90 seconds) when the ConfigMap changes. Environment variables do NOT update -- you must restart the Pod.
- **subPath mounts do NOT auto-update** -- the kubelet bypasses its symlink-based update mechanism for subPath volumes.
- **Secrets** store sensitive data (passwords, tokens, TLS certs). Types include Opaque, TLS, docker-registry, basic-auth, and SSH.
- **Secrets use base64 encoding, NOT encryption.** Anyone who can read the Secret can decode it instantly.
- **Enable etcd encryption at rest**, restrict Secret access with RBAC, and never commit Secrets to git.
- **Use `stringData`** in Secret YAML to write plain text values -- Kubernetes encodes them for you on apply.
- **`imagePullSecrets`** let Pods pull from private container registries. Attach them to ServiceAccounts for namespace-wide access.
- **Immutable ConfigMaps and Secrets** (`immutable: true`) prevent changes, improve kubelet performance at scale, and encourage versioned config patterns.
- **External secret management** tools (Sealed Secrets, External Secrets Operator, Vault) solve the problem of storing secrets safely in git and syncing from external providers.
