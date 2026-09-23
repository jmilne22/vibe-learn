## Read the plan before changing infrastructure

Terraform combines configuration, state, and provider observations. Treating state as a copy of the configuration makes its behavior confusing.

**Configuration** describes the intended resources and expressions. **State** associates Terraform resource addresses with provider-managed objects and records attributes. **Refresh** asks providers about those objects. **Plan** proposes changes needed to reconcile the observed objects with the configuration.

A resource address such as `local_file.config` is Terraform's name for an object. The underlying object in our lab is a file path. Renaming the resource block can change the address without changing the intended file. Terraform needs to be told whether that means a rename or a new object.

### Begin with one resource

```hcl
resource "local_file" "config" {
  filename        = "${path.module}/generated-config.json"
  content         = jsonencode({ service = "endpoint-lab", port = 8080 })
  file_permission = "0600"
}
```

`local_file` is a resource type supplied by a provider. `config` is the local name. `path.module` refers to the module directory. `jsonencode` handles quoting and JSON encoding; hand-built strings make escaping harder to review.

A provider is a plugin that understands a resource API. The local provider manipulates local files; cloud providers call cloud APIs. Pin the provider version and commit its dependency lock file. Pinning Terraform itself is a separate choice from pinning a provider.

### Follow dependencies through references

```hcl
output "config_path" {
  value = local_file.config.filename
}
```

This expression references the resource. Terraform uses references to understand dependencies. Declaration order in the file does not determine creation order. Reach for explicit `depends_on` only when the dependency is real but not expressed by ordinary references.

Variables provide inputs, outputs expose selected results, and a module groups configuration. A directory containing these files is already a root module; a module is not synonymous with something downloaded from a registry.

### Read the actions, not just the total

A plan may propose create, update, destroy, or replacement. Replacement means an object will be recreated; for a database or persistent volume, that has very different consequences from changing a label. Read the attributes forcing the change and the dependency effects.

A speculative plan is an observation at a point in time. `terraform plan -out=change.tfplan` saves an executable plan; `terraform apply change.tfplan` applies that plan rather than silently inventing another one. Plan/state files may contain secrets, even when command output redacts them. Do not treat them as ordinary public debug attachments.

### State is shared coordination data

A local state file is enough for one disposable lab. Teams usually need a remote backend, access control, recovery/versioning, and locking where the backend supports it. A backend does not automatically configure all of those correctly.

Separate permissions for reading state, planning changes, and applying infrastructure where the tools permit it. A credential that can modify every customer account creates a large failure boundary. In a BYOC model, also ask how credentials are scoped, renewed, and revoked when a customer disconnects.

References: [Terraform state](https://developer.hashicorp.com/terraform/language/state), [resource dependencies](https://developer.hashicorp.com/terraform/language/expressions/references), and [dependency lock files](https://developer.hashicorp.com/terraform/language/files/dependency-lock).
