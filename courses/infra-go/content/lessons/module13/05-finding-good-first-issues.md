## Finding Good First Issues

### Where to Look

| Project | Good First Issues |
|---|---|
| Kubernetes | `good-first-issue` label in k8s.io repos |
| Terraform | `good first issue` label on provider repos |
| Prometheus | `difficulty/easy` label |
| containerd | `good first issue` label |
| CoreDNS | `good first issue` label |

Start with **provider repos** (terraform-provider-aws, etc.) and **tools** rather than core infrastructure. Provider repos are smaller, better documented, and more welcoming.

### What Makes a Good First Contribution

In order of difficulty:

1. **Documentation fixes** — typos, clarifications, examples
2. **Test additions** — add tests for untested paths
3. **Small bug fixes** — well-scoped issues with clear reproduction
4. **Minor features** — adding a field to an existing resource
5. **Refactoring** — only if explicitly requested in an issue

### Before You Touch Code

1. Read `CONTRIBUTING.md` — every project has one
2. Read the Developer Certificate of Origin (DCO) — many CNCF projects require sign-off
3. Check if someone else is already working on the issue
4. Comment on the issue: "I'd like to work on this. Here's my approach..."
