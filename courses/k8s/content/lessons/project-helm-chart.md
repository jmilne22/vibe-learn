## Project 3: Build a Helm Chart

### What You'll Build

Package the Project 1 microservices app as a production-quality Helm chart with configurable values, environment overrides, helper templates, and chart tests.

### Concepts Applied

- Chart scaffolding with helm create
- values.yaml with sensible defaults
- Environment overrides: values-dev.yaml, values-staging.yaml, values-prod.yaml
- Named templates in _helpers.tpl (fullname, labels, selectorLabels)
- Conditionals: optional Ingress, optional PDB, optional HPA
- Range loops for multiple containers or environment variables
- Subcharts: PostgreSQL as a dependency (Bitnami chart)
- Chart tests with helm test

### Chart Structure

```
myapp/
├── Chart.yaml
├── values.yaml
├── values-dev.yaml
├── values-staging.yaml
├── values-prod.yaml
├── templates/
│   ├── _helpers.tpl
│   ├── deployment-frontend.yaml
│   ├── deployment-api.yaml
│   ├── service-frontend.yaml
│   ├── service-api.yaml
│   ├── ingress.yaml
│   ├── configmap.yaml
│   ├── secret.yaml
│   └── tests/
│       └── test-connection.yaml
└── charts/           (PostgreSQL subchart)
```

---

*Content coming soon.* This project will take the raw manifests from Project 1 and transform them into a reusable, configurable Helm chart. You'll learn the patterns that make charts maintainable across environments.
