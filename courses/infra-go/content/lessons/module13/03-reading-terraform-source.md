## Reading Terraform Source

### Repository Structure

`hashicorp/terraform`:

| Directory | What's There |
|---|---|
| `command/` | CLI commands (plan, apply, init) |
| `internal/terraform/` | Core Terraform engine |
| `internal/states/` | State management |
| `internal/plans/` | Plan generation |
| `internal/providers/` | Provider interface |

### How Plan/Apply Works

```
terraform plan
  → command/plan.go
    → internal/terraform/context.go (Plan method)
      → Builds a dependency graph of resources
      → Walks the graph, comparing desired vs current state
      → For each resource: calls provider.PlanResourceChange()
      → Outputs a plan diff

terraform apply
  → Takes the plan
  → Walks the graph again
  → For each resource: calls provider.ApplyResourceChange()
  → Updates state file
```

### How Providers Work

Providers are separate binaries that communicate via gRPC (Module 9!):

```go
// A Terraform provider implements this interface:
type Provider interface {
    GetSchema() providers.GetSchemaResponse
    PlanResourceChange(providers.PlanResourceChangeRequest) providers.PlanResourceChangeResponse
    ApplyResourceChange(providers.ApplyResourceChangeRequest) providers.ApplyResourceChangeResponse
    ReadResource(providers.ReadResourceRequest) providers.ReadResourceResponse
    // ...
}
```

This is why you can write a Terraform provider in Go — it's just a gRPC server.
