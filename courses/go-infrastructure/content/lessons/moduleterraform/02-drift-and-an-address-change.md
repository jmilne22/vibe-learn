## Observe drift, then move an address

Work in the copied `$LAB_ROOT/terraform` directory, not in another project's Terraform checkout. The only managed object is a generated local file. The complete starting configuration is in the file-reference section.

```sh
cd "$LAB_ROOT/terraform"
terraform version
terraform init
terraform fmt -check
terraform validate
terraform plan -out=create.tfplan
terraform apply create.tfplan
terraform state list
cat generated-config.json
```

Expect `local_file.config` in state and JSON containing service `endpoint-lab` and port 8080. Read the generated `.terraform.lock.hcl`: it records the selected provider and checksums. In a real repository, commit that lock file, not the `.terraform/` installation directory or state.

### Change the object outside Terraform

```sh
printf 'changed outside Terraform\n' > generated-config.json
terraform plan
```

With local provider 2.7.0, this content change makes the previously recorded file identity no longer match. The plan proposes creating the configured file again. Do not expect a generic in-place update just because the path still exists. Provider behavior matters.

Compare desired JSON, actual file contents, and state. Then run `terraform apply`, review its proposal, and approve restoration. The file returns to the configured JSON.

This lab uses a file because it is cheap and inspectable. A cloud API can have eventual consistency, permission errors, rate limits, and destructive replacement effects that this exercise does not simulate.

### Rename a resource without moving its state

In main.tf, rename the resource's local name from `config` to `settings`. Update the output reference from `local_file.config.filename` to `local_file.settings.filename`. Do not change the filename or content.

```sh
terraform plan
```

Expect one destroy and one create: the old address disappeared and a new one appeared. Do **not** apply this intermediate plan. Matching file paths do not automatically tell Terraform these addresses are the same object.

Add:

```hcl
moved {
  from = local_file.config
  to   = local_file.settings
}
```

Now:

```sh
terraform plan -out=move.tfplan
terraform apply move.tfplan
terraform state list
```

Expect a move and zero resource creates/changes/destroys. State now contains `local_file.settings`; the file remains. Keep moved blocks when downstream users may still upgrade from an older configuration. A moved block communicates a supported address transition; it is not a workaround for arbitrary incompatible resource types.

### Where import fits

Import associates an existing object with a Terraform address, when the resource supports it. Read the plan afterward: differences between the configuration and the imported object can still cause changes or replacement.

### Clean up

```sh
terraform plan -destroy -out=destroy.tfplan
terraform apply destroy.tfplan
```

The generated file should disappear. The lab directory still contains configuration and Terraform working files. Remove the directory when you no longer need it. Do not copy its state or saved plans into your normal infrastructure repository.

References: [resource drift](https://developer.hashicorp.com/terraform/tutorials/state/resource-drift), [refactoring with moved blocks](https://developer.hashicorp.com/terraform/language/modules/develop/refactoring), [local provider](https://registry.terraform.io/providers/hashicorp/local/2.7.0/docs/resources/file).
