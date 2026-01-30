## Project 7: Monitoring Stack

### What You'll Build

Deploy a full monitoring stack (Prometheus + Grafana) using Helm charts, configure scraping for your applications, and build a dashboard. The standard observability setup for any K8s cluster.

### What You'll Do

1. Add the prometheus-community Helm repo
2. Install kube-prometheus-stack with custom values (retention, storage, resource limits)
3. Explore the default dashboards in Grafana
4. Deploy a sample app with a /metrics endpoint
5. Create a ServiceMonitor to tell Prometheus to scrape it
6. Write a PromQL query to visualize request rate
7. Set up an alert rule for high error rate
8. Export the Grafana dashboard as JSON, store in a ConfigMap

### Concepts Applied

- Installing and configuring Helm charts with values overrides
- Prometheus scraping and ServiceMonitors
- PromQL basics
- Grafana dashboards and alerting
- Helm values customization for production

---

*Content coming soon.* This project gives you hands-on experience with the standard K8s monitoring stack. Every production cluster runs Prometheus + Grafana — this project teaches you to set it up and use it.
